import { Link, useLocation, useParams } from "react-router-dom";
import { OrderSummary } from "../components/OrderSummary";
import { fetchOrder } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { AnyOrder } from "../types";

export function ConfirmationPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  // Ordern skickas med i navigeringen efter köp, annars hämtas den från servern.
  const passed = (location.state as { order?: AnyOrder } | null)?.order;
  const { data, loading, error } = useAsync(
    () => (passed ? Promise.resolve({ order: passed }) : fetchOrder(id)),
    [id, passed],
  );

  return (
    <section className="section">
      <div className="container receipt">
        <ol className="steps">
          <li className="done">Varukorg</li>
          <li className="done">Uppgifter</li>
          <li className="current">Bekräftelse</li>
        </ol>

        {loading && <div className="skeleton" style={{ height: 300 }} />}
        {error && <p className="notice notice-error">{error}</p>}

        {data && (
          <>
            <h1>Tack för din beställning!</h1>
            <p className="muted">
              Vi har skickat en bekräftelse till {data.order.customer.email}{" "}
              tillsammans med en betalningslänk. Spara ordernumret – med det kan
              du följa jobbet hela vägen från kön till leverans.
            </p>
            <OrderSummary order={data.order} />
            <div className="row" style={{ marginTop: 24 }}>
              <Link className="btn" to="/produkter">
                Fortsätt handla
              </Link>
              <Link
                className="btn btn-ghost"
                to={`/spara-order?id=${data.order.id}`}
              >
                Spåra ordern
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
