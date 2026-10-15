import type { Product } from '../types';
export function productPrice(product: Pick<Product, 'price' | 'discountPercent' | 'saleReferencePrice'>, delta = 0) {
  const regular = product.price + delta;
  const percent = product.discountPercent ?? 0;
  const reference = (product.saleReferencePrice ?? product.price) + delta;
  const reduced = Math.round(reference * (1 - percent / 100));
  const sale = Number.isFinite(percent) && percent > 0 && percent < 100 && product.saleReferencePrice !== undefined && reference > 0 && reduced >= 1 && reduced < reference && reduced < regular;
  return { price: sale ? reduced : regular, reference, percent: sale ? percent : 0, sale };
}
