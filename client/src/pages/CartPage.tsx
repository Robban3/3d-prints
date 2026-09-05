import { Link } from 'react-router';
import { ProductArt } from '../components/ProductArt';
import { useCart } from '../lib/cart';
import { formatPrice } from '../lib/format';
import { fetchConfig } from '../lib/api';
import { useAsync } from '../lib/useAsync';

export function CartPage() {
  const { items, subtotal, setQuantity, remove, clear } = useCart();
  const config = useAsync(() => fetchConfig(), []);
  const shippingConfig = config.data?.shipping ?? {
    fee: 59,
    freeThreshold: 599,
  };
  const shipping = subtotal >= shippingConfig.freeThreshold ? 0 : shippingConfig.fee;
  const missingForFreeShipping = shippingConfig.freeThreshold - subtotal;

  if (items.length === 0) {
    return (
      <section className="section">
        <div className="container center">
          <h1>Varukorgen är tom</h1>
          <p className="muted">Sortimentet finns kvar – och vi printar lika gärna din egen fil.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
            <Link className="btn" to="/produkter">
              Till produkterna
            </Link>
            <Link className="btn btn-ghost" to="/egen-print">
              Beställ egen print
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        <h1>Varukorg</h1>
        <div className="cart-layout" style={{ marginTop: 26 }}>
          <div className="panel">
            {items.map((item) => (
              <div className="cart-item" key={item.key}>
                <Link
                  to={`/produkter/${item.slug}`}
                  className="art"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  <ProductArt shape={item.art.shape} accent={item.art.accent} title={item.name} />
                </Link>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>
                    <Link to={`/produkter/${item.slug}`}>{item.name}</Link>
                  </h3>
                  <p className="dim" style={{ margin: '4px 0 8px', fontSize: '0.86rem' }}>
                    {item.color}
                    {item.sizeName ? ` · ${item.sizeName}` : ''} · {formatPrice(item.unitPrice)}/st
                  </p>
                  <div className="row">
                    <div className="qty">
                      <button
                        type="button"
                        aria-label="Minska antal"
                        onClick={() => setQuantity(item.key, item.quantity - 1)}
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Öka antal"
                        onClick={() => setQuantity(item.key, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button type="button" className="btn-quiet" onClick={() => remove(item.key)}>
                      Ta bort
                    </button>
                  </div>
                </div>
                <strong>{formatPrice(item.unitPrice * item.quantity)}</strong>
              </div>
            ))}
            <div className="row" style={{ marginTop: 16 }}>
              <Link className="btn btn-ghost" to="/produkter">
                Fortsätt handla
              </Link>
              <button type="button" className="btn-quiet" onClick={clear}>
                Töm varukorgen
              </button>
            </div>
          </div>

          <aside className="panel sticky-panel">
            <h2>Sammanfattning</h2>
            <div className="summary-row">
              <span>Delsumma</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>Frakt</span>
              <span>{shipping === 0 ? 'Fri' : formatPrice(shipping)}</span>
            </div>
            <div className="summary-row total">
              <span>Totalt</span>
              <span>{formatPrice(subtotal + shipping)}</span>
            </div>
            {missingForFreeShipping > 0 && (
              <p className="notice" style={{ marginTop: 14 }}>
                Handla för {formatPrice(missingForFreeShipping)} till så bjuder vi på frakten.
              </p>
            )}
            <Link className="btn btn-block btn-lg" to="/kassa" style={{ marginTop: 18 }}>
              Till kassan
            </Link>
            <p className="dim" style={{ fontSize: '0.82rem', marginTop: 12, marginBottom: 0 }}>
              Alla priser inkl. moms · 30 dagars öppet köp
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
