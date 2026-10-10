import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Enkel ändringslogg för panelen. Det finns ingen inloggning per person, så
 * "vem" är alltid den som haft adminnyckeln – det som loggas är vad som hänt
 * och när, vilket är det som går att svara ärligt på.
 */
const LOG_FILE = () => resolve(process.env.AUDIT_STORE ?? 'data/handelser.json');

/** Så många händelser sparas; äldre faller av. */
const MAX_ENTRIES = 500;

export interface AuditEntry {
  at: string;
  action: 'skapad' | 'ändrad' | 'borttagen' | 'importerad' | 'status';
  entity: 'produkt' | 'kategori' | 'material' | 'kvalitet' | 'order' | 'omdöme';
  entityId: string;
  summary: string;
  /** Fälten som faktiskt ändrades, för en ändring. */
  changed?: string[];
}

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<AuditEntry[]> {
  try {
    const raw = await readFile(LOG_FILE(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

export async function record(entry: Omit<AuditEntry, 'at'>): Promise<void> {
  return serialize(async () => {
    const entries = await readAll();
    entries.push({ ...entry, at: new Date().toISOString() });
    const trimmed = entries.slice(-MAX_ENTRIES);
    await mkdir(dirname(LOG_FILE()), { recursive: true });
    await writeFile(LOG_FILE(), JSON.stringify(trimmed, null, 2), 'utf8');
  });
}

/** Senaste händelserna först. */
export async function history(limit = 100): Promise<AuditEntry[]> {
  const entries = await readAll();
  return entries.slice(-limit).reverse();
}

/**
 * Jämför två versioner och returnerar fälten som skiljer sig. Används för att
 * logga vad som faktiskt ändrades i stället för bara att något ändrades.
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (key === 'id') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
  }
  return changed.sort();
}

/** Bara för tester. */
export async function clearHistory(): Promise<void> {
  return serialize(async () => {
    await mkdir(dirname(LOG_FILE()), { recursive: true });
    await writeFile(LOG_FILE(), '[]', 'utf8');
  });
}
