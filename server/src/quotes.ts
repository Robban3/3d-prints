import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ModelAnalysis } from './modelAnalysis.ts';
import type { CustomQuoteRequest, QuoteBreakdown } from './types.ts';

/**
 * Sparade offerter med egen länk.
 *
 * Den som räknar på ett printjobb är ofta inte den som får beställa det. En
 * sparad offert gör att siffrorna går att återkomma till eller skicka vidare
 * till en inköpare, utan att någon behöver fylla i formuläret igen.
 *
 * Länken är själva behörigheten, precis som för uppladdade filer: id:t är 96
 * slumpade bitar och går inte att gissa. Offerten går ut efter en månad – ett
 * pris som är ett halvår gammalt är inget vi vill stå för.
 */

const STORE = () => resolve(process.env.QUOTE_STORE ?? 'data/offerter.json');

export const QUOTE_TTL_DAYS = 30;

/** Så många offerter sparas. Utgångna rensas först, sedan faller de äldsta av. */
const MAX_QUOTES = 2000;

const ID_PATTERN = /^[A-Za-z0-9_-]{16,24}$/;

export interface SavedQuote {
  id: string;
  createdAt: string;
  expiresAt: string;
  projectName: string;
  description: string;
  request: CustomQuoteRequest;
  /** Priset som gällde när offerten sparades. */
  quote: QuoteBreakdown;
  fileId?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  model?: ModelAnalysis;
  /** Adressen offerten mejlades till, om någon. */
  email?: string;
}

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<SavedQuote[]> {
  try {
    const raw = await readFile(STORE(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedQuote[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(quotes: SavedQuote[]): Promise<void> {
  await mkdir(dirname(STORE()), { recursive: true });
  await writeFile(STORE(), JSON.stringify(quotes, null, 2), 'utf8');
}

/** Url-säkert id på 96 bitar – kort nog att skicka i ett mejl. */
export function generateQuoteId(): string {
  return randomBytes(12).toString('base64url');
}

export function expiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + QUOTE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function isExpired(quote: SavedQuote, now: Date = new Date()): boolean {
  return now.toISOString() > quote.expiresAt;
}

export type QuoteInput = Omit<SavedQuote, 'id' | 'createdAt' | 'expiresAt'>;

export function saveQuote(input: QuoteInput, now: Date = new Date()): Promise<SavedQuote> {
  return serialize(async () => {
    const quotes = (await readAll()).filter((quote) => !isExpired(quote, now));
    const saved: SavedQuote = {
      ...input,
      id: generateQuoteId(),
      createdAt: now.toISOString(),
      expiresAt: expiryFrom(now).toISOString(),
    };
    quotes.push(saved);
    // Äldst faller av först när taket är nått.
    await writeAll(quotes.slice(-MAX_QUOTES));
    return saved;
  });
}

/** Offerten, eller undefined när den inte finns eller har gått ut. */
export async function findQuote(
  id: unknown,
  now: Date = new Date(),
): Promise<SavedQuote | undefined> {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return undefined;
  const quote = (await readAll()).find((entry) => entry.id === id);
  if (!quote || isExpired(quote, now)) return undefined;
  return quote;
}

/** Rensar bort utgångna offerter. Returnerar antalet som togs bort. */
export function pruneQuotes(now: Date = new Date()): Promise<number> {
  return serialize(async () => {
    const quotes = await readAll();
    const kept = quotes.filter((quote) => !isExpired(quote, now));
    if (kept.length === quotes.length) return 0;
    await writeAll(kept);
    return quotes.length - kept.length;
  });
}

/** Bara för tester. */
export function clearQuotes(): Promise<void> {
  return serialize(() => writeAll([]));
}
