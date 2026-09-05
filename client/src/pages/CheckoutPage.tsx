import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CustomerForm } from '../components/CustomerForm';
import { useCart } from '../lib/cart';
import { ApiError, createPaymentSession, fetchConfig, placeOrder } from '../lib/api';
import { KlarnaPayment } from '../components/KlarnaPayment';
import { loadKlarna, authorize } from '../lib/klarna';
import { useAsync } from '../lib/useAsync';
import { formatPrice } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import type { CustomerDetails, PaymentSession } from '../types';

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
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Beloppet i Klarnas widget måste följa varukorgen, så sessionen görs om när
  // innehållet ändras.
  const cartKey = items.map((item) => `${item.key}x${item.quantity}`).join('|');
  useEffect(() => {
    if (items.length === 0) return;
    let active = true;
    setSessionLoading(true);
    createPaymentSession({
      type: 'shop',
      lines: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        color: item.color,
        size: item.size,
      })),
    })
      .then((result) => {
        if (!active) return;
        setSession(result.session);
        setSessionError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSession(null);
        setSessionError(
          error instanceof ApiError
            ? error.message
            : 'Betalningen kunde inte förberedas. Du kan fortfarande lägga ordern och få en betalningslänk.',
        );
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey]);

  if (items.length === 0) {
    return (
      <>
        <PageHeader title="Kassan är tom" text="Lägg till något i varukorgen först." />
        <section className="section">
          <div className="container center">
            <Link className="btn btn-lg" to="/produkter">
              Till produkterna
            </Link>
          </div>
        </section>
      </>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setErrors({});
    try {
      let authorizationToken: string | undefined;
      if (session && !session.test) {
        // Kunden godkänner betalningen i Klarnas widget innan ordern skapas.
        const payments = await loadKlarna();
        authorizationToken = await authorize(
          payments,
          session.paymentMethodCategories[0]?.identifier,
          {
            billing_address: {
              given_name: customer.name.split(' ')[0],
              family_name: customer.name.split(' ').slice(1).join(' '),
              email: customer.email,
              street_address: customer.address,
              postal_code: customer.postalCode,
              city: customer.city,
              phone: customer.phone,
              country: 'SE',
            },
          },
        );
      }

      const result = await placeOrder({
        customer,
        lines: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          color: item.color,
          size: item.size,
        })),
        authorizationToken,
      });
      clear();
      navigate(`/order/${result.order.id}`, { state: { order: result.order } });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        // Lagerfel hör inte till något fält i formuläret och visas därför samlat.
        const stockMessages = Object.entries(error.fields)
          .filter(([field]) => field.startsWith('stock.'))
          .map(([, message]) => message);
        setSubmitError(stockMessages.length > 0 ? stockMessages.join(' ') : error.message);
      } else {
        setSubmitError(
          error instanceof Error ? error.message : 'Beställningen gick inte igenom. Försök igen.',
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Kassa"
        text="Fyll i vart det ska skickas. Betalningslänken mejlas när ordern är bekräftad."
        crumbs={[{ to: '/varukorg', label: 'Varukorg' }]}
      />
      <section className="section">
        <div className="container">
          <ol className="steps">
            <li className="done">Varukorg</li>
            <li className="current">Uppgifter</li>
            <li>Bekräftelse</li>
          </ol>

          <form className="cart-layout" onSubmit={submit} noValidate>
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
              <KlarnaPayment session={session} loading={sessionLoading} error={sessionError} />
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
    </>
  );
}
