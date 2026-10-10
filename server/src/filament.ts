import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MaterialId } from './types.ts';

/**
 * Filamentlagret: rullarna i verkstaden och vad som gått åt.
 *
 * En rulle är en fysisk sak med ett visst antal gram kvar, inte ett saldo per
 * material – två rullar svart PLA tar slut var för sig, och det är rullen man
 * byter. Därför ligger de som rader med id.
 *
 * Åtgången bokförs när ordern går i produktion, en gång per order. Att bokföra
 * samma order två gånger vore att tro att plasten tog slut dubbelt upp, så
 * `consume` är idempotent på ordernumret.
 *
 * Saknas det plast bokförs åtgången ändå och bristen rapporteras. Verkstaden
 * ska inte hindras av bokföringen – men den ska se att en rulle behöver bytas.
 */

const FILAMENT_FILE = () => resolve(process.env.FILAMENT_STORE ?? 'data/filament.json');

/** Rullar med mindre än så här kvar flaggas i panelen. */
export function lowFilamentGrams(): number {
  const raw = Number(process.env.LOW_FILAMENT_GRAMS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 250;
}

export interface Spool {
  id: string;
  material: MaterialId;
  color: string;
  /** Gram kvar på rullen. */
  grams: number;
  /** Gram rullen vägde när den var ny, så andelen kvar går att visa. */
  totalGrams: number;
  addedAt: string;
  note?: string;
}

export interface Consumption {
  orderId: string;
  at: string;
  items: Array<{ material: MaterialId; color: string; grams: number }>;
  /** Gram som inte fanns på någon rulle. Noll när lagret räckte. */
  shortfall: number;
}

interface FilamentStore {
  spools: Spool[];
  consumed: Consumption[];
}

let cache: FilamentStore | null = null;
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function resetFilamentCache(): void {
  cache = null;
}

async function load(): Promise<FilamentStore> {
  if (cache) return cache;
  try {
    const raw = await readFile(FILAMENT_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<FilamentStore>;
    cache = {
      spools: Array.isArray(parsed.spools) ? parsed.spools : [],
      consumed: Array.isArray(parsed.consumed) ? parsed.consumed : [],
    };
  } catch {
    cache = { spools: [], consumed: [] };
  }
  return cache;
}

async function persist(store: FilamentStore): Promise<void> {
  cache = store;
  await mkdir(dirname(FILAMENT_FILE()), { recursive: true });
  await writeFile(FILAMENT_FILE(), JSON.stringify(store, null, 2), 'utf8');
}

export class FilamentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilamentError';
  }
}

