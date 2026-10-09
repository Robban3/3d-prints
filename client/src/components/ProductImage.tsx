import { ProductArt } from './ProductArt';
import type { Product } from '../types';

interface Props {
  product: Pick<Product, 'name' | 'art' | 'image'>;
  className?: string;
}

/**
 * Visar produktens uppladdade foto om det finns, annars den ritade
 * illustrationen. Alla ställen som visar en produkt går via den här, så en
 * uppladdad bild slår igenom överallt på en gång.
 */
export function ProductImage({ product, className }: Props) {
  if (product.image) {
    return (
      <img
        className={className ? `product-photo ${className}` : 'product-photo'}
        src={product.image.url}
        alt={product.name}
        loading="lazy"
      />
    );
  }
  return (
    <ProductArt
      shape={product.art.shape}
      tone={product.art.tone}
      title={product.name}
      className={className}
    />
  );
}
