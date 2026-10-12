import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Bevakningar av slutsålda produkter: "meddela mig när den finns igen".
 *
 * En bevakning används en gång. När saldot fyllts på skickas mejlet och posten
 * tas bort, så ingen får samma påminnelse två gånger och listan inte växer
 * obegränsat.
 */

const STORE = () => resolve(process.env.WATCH_STORE ?? 'data/bevakningar.json');

/** Så många adresser bevakar vi per produkt. Fler än så är sannolikt en robot. */
const MAX_PER_PRODUCT = 500;

export interface StockWatch {
  id: string;
  productId: string;
  email: string;
  createdAt: string;
}

export class WatchError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('Bevakningen kunde inte sparas');
    this.name = 'WatchError';
    this.fields = fields;
  }
}

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<StockWatch[]> {
  try {
    const raw = await readFile(STORE(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StockWatch[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(watches: StockWatch[]): Promise<void> {
  await mkdir(dirname(STORE()), { recursive: true });
  await writeFile(STORE(), JSON.stringify(watches, null, 2), 'utf8');
}

/**
 * Lägger till en bevakning. Samma adress två gånger ger samma post tillbaka i
 * stället för ett fel – kunden har fått det den ville ha.
 */
export function watchStock(productId: string, email: string): Promise<StockWatch> {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
    return Promise.reject(
      new WatchError({ email: 'Fyll i en mejladress vi kan skicka beskedet till.' }),
    );
  }

  return serialize(async () => {
    const watches = await readAll();
    const existing = watches.find(
      (watch) => watch.productId === productId && watch.email === address,
    );
    if (existing) return existing;

    if (watches.filter((watch) => watch.productId === productId).length >= MAX_PER_PRODUCT) {
      throw new WatchError({
        email: 'Många bevakar redan den här produkten. Hör av dig så löser vi det.',
      });
    }

    const watch: StockWatch = {
      id: randomUUID(),
      productId,
      email: address,
      createdAt: new Date().toISOString(),
    };
    watches.push(watch);
    await writeAll(watches);
    return watch;
  });
}

export async function watchersFor(productId: string): Promise<StockWatch[]> {
  return (await readAll()).filter((watch) => watch.productId === productId);
}

export async function watcherCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const watch of await readAll()) {
    counts.set(watch.productId, (counts.get(watch.productId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Plockar ut alla bevakningar för en produkt och tar bort dem i samma steg, så
 * att två samtidiga påfyllningar inte skickar dubbla mejl till samma adress.
 */
export function claimWatchers(productId: string): Promise<StockWatch[]> {
  return serialize(async () => {
    const watches = await readAll();
    const claimed = watches.filter((watch) => watch.productId === productId);
    if (claimed.length === 0) return [];
    await writeAll(watches.filter((watch) => watch.productId !== productId));
    return claimed;
  });
}

export function removeWatch(id: string): Promise<StockWatch | undefined> {
  return serialize(async () => {
    const watches = await readAll();
    const index = watches.findIndex((watch) => watch.id === id);
    if (index < 0) return undefined;
    const [removed] = watches.splice(index, 1);
    await writeAll(watches);
    return removed;
  });
}

/** Bara för tester. */
export function clearWatches(): Promise<void> {
  return serialize(() => writeAll([]));
}
