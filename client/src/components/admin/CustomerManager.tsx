import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchCustomer, fetchCustomers } from '../../lib/api';
import { formatDate, formatPrice } from '../../lib/format';
import { statusLabels } from '../../lib/status';
import { OrderSummary } from '../OrderSummary';
import type { AnyOrder, CustomerRecord, CustomerSummary } from '../../types';

/**
 * Kundregistret. Räknas fram ur ordrarna, så det finns inget vid sidan om som
 * hinner bli osant: en kund är någon som har lagt en order, och adressen som
 * gäller är den på den senaste.
 */
export function CustomerManager({ token }: { token: string }) {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{ customer: CustomerRecord; orders: AnyOrder[] } | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCustomers(token, search);
      setCustomers(data.customers);
      setSummary(data.summary);
      setTotal(data.total);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Kunderna kunde inte hämtas.');
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  // En paus innan sökningen går iväg, så varje bokstav inte blir ett anrop.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openCustomer(customer: CustomerRecord) {
    if (open?.customer.email === customer.email) {
      setOpen(null);
      return;
    }
    try {
      setOpen(await fetchCustomer(token, customer.email));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Kunden kunde inte hämtas.');
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="spread" style={{ alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>
          Kunder {summary ? <span className="dim">({total})</span> : null}
        </h2>
      </div>

      {summary && (
        <div className="stat-row">
          <div className="stat-tile">
            <span className="stat-label">Kunder</span>
            <strong className="stat-value">{summary.customers}</strong>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Återkommande</span>
            <strong className="stat-value">{summary.returning}</strong>
            <span className="stat-note">har lagt mer än en order</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Snittorder</span>
            <strong className="stat-value">{formatPrice(summary.averageOrder)}</strong>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="kundsok">Sök</label>
        <input
          id="kundsok"
          className="input"
          placeholder="Namn, mejladress, ort eller ordernummer"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {message && <p className="notice notice-error">{message}</p>}
      {loading && <div className="skeleton" style={{ height: 160 }} />}
      {!loading && customers.length === 0 && (
        <p className="muted">
          {search ? 'Ingen kund matchar sökningen.' : 'Ingen har handlat ännu.'}
        </p>
      )}

      {customers.map((customer) => (
        <div key={customer.email}>
          <div className="admin-row">
            <div className="queue-printer">
              <span className="stat-label">Ordrar</span>
              <strong>{customer.orders}</strong>
            </div>

            <div className="admin-row-main">
              <strong>{customer.name}</strong>
              <span className="dim">
                {customer.email}
                {customer.phone ? ` · ${customer.phone}` : ''}
              </span>
              <span className="dim">
                {customer.address}, {customer.postalCode} {customer.city}
              </span>
              <span className="dim">
                Först {formatDate(customer.firstOrderAt)} · senast{' '}
                {formatDate(customer.lastOrderAt)}
                {customer.favourites.length > 0
                  ? ` · köper helst ${customer.favourites[0]!.name}`
                  : ''}
              </span>
            </div>

            <div className="admin-row-meta">
              {customer.returning && <span className="badge badge-accent">Återkommande</span>}
              {Object.entries(customer.statuses).map(([status, count]) => (
                <span className="badge" key={status}>
                  {statusLabels[status as keyof typeof statusLabels]} {count}
                </span>
              ))}
            </div>

            <div className="admin-row-actions">
              <div className="center">
                <span className="stat-label">Handlat för</span>
                <strong style={{ display: 'block' }}>{formatPrice(customer.spent)}</strong>
              </div>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => void openCustomer(customer)}
              >
                {open?.customer.email === customer.email ? 'Dölj' : 'Ordrar'}
              </button>
            </div>
          </div>

          {open?.customer.email === customer.email && (
            <div className="stack" style={{ gap: 14, marginTop: 14, marginBottom: 6 }}>
              {open.orders.map((order) => (
                <OrderSummary key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
