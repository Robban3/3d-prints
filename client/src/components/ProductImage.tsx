import { ProductArt } from './ProductArt';
import { ResponsiveImage } from './ResponsiveImage';
import type { Product } from '../types';

interface Props {
  product: Pick<Product, 'name' | 'art' | 'image'>;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

/**
 * Visar produktens uppladdade foto om det finns, annars den ritade
 * illustrationen. Alla ställen som visar en produkt går via den här, så en
 * uppladdad bild slår igenom överallt på en gång.
 */
export function ProductImage({ product, className, priority = false, sizes = '(max-width: 620px) 45vw, (max-width: 1000px) 30vw, 300px' }: Props) {
  if (product.image) {
    return (
      <ResponsiveImage
        className={className ? `product-photo ${className}` : 'product-photo'}
        src={product.image.url}
        alt={product.name}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
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
