import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { OrderSummary } from '../components/OrderSummary';
import { OrderTimeline } from '../components/OrderTimeline';
import { ApiError, fetchOrder } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import type { AnyOrder } from '../types';

export function TrackOrderPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const initialToken = new URLSearchParams(location.hash.slice(1)).get('access') ?? undefined;
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
      let orderId = id.trim();
      let token = initialToken;
      if (orderId.startsWith('https://') || orderId.startsWith('http://') || orderId.startsWith('/')) {
        const link = new URL(orderId, window.location.origin);
        if (link.origin !== window.location.origin) throw new Error('Fel webbplats');
        orderId = link.searchParams.get('id') ?? link.pathname.split('/').pop() ?? '';
        token = new URLSearchParams(link.hash.slice(1)).get('access') ?? undefined;
      }
      if (!token) { setError('Öppna eller klistra in din privata orderlänk. För en äldre order, kontakta support@formlabb.se.'); return; }
      const result = await fetchOrder(orderId, token);
      setOrder(result.order);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? 'Orderlänken är ogiltig. Kontrollera länken eller kontakta support@formlabb.se.'
          : 'Kunde inte hämta ordern just nu. Försök igen om en stund.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Orderstatus"
        title="Spåra din order"
        text="Använd din privata orderlänk från beställningen eller bekräftelsemejlet. Dela inte länken med andra."
      />
      <section className="section">
        <div className="container receipt">
          <form className="panel" onSubmit={submit}>
            <div className="field">
              <label htmlFor="orderId">Privat orderlänk eller ordernummer från länken</label>
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
            <div className="stack" style={{ marginTop: 24, gap: 20 }}>
              <div className="panel">
                <h2>Var är ordern nu?</h2>
                <OrderTimeline order={order} />
              </div>
              <OrderSummary order={order} />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
