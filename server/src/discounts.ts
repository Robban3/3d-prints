import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { AppliedDiscount } from './shipping.ts';

/**
 * Rabattkoder, redigerbara i panelen.
 *
 * Koden som kommer från kunden är bara en nyckel – beloppet räknas alltid om
 * här på servern. Klienten får aldrig tala om hur stor rabatten är, för då
 * skulle vem som helst kunna skriva sin egen.
 *
 * Räknaren över antal användningar ökas innan betalningen görs och backas om
 * något går fel, precis som lagersaldot. Annars kan en kod med en användning
 * kvar lösas in två gånger av två kunder samtidigt.
 */

const STORE = () => resolve(process.env.DISCOUNT_STORE ?? 'data/rabatter.json');

export type DiscountKind = 'procent' | 'kronor';

export interface DiscountCode {
  /** Versaler utan blanksteg – så kunden slipper bry sig om skiftläge. */
  code: string;
  description: string;
  kind: DiscountKind;
  /** Procent (1–90) eller kronor, beroende på kind. */
  value: number;
  /** Lägsta ordervärde före rabatt. 0 = ingen gräns. */
  minSubtotal: number;
  /** Koden gäller från och till dessa datum, om de är satta. */
  startsAt?: string;
  endsAt?: string;
  /** Högsta antal inlösen. 0 = obegränsat. */
  maxUses: number;
  uses: number;
  /** Ger fri frakt oavsett ordervärde. */
  freeShipping: boolean;
  active: boolean;
  createdAt: string;
}

