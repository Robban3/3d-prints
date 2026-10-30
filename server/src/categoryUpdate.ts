import type { Category, Product } from './types.ts';

export const categoryUpdateId = 'shop-categories-2026-10-30';
export const additionalCategories: Category[] = [
  { id: 'bar-restaurang', name: 'Bar & restaurang', description: 'Flaskhållare, drinkpinnar och praktiska detaljer för bar och restaurang.' },
  { id: 'badrum', name: 'Badrum', description: 'Tandborsthållare och smart förvaring för badrummet.' },
  { id: 'klickers', name: 'Klickers', description: 'Klickers och taktila fidgetprodukter för händer som vill ha något att göra.' },
  { id: 'namnbrickor-skyltar', name: 'Namnbrickor & skyltar', description: 'Personliga namnbrickor, dörrskyltar och skyltar för hem och verksamhet.' },
  { id: 'lampor', name: 'Lampor', description: '3D-printade lampor och dekorativ belysning för hemmet.' },
];

interface CategoryCatalog {
  categories: Category[];
  products: Product[];
  appliedUpdates?: string[];
}

const normalized = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/&/g, 'och').replace(/[^a-z0-9]/g, '');

/** One-time update: preserve admin edits and do not recreate deliberately deleted categories. */
export function updateShopCategories<T extends CategoryCatalog>(catalog: T): T {
  if (catalog.appliedUpdates?.includes(categoryUpdateId)) return catalog;
  const categories = [...catalog.categories];
  const destinations = new Map<string, string>();
  for (const category of additionalCategories) {
    const existing = categories.find(entry => entry.id === category.id || normalized(entry.name) === normalized(category.name));
    if (!existing) categories.push({ ...category });
    destinations.set(category.id, existing?.id ?? category.id);
  }
  const kitchen = categories.find(entry => entry.id === 'kok' || normalized(entry.name) === 'kokochservering');
  const products = catalog.products.map(product => {
    const name = normalized(product.name);
    let category: string | undefined;
    if (name.includes('flaskhallare')) category = destinations.get('bar-restaurang');
    else if (name.includes('kastrull') && name.includes('lock') && name.includes('hallare')) category = kitchen?.id;
    else if (name.includes('tandborsthallare')) category = destinations.get('badrum');
    else if (/lampa\b/i.test(product.name)) category = destinations.get('lampor');
    return category && category !== product.category ? { ...product, category } : product;
  });
  return { ...catalog, categories, products, appliedUpdates: [...(catalog.appliedUpdates ?? []), categoryUpdateId] };
}
