import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { OrderSummary } from '../components/OrderSummary';
import { ApiError, fetchOrder } from '../lib/api';
import type { AnyOrder } from '../types';

export function TrackOrderPage() {
  const [params] = useSearchParams();
  const [id, setId] = useState(params.get('id') ?? '');
  const [order, setOrder] = useState<AnyOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const result = await fetchOrder(id.trim());
      setOrder(result.order);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? 'Vi hittar ingen order med det numret. Kontrollera stavningen.'
          : 'Kunde inte hämta ordern just nu. Försök igen om en stund.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <div className="container receipt">
        <h1>Spåra din order</h1>
        <p className="muted">
          Ordernumret står i bekräftelsemejlet och börjar med S för butiksorder eller C för egna
          printjobb.
        </p>

        <form className="panel" onSubmit={submit}>
          <div className="field">
            <label htmlFor="orderId">Ordernummer</label>
            <input
              id="orderId"
              className="input"
              placeholder="S2026-A1B2C3"
              value={id}
              onChange={(event) => setId(event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn"
            style={{ marginTop: 16 }}
            disabled={loading || !id.trim()}
          >
            {loading ? 'Söker…' : 'Hämta order'}
          </button>
        </form>

        {error && (
          <p className="notice notice-error" style={{ marginTop: 20 }}>
            {error}
          </p>
        )}
        {order && (
          <div style={{ marginTop: 24 }}>
            <OrderSummary order={order} />
          </div>
        )}
      </div>
    </section>
  );
}