export class DiscountError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('Rabattkoden kunde inte sparas');
    this.name = 'DiscountError';
    this.fields = fields;
  }
}

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<DiscountCode[]> {
  try {
    const raw = await readFile(STORE(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiscountCode[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(codes: DiscountCode[]): Promise<void> {
  await mkdir(dirname(STORE()), { recursive: true });
  await writeFile(STORE(), JSON.stringify(codes, null, 2), 'utf8');
}

/** Koden skrivs och jämförs alltid i versaler utan blanksteg. */
export function normalizeCode(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function date(value: unknown, field: string, errors: Record<string, string>): string | undefined {
  const raw = text(value);
  if (raw.length === 0) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    errors[field] = 'Ange ett datum på formen 2026-12-24.';
    return undefined;
  }
  return parsed.toISOString();
}

export function parseDiscountInput(input: unknown, existing?: DiscountCode): DiscountCode {
  const raw = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const code = normalizeCode(existing?.code ?? raw.code);
  if (!/^[A-ZÅÄÖ0-9][A-ZÅÄÖ0-9-]{2,23}$/.test(code)) {
    errors.code = 'Koden ska vara 3–24 tecken: bokstäver, siffror och bindestreck.';
  }

  const kind: DiscountKind = raw.kind === 'kronor' ? 'kronor' : 'procent';
  const value = Number(raw.value);
  if (kind === 'procent') {
    if (!(value >= 1 && value <= 90)) errors.value = 'Procentsatsen ska vara mellan 1 och 90.';
  } else if (!(value >= 1 && value <= 100000)) {
    errors.value = 'Beloppet ska vara mellan 1 och 100 000 kr.';
  }

  const description = text(raw.description);
  if (description.length < 3) errors.description = 'Beskriv kort vad koden är till för.';

  const minSubtotal = raw.minSubtotal === undefined ? 0 : Number(raw.minSubtotal);
  if (!(minSubtotal >= 0 && minSubtotal <= 1000000)) {
    errors.minSubtotal = 'Lägsta ordervärde kan inte vara negativt.';
  }

  const maxUses = raw.maxUses === undefined ? 0 : Number(raw.maxUses);
  if (!Number.isInteger(maxUses) || maxUses < 0) {
    errors.maxUses = 'Antal användningar ska vara 0 (obegränsat) eller fler.';
  }

  const startsAt = date(raw.startsAt, 'startsAt', errors);
  const endsAt = date(raw.endsAt, 'endsAt', errors);
  if (startsAt && endsAt && startsAt >= endsAt) {
    errors.endsAt = 'Slutdatumet måste ligga efter startdatumet.';
  }

  // En redan inlöst kod får inte få ett tak under det som redan använts.
  const uses = existing?.uses ?? 0;
  if (!errors.maxUses && maxUses > 0 && maxUses < uses) {
    errors.maxUses = `Koden är redan inlöst ${uses} gånger, så taket kan inte vara lägre.`;
  }

  if (Object.keys(errors).length > 0) throw new DiscountError(errors);

  return {
    code,
    description,
    kind,
    value: Math.round(value * 100) / 100,
    minSubtotal: Math.round(minSubtotal),
    maxUses,
    uses,
    freeShipping: raw.freeShipping === true,
    active: raw.active !== false,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
  };
}

export async function allDiscounts(): Promise<DiscountCode[]> {
  return (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findDiscount(code: unknown): Promise<DiscountCode | undefined> {
  const wanted = normalizeCode(code);
  if (wanted.length === 0) return undefined;
  return (await readAll()).find((entry) => entry.code === wanted);
}

export function saveDiscount(input: unknown, existingCode?: string): Promise<DiscountCode> {
  return serialize(async () => {
    const codes = await readAll();
    const existing = existingCode
      ? codes.find((entry) => entry.code === normalizeCode(existingCode))
      : undefined;
    if (existingCode && !existing) throw new DiscountError({ code: 'Koden finns inte.' });

    const parsed = parseDiscountInput(input, existing);
    if (!existing && codes.some((entry) => entry.code === parsed.code)) {
      throw new DiscountError({ code: 'Det finns redan en kod med det namnet.' });
    }

    const index = existing ? codes.findIndex((entry) => entry.code === existing.code) : -1;
    if (index >= 0) codes[index] = parsed;
    else codes.push(parsed);
    await writeAll(codes);
    return parsed;
  });
}

export function removeDiscount(code: string): Promise<DiscountCode | undefined> {
  return serialize(async () => {
    const codes = await readAll();
    const index = codes.findIndex((entry) => entry.code === normalizeCode(code));
    if (index < 0) return undefined;
    const [removed] = codes.splice(index, 1);
    await writeAll(codes);
    return removed;
  });
}

export interface DiscountVerdict {
  ok: boolean;
  /** Varför koden inte gäller, i klartext till kunden. */
  reason?: string;
  applied?: AppliedDiscount & { code: string; label: string };
}

/**
 * Avgör om en kod gäller för ett visst ordervärde, och hur mycket den ger.
 * Rent uträknande: ingenting skrivs, så samma svar går att hämta hur ofta som helst.
 */
export function evaluateDiscount(
  discount: DiscountCode | undefined,
  subtotal: number,
  now: Date = new Date(),
): DiscountVerdict {
  if (!discount) return { ok: false, reason: 'Vi hittar ingen rabattkod med det namnet.' };
  if (!discount.active) return { ok: false, reason: 'Den koden är inte längre giltig.' };

  const stamp = now.toISOString();
  if (discount.startsAt && stamp < discount.startsAt) {
    return { ok: false, reason: 'Den koden har inte börjat gälla än.' };
  }
  if (discount.endsAt && stamp > discount.endsAt) {
    return { ok: false, reason: 'Den koden har gått ut.' };
  }
  if (discount.maxUses > 0 && discount.uses >= discount.maxUses) {
    return { ok: false, reason: 'Den koden är slutanvänd.' };
  }
  if (subtotal < discount.minSubtotal) {
    return {
      ok: false,
      reason: `Koden gäller från ${discount.minSubtotal} kr. Du behöver handla för ${discount.minSubtotal - subtotal} kr mer.`,
    };
  }

  const amount =
    discount.kind === 'procent'
      ? Math.round((subtotal * discount.value) / 100)
      : Math.min(subtotal, Math.round(discount.value));

  return {
    ok: true,
    applied: {
      code: discount.code,
      label: labelFor(discount),
      amount,
      freeShipping: discount.freeShipping,
    },
  };
}

/** Texten som visas på rabattraden i varukorgen och på kvittot. */
export function labelFor(discount: DiscountCode): string {
  const size =
    discount.kind === 'procent'
      ? `${discount.value.toString().replace('.', ',')} %`
      : `${discount.value} kr`;
  return discount.freeShipping
    ? `${discount.code} · ${size} och fri frakt`
    : `${discount.code} · ${size}`;
}

/**
 * Räknar upp antalet användningar. Svarar false när koden hann tas i bruk av
 * någon annan, så anroparen kan avbryta i stället för att ge bort en rabatt
 * som inte finns.
 */
export function redeemDiscount(code: string): Promise<boolean> {
  return serialize(async () => {
    const codes = await readAll();
    const index = codes.findIndex((entry) => entry.code === normalizeCode(code));
    if (index < 0) return false;
    const discount = codes[index]!;
    if (discount.maxUses > 0 && discount.uses >= discount.maxUses) return false;
    codes[index] = { ...discount, uses: discount.uses + 1 };
    await writeAll(codes);
    return true;
  });
}

/** Backar en inlösen när ordern inte blev av. */
export function releaseDiscount(code: string): Promise<void> {
  return serialize(async () => {
    const codes = await readAll();
    const index = codes.findIndex((entry) => entry.code === normalizeCode(code));
    if (index < 0) return;
    const discount = codes[index]!;
    codes[index] = { ...discount, uses: Math.max(0, discount.uses - 1) };
    await writeAll(codes);
  });
}

/** Bara för tester. */
export function clearDiscounts(): Promise<void> {
  return serialize(() => writeAll([]));
}