export interface SpoolInput {
  material: unknown;
  color: unknown;
  grams: unknown;
  totalGrams?: unknown;
  note?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Läser en rulle ur panelens formulär. Materialet kontrolleras mot katalogen av
 * anroparen, som är den som vet vilka material som finns.
 */
export function parseSpoolInput(
  input: SpoolInput,
  materials: string[],
): Omit<Spool, 'id' | 'addedAt'> {
  const material = text(input.material);
  if (!materials.includes(material)) throw new FilamentError('Välj ett material som finns.');

  const color = text(input.color);
  if (color.length < 2) throw new FilamentError('Rullen behöver en färg.');

  const grams = Number(input.grams);
  if (!Number.isFinite(grams) || grams < 0)
    throw new FilamentError('Ange hur många gram som är kvar.');

  const totalRaw = Number(input.totalGrams);
  const totalGrams = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : Math.max(grams, 1000);
  if (grams > totalGrams) throw new FilamentError('Det kan inte vara mer kvar än rullen vägde ny.');

  const note = text(input.note);
  return {
    material: material as MaterialId,
    color,
    grams: Math.round(grams),
    totalGrams: Math.round(totalGrams),
    ...(note ? { note: note.slice(0, 200) } : {}),
  };
}

export async function allSpools(): Promise<Spool[]> {
  const store = await load();
  // Minst kvar först: det är den rullen som behöver bytas.
  return [...store.spools].sort((a, b) => a.grams - b.grams);
}

export async function addSpool(input: Omit<Spool, 'id' | 'addedAt'>): Promise<Spool> {
  return serialize(async () => {
    const store = await load();
    const spool: Spool = { ...input, id: randomUUID(), addedAt: new Date().toISOString() };
    await persist({ ...store, spools: [...store.spools, spool] });
    return spool;
  });
}

/** Rättar en rulle efter en vägning, eller byter färg på en felregistrerad. */
export async function updateSpool(
  id: string,
  patch: Partial<Omit<Spool, 'id' | 'addedAt'>>,
): Promise<Spool | undefined> {
  return serialize(async () => {
    const store = await load();
    const index = store.spools.findIndex((spool) => spool.id === id);
    if (index === -1) return undefined;

    const current = store.spools[index]!;
    const next: Spool = { ...current, ...patch };
    next.grams = Math.max(0, Math.min(Math.round(next.grams), next.totalGrams));
    const spools = [...store.spools];
    spools[index] = next;
    await persist({ ...store, spools });
    return next;
  });
}

export async function removeSpool(id: string): Promise<boolean> {
  return serialize(async () => {
    const store = await load();
    const spools = store.spools.filter((spool) => spool.id !== id);
    if (spools.length === store.spools.length) return false;
    await persist({ ...store, spools });
    return true;
  });
}

/** Gram kvar per material och färg, summerat över rullarna. */
export function stockByMaterial(spools: Spool[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const spool of spools) {
    const key = `${spool.material}|${spool.color}`;
    totals.set(key, (totals.get(key) ?? 0) + spool.grams);
  }
  return totals;
}

/**
 * Drar av åtgången för en order. Rullen med minst kvar töms först – halvtomma
 * rullar ska bli tomma, inte ligga kvar och vara halvtomma för alltid.
 *
 * Färgen matchas i första hand exakt; finns den inte tas plast ur rätt material
 * oavsett färg, eftersom verkstaden då har bytt till något som liknar.
 */
export async function consume(
  orderId: string,
  items: Array<{ material: MaterialId; color: string; grams: number }>,
): Promise<Consumption> {
  return serialize(async () => {
    const store = await load();
    const already = store.consumed.find((entry) => entry.orderId === orderId);
    if (already) return already;

    const spools = store.spools.map((spool) => ({ ...spool }));
    let shortfall = 0;

    for (const item of items) {
      let left = Math.round(item.grams);
      const exact = spools.filter((s) => s.material === item.material && s.color === item.color);
      const sameMaterial = spools.filter(
        (s) => s.material === item.material && s.color !== item.color,
      );
      for (const spool of [...exact, ...sameMaterial].sort((a, b) => a.grams - b.grams)) {
        if (left <= 0) break;
        const taken = Math.min(spool.grams, left);
        spool.grams -= taken;
        left -= taken;
      }
      shortfall += Math.max(0, left);
    }

    const entry: Consumption = {
      orderId,
      at: new Date().toISOString(),
      items: items.map((item) => ({ ...item, grams: Math.round(item.grams) })),
      shortfall: Math.round(shortfall),
    };
    await persist({ spools, consumed: [...store.consumed, entry] });
    return entry;
  });
}

export async function consumption(orderId: string): Promise<Consumption | undefined> {
  return (await load()).consumed.find((entry) => entry.orderId === orderId);
}

export async function consumptionLog(limit = 50): Promise<Consumption[]> {
  const store = await load();
  return [...store.consumed].reverse().slice(0, limit);
}

export interface FilamentShortage {
  material: MaterialId;
  color: string;
  /** Gram kön kräver. */
  needed: number;
  /** Gram som finns i rätt material, oavsett färg. */
  available: number;
}

/**
 * Vad kön kräver som lagret inte räcker till. Jämförelsen görs per material,
 * inte per färg: har verkstaden rätt plast men fel färg är det ett val, inte
 * ett stopp.
 */
export function shortages(
  demand: Array<{ material: MaterialId; color: string; grams: number }>,
  spools: Spool[],
): FilamentShortage[] {
  const available = new Map<string, number>();
  for (const spool of spools) {
    available.set(spool.material, (available.get(spool.material) ?? 0) + spool.grams);
  }

  const needed = new Map<string, { material: MaterialId; colors: Set<string>; grams: number }>();
  for (const entry of demand) {
    const current = needed.get(entry.material) ?? {
      material: entry.material,
      colors: new Set<string>(),
      grams: 0,
    };
    current.colors.add(entry.color);
    current.grams += entry.grams;
    needed.set(entry.material, current);
  }

  const result: FilamentShortage[] = [];
  for (const entry of needed.values()) {
    const have = available.get(entry.material) ?? 0;
    if (entry.grams > have) {
      result.push({
        material: entry.material,
        color: [...entry.colors].join(', '),
        needed: Math.round(entry.grams),
        available: Math.round(have),
      });
    }
  }
  // Störst underskott först – det är den rullen som måste beställas i dag.
  return result.sort((a, b) => b.needed - b.available - (a.needed - a.available));
}
