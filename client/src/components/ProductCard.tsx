import { useState } from 'react';
import { Link } from 'react-router';
import { ProductArt } from './ProductArt';
import { Icon } from './Icon';
import { formatPrice } from '../lib/format';
import { useCart } from '../lib/cart';
import type { Product } from '../types';

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  function quickAdd() {
    // Snabbköpet lägger till standardvarianten; färg och storlek ändras på produktsidan.
    add({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      unitPrice: product.price + (product.sizes?.[0]?.priceDelta ?? 0),
      quantity: 1,
      color: product.colors[0] ?? '',
      size: product.sizes?.[0]?.id,
      sizeName: product.sizes?.[0]?.name,
      art: product.art,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className="product-card">
      <Link to={`/produkter/${product.slug}`} className="art" tabIndex={-1} aria-hidden="true">
        <ProductArt shape={product.art.shape} tone={product.art.tone} title={product.name} />
        {product.stock <= 20 && <span className="flag flag-warn">Få kvar</span>}
      </Link>
      <div className="body">
        <h3>
          <Link to={`/produkter/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="sub">
          {product.material.toUpperCase()} {product.finish}
        </p>
        <div className="price-row">
          <span className="price">{formatPrice(product.price)}</span>
          <button
            type="button"
            className={added ? 'add-btn done' : 'add-btn'}
            onClick={quickAdd}
            aria-label={`Lägg ${product.name} i varukorgen`}
          >
            <Icon name={added ? 'shield' : 'cartPlus'} size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}
