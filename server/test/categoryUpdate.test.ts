import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { updateShopCategories } from '../src/categoryUpdate.ts';
import type { Product } from '../src/types.ts';

it('updates an existing catalog once, preserves admin categories and avoids name duplicates', () => {
  const catalog = {
    categories: [{ id: 'kok', name: 'Kök & servering', description: 'Egen beskrivning' },
      { id: 'egen-bar', name: 'Bar och restaurang', description: 'Behåll denna' }],
    products: [{ id: 'flaska', name: 'Flaskhållare', category: 'kok' },
      { id: 'lock', name: 'Kastrullockshållare', category: 'inredning' },
      { id: 'tand', name: 'Tandborsthållare', category: 'inredning' },
      { id: 'jul', name: 'Namnskylt till julbordet', category: 'julkollektionen' }] as Product[],
  };
  const updated = updateShopCategories(catalog);
  assert.equal(updated.categories.find(c => c.id === 'kok')?.description, 'Egen beskrivning');
  assert.equal(updated.products.find(p => p.id === 'lock')?.category, 'kok');
  assert.equal(updated.products.find(p => p.id === 'tand')?.category, 'badrum');
  assert.equal(updated.products.find(p => p.id === 'jul')?.category, 'julkollektionen');
  assert.equal(updated.products.find(p => p.id === 'flaska')?.category, 'egen-bar');
  const afterAdminDelete = { ...updated, categories: updated.categories.filter(c => c.id !== 'lampor') };
  assert.equal(updateShopCategories(afterAdminDelete), afterAdminDelete);
});
