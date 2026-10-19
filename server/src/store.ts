import { mkdir } from 'node:fs/promises';
import { readFile, writeFile } from './stateFiles.ts';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AnyOrder, Product } from './types.ts';
import { customArticle, productArticle } from './articles.ts';

const DATA_FILE = resolve(process.env.ORDER_STORE ?? 'data/orders.json');

/**
 * Enkel filbaserad orderlagring. Skrivningarna serialiseras via en promise-kedja
 * så att två samtidiga beställningar inte skriver över varandra. Räcker gott för
 * en butik i den här storleken – byt implementationen mot en databas när volymen
 * kräver det, gränssnittet nedan är detsamma.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<AnyOrder[]> {
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnyOrder[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function generateOrderNumber(prefix: 'S' | 'C'): string {
  const year = new Date().getFullYear();
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  return `${prefix}${year}-${suffix}`;
}

export async function saveOrder<T extends AnyOrder>(order: T): Promise<T> {
  return serialize(async () => {
    const orders = await readAll();
    if (orders.some(existing => existing.id.toLowerCase() === order.id.toLowerCase())) {
      throw new Error('Ordernumret finns redan');
    }
    orders.push(order);
    await mkdir(dirname(DATA_FILE), { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(orders, null, 2), 'utf8');
    return order;
  });
}

/**
 * Uppdaterar en order på plats. Läsningen och skrivningen ligger i samma
 * serialiserade steg, så att två samtidiga statusändringar inte skriver över
 * varandra.
 */
export async function updateOrder<T extends AnyOrder>(
  id: string,
  change: (order: AnyOrder) => T,
): Promise<T | undefined> {
  return serialize(async () => {
    const orders = await readAll();
    const index = orders.findIndex((order) => order.id.toLowerCase() === id.toLowerCase());
    if (index === -1) return undefined;
    const updated = change(orders[index]!);
    orders[index] = updated;
    await mkdir(dirname(DATA_FILE), { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(orders, null, 2), 'utf8');
    return updated;
  });
}

export async function findOrder(id: string): Promise<AnyOrder | undefined> {
  const orders = await readAll();
  return orders.find((order) => order.id.toLowerCase() === id.toLowerCase());
}

export async function listOrders(): Promise<AnyOrder[]> {
  const orders = await readAll();
  return [...orders].reverse();
}

/** Backfill identifiers only; never overwrite historical prices, names or production specs. */
export async function migrateOrderArticles(products: Product[]): Promise<void> {
  return serialize(async () => {
    const orders = await readAll();
    const numbered = await Promise.all(orders.map(async order => {
      if (order.type === 'custom') return order.articleNumber ? order : { ...order, articleNumber: await customArticle(`order:${order.id}`) };
      return { ...order, lines: order.lines.map(line => {
        if (line.articleNumber) return line;
        const product = products.find(product => product.id === line.productId && product.name === line.name && product.articleKey?.startsWith('legacy:'));
        const number = product && productArticle(product, line.color, line.size);
        return number ? { ...line, articleNumber: number } : line;
      }) };
    }));
    if (JSON.stringify(numbered) === JSON.stringify(orders)) return;
    await mkdir(dirname(DATA_FILE), { recursive: true });
    const backup = `${DATA_FILE}.before-articles.json`;
    try { await readFile(backup, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(backup, JSON.stringify(orders, null, 2), 'utf8'); }
    await writeFile(DATA_FILE, JSON.stringify(numbered, null, 2), 'utf8');
  });
}
