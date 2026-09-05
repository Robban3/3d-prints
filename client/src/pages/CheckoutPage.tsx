import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CustomerForm } from '../components/CustomerForm';
import { useCart } from '../lib/cart';
import { ApiError, fetchConfig, placeOrder } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatPrice } from '../lib/format';
import type { CustomerDetails } from '../types';

const emptyCustomer: CustomerDetails = {
  name: '',
  email: '',
  phone: '',
  address: '',
  postalCode: '',
  city: '',
  note: '',
};

export function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const config = useAsync(() => fetchConfig(), []);
  const shippingConfig = config.data?.shipping ?? {
    fee: 59,
    freeThreshold: 599,
  };
  const shipping = subtotal >= shippingConfig.freeThreshold ? 0 : shippingConfig.fee;

  const [customer, setCustomer] = useState<CustomerDetails>(emptyCustomer);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (items.length === 0) {
    return (
      <section className="section">
        <div className="container center">
          <h1>Inget att gå till kassan med</h1>
          <p className="muted">Lägg till något i varukorgen först.</p>
          <Link className="btn" to="/produkter">
            Till produkterna
          </Link>
        </div>
      </section>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setErrors({});
    try {
      const result = await placeOrder({
        customer,
        lines: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          color: item.color,
          size: item.size,
        })),
      });
      clear();
      navigate(`/order/${result.order.id}`, { state: { order: result.order } });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setSubmitError(error.message);
      } else {
        setSubmitError('Beställningen gick inte igenom. Försök igen.');
      }
      setSubmitting(false);
    }
  }

  return (
    <section className="section">
      <div className="container">
        <ol className="steps">
          <li className="done">Varukorg</li>
          <li className="current">Uppgifter</li>
          <li>Bekräftelse</li>
        </ol>
        <h1>Kassa</h1>

        <form className="cart-layout" style={{ marginTop: 26 }} onSubmit={submit} noValidate>
          <div className="stack" style={{ gap: 22 }}>
            <div className="panel">
              <h2>Leveransuppgifter</h2>
              <CustomerForm
                value={customer}
                errors={errors}
                onChange={(update) => setCustomer((current) => ({ ...current, ...update }))}
                noteLabel="Meddelande till verkstaden (valfritt)"
                notePlaceholder="Portkod, önskat leveransdatum eller en hälsning om det är en present."
              />
            </div>
            <div className="panel">
              <h2>Betalning</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                Vi skickar en betalningslänk (Swish, kort eller faktura) till din e-post så snart
                ordern är bekräftad. Inga kortuppgifter lämnas här.
              </p>
            </div>
          </div>

          <aside className="panel sticky-panel">
            <h2>Din order</h2>
            {items.map((item) => (
              <div className="summary-row" key={item.key}>
                <span>
                  {item.quantity} × {item.name}
                  <br />
                  <span className="dim" style={{ fontSize: '0.82rem' }}>
                    {item.color}
                    {item.sizeName ? ` · ${item.sizeName}` : ''}
                  </span>
                </span>
                <span>{formatPrice(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
            <div className="summary-row">
              <span>Frakt</span>
              <span>{shipping === 0 ? 'Fri' : formatPrice(shipping)}</span>
            </div>
            <div className="summary-row total">
              <span>Att betala</span>
              <span>{formatPrice(subtotal + shipping)}</span>
            </div>

            {submitError && (
              <p className="notice notice-error" style={{ marginTop: 16 }}>
                {submitError}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-block btn-lg"
              style={{ marginTop: 18 }}
              disabled={submitting}
            >
              {submitting ? 'Skickar…' : 'Slutför beställning'}
            </button>
            <Link className="btn btn-quiet btn-block" to="/varukorg" style={{ marginTop: 8 }}>
              Tillbaka till varukorgen
            </Link>
          </aside>
        </form>
      </div>
    </section>
  );
}
