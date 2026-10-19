import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readFile, writeFile, rename } from './stateFiles.ts';
import type { CustomQuoteRequest, Product, ProductArticle } from './types.ts';

interface Registry { version: 1; entries: Record<string, string> }
let queue: Promise<unknown> = Promise.resolve();
const registryPath = () => resolve(process.env.ARTICLE_STORE ?? join(dirname(resolve(process.env.CATALOG_STORE ?? process.env.ORDER_STORE ?? 'data/catalog.json')), 'articles.json'));

/** One durable registry in the single shop container; retired numbers are never deleted. */
async function allocate<T>(action: (data: Registry) => T): Promise<T> {
  const path = registryPath();
  const task = async () => {
    let data: Registry;
    try {
      data = JSON.parse(await readFile(path, 'utf8')) as Registry;
      if (data.version !== 1 || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries) || Object.values(data.entries).some(number => typeof number !== 'string' || !/^FL-[PK]-\d{4,12}(?:-\d{3,8})?$/.test(number)) || new Set(Object.values(data.entries)).size !== Object.values(data.entries).length) throw new Error('Artikelregistret behöver granskas innan nya nummer kan skapas.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      data = { version: 1, entries: {} };
    }
    const before = JSON.stringify(data);
    const result = action(data);
    if (JSON.stringify(data) !== before) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, JSON.stringify(data, null, 2), 'utf8');
      await rename(`${path}.tmp`, path);
    }
    return result;
  };
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function numberFor(data: Registry, key: string, prefix: string, width: number, preferred?: string): string {
  const existing = data.entries[key];
  if (existing) {
    if (preferred && preferred !== existing) throw new Error('Artikelnummer och register stämmer inte överens.');
    return existing;
  }
  if (preferred) {
    if (!preferred.startsWith(prefix) || !/^\d+$/.test(preferred.slice(prefix.length)) || !Number.isSafeInteger(Number(preferred.slice(prefix.length))) || Object.values(data.entries).includes(preferred)) throw new Error('Artikelnumret är ogiltigt eller redan tilldelat en annan artikel.');
    data.entries[key] = preferred;
    return preferred;
  }
  const suffixes = Object.values(data.entries).filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length)).filter(value => /^\d+$/.test(value)).map(Number);
  const next = Math.max(0, ...suffixes) + 1;
  const number = `${prefix}${String(next).padStart(width, '0')}`;
  data.entries[key] = number;
  return number;
}

export function identifyProducts(products: Product[]): Promise<Product[]> {
  return allocate(data => products.map(product => {
    const articleKey = product.articleKey ?? `legacy:${product.id}`;
    const articleNumber = numberFor(data, `product:${articleKey}`, 'FL-P-', 4, product.articleNumber);
    const articles: ProductArticle[] = [];
    for (const color of product.colors) for (const size of product.sizes?.length ? product.sizes.map(value => value.id) : [undefined]) {
      const previous = product.articles?.find(value => value.color === color && value.size === size);
      const key = `variant:${articleKey}:${JSON.stringify([color, size ?? ''])}`;
      articles.push({ color, ...(size ? { size } : {}), articleNumber: numberFor(data, key, `${articleNumber}-`, 3, previous?.articleNumber) });
    }
    return { ...product, articleKey, articleNumber, articles };
  }));
}

export function productArticle(product: Product, color: string, size?: string): string | undefined {
  return product.articles?.find(value => value.color === color && (value.size ?? '') === (size ?? ''))?.articleNumber;
}

export function customArticle(key: string): Promise<string> {
  return allocate(data => numberFor(data, `custom:${key}`, 'FL-K-', 4));
}

/** Same customer + exact file bytes + production settings. Never trusts a filename or client SKU. */
export function customModelIdentity(email: string, fileHash: string, request: CustomQuoteRequest): string {
  return createHash('sha256').update(JSON.stringify([email.trim().toLowerCase(), fileHash, request.material, request.quality, request.infill])).digest('hex');
}
