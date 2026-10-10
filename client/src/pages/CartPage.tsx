import { Link } from 'react-router';
import { ProductImage } from '../components/ProductImage';
import { DiscountField } from '../components/DiscountField';
import { ShippingPicker } from '../components/ShippingPicker';
import { useCart } from '../lib/cart';
import { cartTotals } from '../lib/totals';
import { useDiscount } from '../lib/useDiscount';
import { formatPrice } from '../lib/format';
import { fetchConfig } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { useAsync } from '../lib/useAsync';
import { useDocumentMeta } from '../lib/meta';

export function CartPage() {
  useDocumentMeta({
    title: 'Din varukorg',
    description: 'Varorna du valt, innan du går till kassan.',
    noindex: true,
  });
  const {
    items,
    subtotal,
    setQuantity,
    remove,
    clear,
    discountCode,
    setDiscountCode,
    shippingOptionId,
    setShippingOptionId,
  } = useCart();
  const config = useAsync(() => fetchConfig(), []);
  const shippingOptions = config.data?.shipping.options ?? [];
  const defaultShipping = config.data?.shipping.defaultId ?? '';
  const selectedShipping = shippingOptionId || defaultShipping;
  const option = shippingOptions.find((entry) => entry.id === selectedShipping);

  const { discount, error: discountError, checking } = useDiscount(discountCode, items);
  const totals = cartTotals({ subtotal, option, discount });
  const missingForFreeShipping =
    option?.freeOver !== undefined && totals.shipping > 0 ? option.freeOver - subtotal : 0;

  if (items.length === 0) {
    return (
      <>
        <PageHeader
          title="Varukorgen är tom"
          text="Sortimentet finns kvar – och vi printar lika gärna din egen fil."
        />
        <section className="section">
          <div className="container center">
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link className="btn btn-lg" to="/produkter">
                Till produkterna
              </Link>
              <Link className="btn btn-ghost btn-lg" to="/egen-print">
                Beställ egen print
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Varukorg"
        text={`${items.length} ${items.length === 1 ? 'produkt' : 'produkter'} redo att printas åt dig.`}
        crumbs={[{ to: '/produkter', label: 'Produkter' }]}
      />
      <section className="section">
        <div className="container">
          <ol className="steps">
            <li className="current">Varukorg</li>
            <li>Uppgifter</li>
            <li>Bekräftelse</li>
          </ol>
          <div className="cart-layout">
            <div className="panel">
              {items.map((item) => (
                <div className="cart-item" key={item.key}>
                  <Link
                    to={`/produkter/${item.slug}`}
                    className="art"
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    <ProductImage product={{ name: item.name, art: item.art, image: item.image }} />
                  </Link>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>
                      <Link to={`/produkter/${item.slug}`}>{item.name}</Link>
                    </h3>
                    <p className="dim" style={{ margin: '4px 0 8px', fontSize: '0.86rem' }}>
                      {item.color}
                      {item.sizeName ? ` · ${item.sizeName}` : ''} · {formatPrice(item.unitPrice)}
                      /st
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
              {totals.discount > 0 && discount && (
                <div className="summary-row discount">
                  <span>Rabatt ({discount.label})</span>
                  <span>−{formatPrice(totals.discount)}</span>
                </div>
              )}
              <div className="summary-row">
                <span>Frakt{option ? ` (${option.name})` : ''}</span>
                <span>{totals.shipping === 0 ? 'Fri' : formatPrice(totals.shipping)}</span>
              </div>
              <div className="summary-row total">
                <span>Totalt</span>
                <span>{formatPrice(totals.total)}</span>
              </div>
              {missingForFreeShipping > 0 && (
                <p className="notice" style={{ marginTop: 14 }}>
                  Handla för {formatPrice(missingForFreeShipping)} till så bjuder vi på frakten.
                </p>
              )}

              <div style={{ marginTop: 18 }}>
                <DiscountField
                  code={discountCode}
                  discount={discount}
                  error={discountError}
                  checking={checking}
                  onApply={setDiscountCode}
                  onClear={() => setDiscountCode('')}
                />
              </div>

              <div style={{ marginTop: 18 }}>
                <ShippingPicker
                  options={shippingOptions}
                  selected={selectedShipping}
                  subtotal={subtotal}
                  freeShipping={discount?.freeShipping}
                  onSelect={setShippingOptionId}
                />
              </div>
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
    </>
  );
}
