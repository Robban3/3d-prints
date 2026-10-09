import { useCallback, useEffect, useState } from 'react';
import { OrderTimeline } from '../OrderTimeline';
import { ApiError, fetchAdminOrders, setOrderStatus } from '../../lib/api';
import { formatDate, formatPrice } from '../../lib/format';
import { statusLabels } from '../../lib/status';
import type { AnyOrder, OrderStatus } from '../../types';

type AdminOrder = AnyOrder & { next: OrderStatus[] };

interface Props {
  token: string;
  onUnauthorized: () => void;
}

/** Ordrarna, med knappar för att flytta dem framåt i produktionen. */
export function OrderManager({ token, onUnauthorized }: Props) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchAdminOrders(token);
      setOrders(result.orders);
      setError(null);
    } catch (caught) {
      setOrders(null);
      setError(caught instanceof ApiError ? caught.message : 'Kunde inte hämta ordrar');
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized();
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(order: AdminOrder, next: OrderStatus) {
    setBusy(order.id);
    setNotice(null);
    try {
      const result = await setOrderStatus(token, order.id, next);
      setNotice(
        result.mail
          ? result.mail.delivered
            ? `Statusmejl skickat till ${order.customer.email}.`
            : `Statusmejl lagt i utkorgen (${result.mail.path ?? 'data/utkorg'}).`
          : `${order.id} är nu ${statusLabels[next].toLowerCase()}.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Statusbytet gick inte igenom');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h2>
        Ordrar {orders ? <span className="dim">({orders.length})</span> : null}
      </h2>
      {notice && <p className="notice notice-success">{notice}</p>}
      {error && <p className="notice notice-error">{error}</p>}
      {!orders && !error && <div className="skeleton" style={{ aspectRatio: 'auto', height: 200 }} />}

      <div className="stack" style={{ gap: 16 }}>
        {orders?.map((order) => (
          <div className="panel" key={order.id}>
            <div className="spread">
              <div>
                <span className="order-id">{order.id}</span>
                <p className="dim" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
                  {formatDate(order.createdAt)} · {order.customer.name} · {order.customer.email}
                </p>
              </div>
              <div className="row">
                <span className="badge badge-accent">{statusLabels[order.status]}</span>
                <strong>{formatPrice(order.total)}</strong>
              </div>
            </div>

            <div className="grid-2" style={{ marginTop: 18, alignItems: 'start' }}>
              <div>
                <span className="field-label">Innehåll</span>
                <ul className="tick-list" style={{ marginTop: 8 }}>
                  {order.type === 'shop' ? (
                    order.lines.map((line) => (
                      <li key={`${line.productId}-${line.color}-${line.size ?? ''}`}>
                        {line.quantity} × {line.name}
                      </li>
                    ))
                  ) : (
                    <li>
                      {order.projectName} · {order.request.quantity} st{' '}
                      {order.request.material.toUpperCase()}
                    </li>
                  )}
                </ul>
              </div>
              <OrderTimeline order={order} />
            </div>

            {order.next.length > 0 && (
              <div className="row" style={{ marginTop: 14 }}>
                {order.next.map((next) => (
                  <button
                    key={next}
                    type="button"
                    className={next === 'avbruten' ? 'btn btn-ghost' : 'btn'}
                    disabled={busy === order.id}
                    onClick={() => void advance(order, next)}
                  >
                    {busy === order.id
                      ? 'Uppdaterar…'
                      : `Markera som ${statusLabels[next].toLowerCase()}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
