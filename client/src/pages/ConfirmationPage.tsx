import { Link, useLocation, useParams } from 'react-router';
import { OrderSummary } from '../components/OrderSummary';
import { fetchOrder } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { useAsync } from '../lib/useAsync';
import type { AnyOrder } from '../types';

export function ConfirmationPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  // Ordern skickas med i navigeringen efter köp, annars hämtas den från servern.
  const passed = (location.state as { order?: AnyOrder } | null)?.order;
  const { data, loading, error } = useAsync(
    () => (passed ? Promise.resolve({ order: passed }) : fetchOrder(id)),
    [id, passed],
  );

  return (
    <>
      <PageHeader
        eyebrow="Bekräftelse"
        title="Tack för din beställning!"
        text={
          data
            ? `Vi har skickat en bekräftelse till ${data.order.customer.email} tillsammans med en betalningslänk.`
            : 'Vi hämtar din order.'
        }
      />
      <section className="section">
        <div className="container receipt">
          <ol className="steps">
            <li className="done">Varukorg</li>
            <li className="done">Uppgifter</li>
            <li className="current">Bekräftelse</li>
          </ol>

          {loading && <div className="skeleton" style={{ aspectRatio: 'auto', height: 300 }} />}
          {error && <p className="notice notice-error">{error}</p>}

          {data && (
            <>
              <OrderSummary order={data.order} />
              <p className="muted" style={{ marginTop: 18, fontSize: '0.9rem' }}>
                Spara ordernumret – med det följer du jobbet hela vägen från kön till leverans.
              </p>
              <div className="row" style={{ marginTop: 18 }}>
                <Link className="btn" to="/produkter">
                  Fortsätt handla
                </Link>
                <Link className="btn btn-ghost" to={`/spara-order?id=${data.order.id}`}>
                  Spåra ordern
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
