import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { OrderSummary } from '../components/OrderSummary';
import { OrderTimeline } from '../components/OrderTimeline';
import { ApiError, fetchOrder } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { formatDate, formatHours } from '../lib/format';
import type { AnyOrder, QueuePlace } from '../types';
import { useDocumentMeta } from '../lib/meta';

export function TrackOrderPage() {
  useDocumentMeta({
    title: 'Spåra din order',
    description: 'Slå upp en beställning med ordernummer och se var den står.',
    noindex: true,
  });
  const [params] = useSearchParams();
  const [id, setId] = useState(params.get('id') ?? '');
  const [order, setOrder] = useState<AnyOrder | null>(null);
  const [place, setPlace] = useState<QueuePlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    setOrder(null);
    setPlace(null);
    try {
      const result = await fetchOrder(id.trim());
      setOrder(result.order);
      setPlace(result.queue ?? null);
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
    <>
      <PageHeader
        eyebrow="Orderstatus"
        title="Spåra din order"
        text="Ordernumret står i bekräftelsemejlet och börjar med S för butiksorder eller C för egna printjobb."
      />
      <section className="section">
        <div className="container receipt">
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
            <div className="stack" style={{ marginTop: 24, gap: 20 }}>
              <div className="panel">
                <h2>Var är ordern nu?</h2>
                <OrderTimeline order={order} />
                {place && (
                  <p className="notice" style={{ marginTop: 16 }}>
                    Ordern står på <strong>plats {place.position}</strong> av {place.jobs} i
                    verkstadens kö. Printningen beräknas starta {formatDate(place.startsAt)} och
                    vara klar {formatDate(place.readyAt)}
                    {place.position > 1
                      ? ` – ungefär ${formatHours(
                          (Date.parse(place.startsAt) - Date.now()) / 3_600_000,
                        )} till start.`
                      : '.'}
                  </p>
                )}
              </div>
              <OrderSummary order={order} />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
