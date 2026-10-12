import type { Product } from '../types';

export function selectedProductImage(product: Pick<Product, 'image' | 'variantImages' | 'colors' | 'sizes'>, color = product.colors[0] ?? '', size = product.sizes?.[0]?.id ?? '') {
  return product.variantImages?.find(variant => variant.color === color && (variant.size ?? '') === size)?.image
    ?? product.variantImages?.find(variant => variant.color === color && !variant.size)?.image
    ?? product.image;
}
