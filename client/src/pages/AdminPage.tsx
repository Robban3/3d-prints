import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { OrderTimeline } from '../components/OrderTimeline';
import { ApiError, fetchAdminOrders, fetchAdminStatus, setOrderStatus } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate, formatPrice } from '../lib/format';
import { statusLabels } from '../lib/status';
import type { AnyOrder, OrderStatus } from '../types';

const STORAGE_KEY = 'formlabb.admin.token';

type AdminOrder = AnyOrder & { next: OrderStatus[] };

/**
 * Enkel verkstadsvy för att flytta ordrar framåt. Nyckeln ligger i
 * sessionStorage, så den försvinner när fliken stängs.
 */
export function AdminPage() {
  const status = useAsync(() => fetchAdminStatus(), []);
  const [token, setToken] = useState(() => {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [input, setInput] = useState('');
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (key: string) => {
    try {
      const result = await fetchAdminOrders(key);
      setOrders(result.orders);
      setError(null);
    } catch (caught) {
      setOrders(null);
      setError(caught instanceof ApiError ? caught.message : 'Kunde inte hämta ordrar');
      if (caught instanceof ApiError && caught.status === 401) setToken('');
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  function signIn(event: React.FormEvent) {
    event.preventDefault();
    const key = input.trim();
    if (!key) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, key);
    } catch {
      // Utan lagring får nyckeln leva i minnet under sidans livstid.
    }
    setToken(key);
    setInput('');
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
      await load(token);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Statusbytet gick inte igenom');
    } finally {
      setBusy(null);
    }
  }

  if (status.data && !status.data.enabled) {
    return (
      <>
        <PageHeader
          eyebrow="Verkstaden"
          title="Adminläget är avstängt"
          text="Servern startades utan ADMIN_TOKEN, så den här vyn är inte tillgänglig."
        />
        <section className="section">
          <div className="container receipt">
            <div className="panel">
              <p className="muted" style={{ marginBottom: 0 }}>
                Sätt en nyckel på minst 16 tecken i <code>ADMIN_TOKEN</code> och starta om servern
                för att aktivera orderhanteringen.
              </p>
            </div>
          </div>
        </section>
      </>
    );
  }

  if (!token) {
    return (
      <>
        <PageHeader
          eyebrow="Verkstaden"
          title="Logga in"
          text="Ange adminnyckeln för att se ordrar."
        />
        <section className="section">
          <div className="container receipt">
            <form className="panel" onSubmit={signIn}>
              <div className="field">
                <label htmlFor="adminToken">Adminnyckel</label>
                <input
                  id="adminToken"
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
              </div>
              {error && (
                <p className="notice notice-error" style={{ marginTop: 14 }}>
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="btn"
                style={{ marginTop: 16 }}
                disabled={!input.trim()}
              >
                Logga in
              </button>
            </form>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Verkstaden"
        title="Ordrar"
        text={orders ? `${orders.length} ordrar i systemet.` : 'Hämtar ordrar…'}
        aside={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              try {
                window.sessionStorage.removeItem(STORAGE_KEY);
              } catch {
                // Inget att göra – nyckeln försvinner ändå vid omladdning.
              }
              setToken('');
              setOrders(null);
            }}
          >
            Logga ut
          </button>
        }
      />

      <section className="section">
        <div className="container">
          {notice && <p className="notice notice-success">{notice}</p>}
          {error && <p className="notice notice-error">{error}</p>}
          {!orders && !error && (
            <div className="skeleton" style={{ aspectRatio: 'auto', height: 200 }} />
          )}

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
        </div>
      </section>
    </>
  );
}
