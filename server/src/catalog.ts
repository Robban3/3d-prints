import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { categories as seedCategories, products as seedProducts } from './data/products.ts';
import { materials as seedMaterials, qualities as seedQualities } from './data/materials.ts';
import type { Category, Material, Product, QualityLevel } from './types.ts';

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
  materials: Material[];
  qualities: QualityLevel[];
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
  return structuredClone({
    products: seedProducts,
    categories: seedCategories,
    materials: seedMaterials,
    qualities: seedQualities,
  });
}

async function load(): Promise<CatalogFile> {
  if (cache) return cache;
  try {
    const raw = await readFile(CATALOG_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CatalogFile>;
    const fallback = seed();
    cache = {
      products: Array.isArray(parsed.products) ? parsed.products : fallback.products,
      categories: Array.isArray(parsed.categories) ? parsed.categories : fallback.categories,
      // Materialen tillkom senare – en äldre fil saknar dem och får standarden.
      materials: Array.isArray(parsed.materials) ? parsed.materials : fallback.materials,
      qualities: Array.isArray(parsed.qualities) ? parsed.qualities : fallback.qualities,
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

export async function allMaterials(): Promise<Material[]> {
  return [...(await load()).materials];
}

export async function findMaterial(id: string): Promise<Material | undefined> {
  return (await load()).materials.find((material) => material.id === id);
}

export async function allQualities(): Promise<QualityLevel[]> {
  return [...(await load()).qualities];
}

export async function findQuality(id: string): Promise<QualityLevel | undefined> {
  return (await load()).qualities.find((quality) => quality.id === id);
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

export async function saveMaterial(material: Material): Promise<Material> {
  return serialize(async () => {
    const data = await load();
    const index = data.materials.findIndex((entry) => entry.id === material.id);
    const materials = [...data.materials];
    if (index === -1) materials.push(material);
    else materials[index] = material;
    await persist({ ...data, materials });
    return material;
  });
}

export async function deleteMaterial(id: string): Promise<Material> {
  return serialize(async () => {
    const data = await load();
    const material = data.materials.find((entry) => entry.id === id);
    if (!material) throw new CatalogError({ id: 'Materialet finns inte.' }, 404);

    // Ett material som produkter är satta i får inte försvinna under dem.
    const inUse = data.products.filter((product) => product.material === id);
    if (inUse.length > 0) {
      throw new CatalogError(
        {
          id: `Materialet används av ${inUse.length} ${
            inUse.length === 1 ? 'produkt' : 'produkter'
          }. Byt material på dem först.`,
        },
        409,
      );
    }
    if (data.materials.length === 1) {
      throw new CatalogError({ id: 'Det måste finnas minst ett material.' }, 409);
    }

    await persist({ ...data, materials: data.materials.filter((entry) => entry.id !== id) });
    return material;
  });
}

export async function saveQuality(quality: QualityLevel): Promise<QualityLevel> {
  return serialize(async () => {
    const data = await load();
    const index = data.qualities.findIndex((entry) => entry.id === quality.id);
    const qualities = [...data.qualities];
    if (index === -1) qualities.push(quality);
    else qualities[index] = quality;
    await persist({ ...data, qualities });
    return quality;
  });
}

export async function deleteQuality(id: string): Promise<QualityLevel> {
  return serialize(async () => {
    const data = await load();
    const quality = data.qualities.find((entry) => entry.id === id);
    if (!quality) throw new CatalogError({ id: 'Kvalitetsnivån finns inte.' }, 404);
    if (data.qualities.length === 1) {
      throw new CatalogError({ id: 'Det måste finnas minst en kvalitetsnivå.' }, 409);
    }
    await persist({ ...data, qualities: data.qualities.filter((entry) => entry.id !== id) });
    return quality;
  });
}

/** Bara för tester – tvingar fram en omläsning från disk. */
export function resetCatalogCache(): void {
  cache = null;
}
