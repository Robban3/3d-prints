import { Link } from 'react-router-dom';
import { ProductArt } from './ProductArt';
import { Rating } from './Rating';
import { formatPrice } from '../lib/format';
import type { Product } from '../types';

export function ProductCard({ product }: { product: Product }) {
  const lowStock = product.stock <= 20;
  return (
    <article className="product-card">
      <Link to={`/produkter/${product.slug}`} className="art" aria-hidden="true" tabIndex={-1}>
        <ProductArt shape={product.art.shape} accent={product.art.accent} title={product.name} />
      </Link>
      <div className="body">
        <div className="row" style={{ gap: 8 }}>
          <span className="badge">{product.material.toUpperCase()}</span>
          {lowStock && <span className="badge badge-warn">Få kvar</span>}
        </div>
        <h3>
          <Link to={`/produkter/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="tagline">{product.tagline}</p>
        <Rating value={product.rating} count={product.reviewCount} />
        <div className="price-row">
          <span className="price">{formatPrice(product.price)}</span>
          <Link className="btn btn-ghost" to={`/produkter/${product.slug}`}>
            Visa
          </Link>
        </div>
      </div>
    </article>
  );
}
