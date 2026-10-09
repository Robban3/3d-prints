import { parseProductInput, type ProductInputOptions } from './catalogValidation.ts';
import type { Category, Material, Product, QualityLevel } from './types.ts';

/**
 * Export och import av hela katalogen. Formatet är avsiktligt detsamma åt båda
 * hållen, så en exporterad fil går att läsa in igen oförändrad.
 */
export interface CatalogExport {
  version: 1;
  exportedAt: string;
  products: Product[];
  categories: Category[];
  materials: Material[];
  qualities: QualityLevel[];
}

export interface ImportRow {
  index: number;
  name: string;
  status: 'skapad' | 'ändrad' | 'fel';
  /** Varför raden inte gick igenom. */
  errors?: Record<string, string>;
}

export interface ImportPlan {
  rows: ImportRow[];
  products: Array<{ existingId?: string; input: Omit<Product, 'id'> }>;
  ok: number;
  failed: number;
}

export function buildExport(data: {
  products: Product[];
  categories: Category[];
  materials: Material[];
  qualities: QualityLevel[];
}): CatalogExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    products: data.products,
    categories: data.categories,
    materials: data.materials,
    qualities: data.qualities,
  };
}

/**
 * Läser igenom en importfil och validerar varje produkt för sig. Inget skrivs
 * här – anroparen får en plan och kan välja att avbryta om något är fel.
 * Produkter matchas på webbadressen, så en export som ändrats och läses in
 * igen uppdaterar i stället för att skapa dubbletter.
 */
export function planImport(
  input: unknown,
  existing: Product[],
  options: ProductInputOptions,
): ImportPlan {
  const raw = input as { products?: unknown };
  const incoming = Array.isArray(raw?.products) ? raw.products : [];

  const bySlug = new Map(existing.map((product) => [product.slug, product]));
  const rows: ImportRow[] = [];
  const products: ImportPlan['products'] = [];
  const seenSlugs = new Set<string>();

  incoming.forEach((entry, index) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : `Rad ${index + 1}`;

    try {
      const parsed = parseProductInput(record, options);
      if (seenSlugs.has(parsed.slug)) {
        rows.push({
          index,
          name,
          status: 'fel',
          errors: { slug: 'Samma webbadress förekommer flera gånger i filen.' },
        });
        return;
      }
      seenSlugs.add(parsed.slug);

      const match = bySlug.get(parsed.slug);
      rows.push({ index, name, status: match ? 'ändrad' : 'skapad' });
      products.push({ existingId: match?.id, input: parsed });
    } catch (error) {
      const fields =
        error instanceof Error && 'fields' in error
          ? ((error as { fields: Record<string, string> }).fields ?? {})
          : { '': 'Raden kunde inte tolkas.' };
      rows.push({ index, name, status: 'fel', errors: fields });
    }
  });

  return {
    rows,
    products,
    ok: products.length,
    failed: rows.filter((row) => row.status === 'fel').length,
  };
}
