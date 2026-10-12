import { describe, expect, it } from 'vitest';
import { selectedProductImage } from '../src/lib/productImage';

const base = { id: 'base', url: '/base', fileName: 'base' };
const purple = { id: 'purple', url: '/purple', fileName: 'purple' };
const large = { id: 'large', url: '/large', fileName: 'large' };
const product = { image: base, colors: ['Koppar', 'Lila'], sizes: [{ id: 'mini', name: 'Mini', priceDelta: 0 }], variantImages: [{ color: 'Lila', image: purple }, { color: 'Lila', size: 'stor', image: large }] };
describe('selectedProductImage', () => {
  it('prioriterar både färg och storlek, faller tillbaka på färg och sedan huvudbild', () => {
    expect(selectedProductImage(product, 'Lila', 'stor')).toBe(large);
    expect(selectedProductImage(product, 'Lila', 'mini')).toBe(purple);
    expect(selectedProductImage(product, 'Koppar', 'mini')).toBe(base);
  });
  it('väljer första färg och storlek för snabbköp och produktkort', () => {
    expect(selectedProductImage({ ...product, colors: ['Lila'], sizes: [{ id: 'stor', name: 'Stor', priceDelta: 0 }] })).toBe(large);
  });
});
