import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { products } from './data/products.ts';
import type { OrderLine } from './types.ts';

/**
 * Lagersaldot är föränderligt och hör därför inte hemma i katalogen, som är
 * konstant. Saldot startar från produkternas angivna lager och sparas på disk
 * så att det överlever en omstart.
 */
const STOCK_FILE = () => resolve(process.env.STOCK_STORE ?? 'data/stock.json');

export class OutOfStockError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('Otillräckligt lagersaldo');
    this.name = 'OutOfStockError';
    this.fields = fields;
  }
}

let cache: Map<string, number> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function initial(): Map<string, number> {
  return new Map(products.map((product) => [product.id, product.stock]));
}

async function load(): Promise<Map<string, number>> {
  if (cache) return cache;
  try {
    const raw = await readFile(STOCK_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, number>;
    const levels = initial();
    for (const [id, value] of Object.entries(parsed)) {
      // Produkter som tagits bort ur katalogen ignoreras.
      if (levels.has(id) && Number.isInteger(value) && value >= 0) levels.set(id, value);
    }
    cache = levels;
  } catch {
    cache = initial();
  }
  return cache;
}

async function persist(levels: Map<string, number>): Promise<void> {
  await mkdir(dirname(STOCK_FILE()), { recursive: true });
  await writeFile(STOCK_FILE(), JSON.stringify(Object.fromEntries(levels), null, 2), 'utf8');
}

export async function stockLevels(): Promise<Map<string, number>> {
  return new Map(await load());
}

export async function stockFor(productId: string): Promise<number> {
  return (await load()).get(productId) ?? 0;
}

/**
 * Kontrollerar och drar av hela beställningen i ett svep. Antingen räcker
 * saldot för alla rader, eller så ändras ingenting – annars kan två samtidiga
 * köp dela på ett exemplar.
 */
export async function reserve(lines: OrderLine[]): Promise<void> {
  return serialize(async () => {
    const levels = await load();
    const wanted = new Map<string, number>();
    for (const line of lines) {
      wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.quantity);
    }

    const errors: Record<string, string> = {};
    for (const [productId, quantity] of wanted) {
      const available = levels.get(productId) ?? 0;
      if (quantity > available) {
        const name = products.find((product) => product.id === productId)?.name ?? productId;
        errors[`stock.${productId}`] =
          available === 0
            ? `${name} är slut i lager just nu.`
            : `Vi har bara ${available} st av ${name} kvar.`;
      }
    }
    if (Object.keys(errors).length > 0) throw new OutOfStockError(errors);

    for (const [productId, quantity] of wanted) {
      levels.set(productId, (levels.get(productId) ?? 0) - quantity);
    }
    await persist(levels);
  });
}

/** Lämnar tillbaka reserverat saldo, t.ex. när betalningen inte gick igenom. */
export async function release(lines: OrderLine[]): Promise<void> {
  return serialize(async () => {
    const levels = await load();
    for (const line of lines) {
      const current = levels.get(line.productId);
      if (current === undefined) continue;
      levels.set(line.productId, current + line.quantity);
    }
    await persist(levels);
  });
}

/** Bara för tester – tvingar fram en omläsning från disk. */
export function resetStockCache(): void {
  cache = null;
}
