import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { categories as seedCategories, products as seedProducts } from './data/products.ts';
import type { Category, Product } from './types.ts';

/**
 * Katalogen var tidigare en konstant som kompilerades in i servern. För att
 * sortimentet ska gå att redigera ligger den nu i en fil som läses in vid start
 * och skrivs om vid varje ändring. Första gången sås den från konstanten, så en
 * befintlig installation får samma sortiment som förut.
 */
const CATALOG_FILE = () => resolve(process.env.CATALOG_STORE ?? 'data/catalog.json');

interface CatalogFile {
  products: Product[];
  categories: Category[];
}

let cache: CatalogFile | null = null;
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function seed(): CatalogFile {
  // Djupkopia, annars delar lagringen objekt med konstanten.
  return structuredClone({ products: seedProducts, categories: seedCategories });
}

async function load(): Promise<CatalogFile> {
  if (cache) return cache;
  try {
    const raw = await readFile(CATALOG_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CatalogFile>;
    cache = {
      products: Array.isArray(parsed.products) ? parsed.products : seed().products,
      categories: Array.isArray(parsed.categories) ? parsed.categories : seed().categories,
    };
  } catch {
    cache = seed();
  }
  return cache;
}

async function persist(data: CatalogFile): Promise<void> {
  cache = data;
  await mkdir(dirname(CATALOG_FILE()), { recursive: true });
  await writeFile(CATALOG_FILE(), JSON.stringify(data, null, 2), 'utf8');
}

export class CatalogError extends Error {
  readonly fields: Record<string, string>;
  readonly status: number;

  constructor(fields: Record<string, string>, status = 400) {
    super('Katalogen kunde inte uppdateras');
    this.name = 'CatalogError';
    this.fields = fields;
    this.status = status;
  }
}

/* ---------- Läsning ---------- */

/** Allt i katalogen, inklusive opublicerade utkast. */
export async function allProducts(): Promise<Product[]> {
  return [...(await load()).products];
}

/** Det kunderna ska se. */
export async function publishedProducts(): Promise<Product[]> {
  return (await load()).products.filter((product) => product.published !== false);
}

export async function findProduct(id: string): Promise<Product | undefined> {
  return (await load()).products.find((product) => product.id === id);
}

export async function findProductBySlug(slug: string): Promise<Product | undefined> {
  return (await load()).products.find((product) => product.slug === slug);
}

export async function allCategories(): Promise<Category[]> {
  return [...(await load()).categories];
}

/* ---------- Skrivning ---------- */

function nextProductId(existing: Product[]): string {
  // Behåller p-00N-formen så länge den räcker, annars ett slumpat id.
  const numbers = existing
    .map((product) => /^p-(\d+)$/.exec(product.id)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
  const candidate = `p-${String(next).padStart(3, '0')}`;
  return existing.some((product) => product.id === candidate)
    ? `p-${randomUUID().slice(0, 8)}`
    : candidate;
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product> {
  return serialize(async () => {
    const data = await load();
    if (data.products.some((existing) => existing.slug === product.slug)) {
      throw new CatalogError({ slug: 'Det finns redan en produkt med den webbadressen.' }, 409);
    }
    const created: Product = { ...product, id: nextProductId(data.products) };
    await persist({ ...data, products: [...data.products, created] });
    return created;
  });
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product> {
  return serialize(async () => {
    const data = await load();
    const index = data.products.findIndex((product) => product.id === id);
    if (index === -1) throw new CatalogError({ id: 'Produkten finns inte.' }, 404);

    if (patch.slug && data.products.some((p) => p.slug === patch.slug && p.id !== id)) {
      throw new CatalogError({ slug: 'Det finns redan en produkt med den webbadressen.' }, 409);
    }

    // Id:t är nyckeln i ordrar och lagersaldo och får aldrig bytas.
    const updated: Product = { ...data.products[index]!, ...patch, id };
    const products = [...data.products];
    products[index] = updated;
    await persist({ ...data, products });
    return updated;
  });
}

export async function deleteProduct(id: string): Promise<Product> {
  return serialize(async () => {
    const data = await load();
    const product = data.products.find((entry) => entry.id === id);
    if (!product) throw new CatalogError({ id: 'Produkten finns inte.' }, 404);
    await persist({ ...data, products: data.products.filter((entry) => entry.id !== id) });
    return product;
  });
}

export async function createCategory(category: Category): Promise<Category> {
  return serialize(async () => {
    const data = await load();
    if (data.categories.some((existing) => existing.id === category.id)) {
      throw new CatalogError({ id: 'Det finns redan en kategori med det id:t.' }, 409);
    }
    await persist({ ...data, categories: [...data.categories, category] });
    return category;
  });
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<Category> {
  return serialize(async () => {
    const data = await load();
    const index = data.categories.findIndex((category) => category.id === id);
    if (index === -1) throw new CatalogError({ id: 'Kategorin finns inte.' }, 404);
    const updated: Category = { ...data.categories[index]!, ...patch, id };
    const categories = [...data.categories];
    categories[index] = updated;
    await persist({ ...data, categories });
    return updated;
  });
}

export async function deleteCategory(id: string): Promise<Category> {
  return serialize(async () => {
    const data = await load();
    const category = data.categories.find((entry) => entry.id === id);
    if (!category) throw new CatalogError({ id: 'Kategorin finns inte.' }, 404);

    // En kategori med produkter i får inte försvinna under dem.
    const inUse = data.products.filter((product) => product.category === id);
    if (inUse.length > 0) {
      throw new CatalogError(
        {
          id: `Kategorin används av ${inUse.length} ${
            inUse.length === 1 ? 'produkt' : 'produkter'
          }. Flytta dem först.`,
        },
        409,
      );
    }

    await persist({ ...data, categories: data.categories.filter((entry) => entry.id !== id) });
    return category;
  });
}

/** Bara för tester – tvingar fram en omläsning från disk. */
export function resetCatalogCache(): void {
  cache = null;
}
