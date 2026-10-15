import type { Product } from '../types';
import { productPrice } from '../lib/productPrice';
import { formatPrice } from '../lib/format';
export function ProductPrice({ product, delta = 0 }: { product: Product; delta?: number }) {
  const value = productPrice(product, delta);
  return <span className="product-price"><strong className="price">{formatPrice(value.price)}</strong>
    {value.sale && <><del>{formatPrice(value.reference)}</del><span className="sale-reference">Tidigare lägsta pris (30 dagar)</span></>}
  </span>;
}
