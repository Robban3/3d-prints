import { useCallback, useEffect, useState } from 'react';
import { OrderTimeline } from '../OrderTimeline';
import { ApiError, fetchAdminOrders, setOrderStatus, setOrderStatuses } from '../../lib/api';
import { formatDate, formatPrice } from '../../lib/format';
import { statusLabels } from '../../lib/status';
import type { AnyOrder, OrderStatus } from '../../types';
import { ModelPanel } from '../ModelPanel';
import { PickSheet } from './PickSheet';
import { sharedNext } from '../../lib/bulk';

type AdminOrder = AnyOrder & { next: OrderStatus[] };

interface Props {
  token: string;
  onUnauthorized: () => void;
}

const FILTERS: Array<{ id: OrderStatus | 'alla'; label: string }> = [
  { id: 'alla', label: 'Alla' },
  { id: 'mottagen', label: 'Mottagna' },
  { id: 'i_produktion', label: 'I produktion' },
  { id: 'skickad', label: 'Skickade' },
  { id: 'levererad', label: 'Levererade' },
  { id: 'avbruten', label: 'Avbrutna' },
];

/** Ordrarna, med knappar för att flytta dem framåt i produktionen. */
export function OrderManager({ token, onUnauthorized }: Props) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderStatus | 'alla'>('alla');
  const [picked, setPicked] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ ids?: string[]; status?: OrderStatus } | null>(null);

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

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  /** Flyttar hela urvalet. Det som inte gick rapporteras, inte bara det som gick. */
  async function advanceMany(next: OrderStatus) {
    setBusy('bulk');
    setNotice(null);
    setError(null);
    try {
      const result = await setOrderStatuses(token, picked, next);
      const moved = `${result.moved.length} ${result.moved.length === 1 ? 'order' : 'ordrar'} är nu ${statusLabels[next].toLowerCase()}.`;
      setNotice(
        result.failed.length === 0
          ? moved
          : `${moved} ${result.failed.length} gick inte: ${result.failed
              .map((entry) => `${entry.id} – ${entry.reason}`)
              .join(' ')}`,
      );
      setPicked([]);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Statusbytet gick inte igenom');
    } finally {
      setBusy(null);
    }
  }

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

  const shown = orders?.filter((order) => filter === 'alla' || order.status === filter) ?? null;
  const selected = orders?.filter((order) => picked.includes(order.id)) ?? [];
  const bulkStatuses = sharedNext(selected);

  return (
    <>
      <div className="spread" style={{ alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>
          Ordrar {orders ? <span className="dim">({orders.length})</span> : null}
        </h2>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setSheet({ status: 'mottagen' })}
        >
          Plocklista för mottagna
        </button>
      </div>

      <div className="chip-row">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="chip"
            aria-pressed={filter === entry.id}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {notice && <p className="notice notice-success">{notice}</p>}
      {error && <p className="notice notice-error">{error}</p>}
      {!orders && !error && (
        <div className="skeleton" style={{ aspectRatio: 'auto', height: 200 }} />
      )}

      {sheet && (
        <div style={{ marginBottom: 18 }}>
          <PickSheet
            token={token}
            ids={sheet.ids}
            status={sheet.status}
            onClose={() => setSheet(null)}
          />
        </div>
      )}

      {shown && shown.length > 0 && (
        <div className="bulk-bar">
          <label className="checkbox bulk-all">
            <input
              type="checkbox"
              checked={picked.length > 0 && picked.length === shown.length}
              // Halvmarkerat när bara en del av urvalet är i kryss.
              ref={(node) => {
                if (node) node.indeterminate = picked.length > 0 && picked.length < shown.length;
              }}
              onChange={(event) =>
                setPicked(event.target.checked ? shown.map((order) => order.id) : [])
              }
            />
            <span>
              <strong>
                {picked.length > 0 ? `${picked.length} markerade` : 'Markera alla i listan'}
              </strong>
            </span>
          </label>

          {picked.length > 0 && (
            <div className="row">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSheet({ ids: picked })}
              >
                Plocklista
              </button>
              {bulkStatuses.map((next) => (
                <button
                  key={next}
                  type="button"
                  className={next === 'avbruten' ? 'btn btn-ghost' : 'btn'}
                  disabled={busy === 'bulk'}
                  onClick={() => void advanceMany(next)}
                >
                  {busy === 'bulk'
                    ? 'Uppdaterar…'
                    : `Markera som ${statusLabels[next].toLowerCase()}`}
                </button>
              ))}
              {bulkStatuses.length === 0 && (
                <span className="dim" style={{ fontSize: '0.84rem' }}>
                  De markerade ordrarna har inget gemensamt nästa steg.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="stack" style={{ gap: 16 }}>
        {shown?.length === 0 && <p className="muted">Inga ordrar med den statusen.</p>}
        {shown?.map((order) => (
          <div className="panel" key={order.id}>
            <div className="spread">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  aria-label={`Markera ${order.id}`}
                  checked={picked.includes(order.id)}
                  onChange={() => toggle(order.id)}
                />
                <div>
                  <span className="order-id">{order.id}</span>
                  <p className="dim" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
                    {formatDate(order.createdAt)} · {order.customer.name} · {order.customer.email}
                  </p>
                </div>
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
                      <li
                        key={`${line.productId}-${line.color}-${line.size ?? ''}-${
                          line.parameterText ?? ''
                        }`}
                      >
                        {line.quantity} × {line.name}
                        {line.parameterText ? ` · ${line.parameterText}` : ''}
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

            {order.type === 'custom' && (
              <ModelPanel
                fileName={order.fileName}
                fileUrl={order.fileUrl}
                fileSize={order.fileSize}
                model={order.model}
                collapsible
              />
            )}

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
