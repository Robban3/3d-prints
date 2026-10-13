import { Link, useLocation, useParams } from 'react-router';
import { OrderSummary } from '../components/OrderSummary';
import { fetchOrder } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { useAsync } from '../lib/useAsync';

export function ConfirmationPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const accessToken = new URLSearchParams(location.hash.slice(1)).get('access') ?? undefined;
  const { data, loading, error } = useAsync(
    () => fetchOrder(id, accessToken),
    [id, accessToken],
  );

  return (
    <>
      <PageHeader
        eyebrow="Bekräftelse"
        title="Tack för din beställning!"
        text={
          data
            ? 'Din beställning är registrerad. Spara den privata orderlänken för att följa din beställning.'
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
                Spara den privata orderlänken och dela den inte med andra. Ordernumret ensamt ger inte tillgång till dina kunduppgifter.
              </p>
              <div className="row" style={{ marginTop: 18 }}>
                <Link className="btn" to="/produkter">
                  Fortsätt handla
                </Link>
                <Link className="btn btn-ghost" to={`/spara-order?id=${data.order.id}#access=${accessToken}`}>
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
