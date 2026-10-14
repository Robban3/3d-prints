import { useCallback, useEffect, useState } from 'react';
import { OrderTimeline } from '../OrderTimeline';
import { ApiError, fetchAdminOrders, fetchOperations, fetchPrintFiles, setOrderStatus, testShopEmail } from '../../lib/api';
import type { AdminPrintFile } from '../../lib/api';
import { ProductionCard } from './ProductionCard';
import { formatDate, formatPrice } from '../../lib/format';
import { statusLabels } from '../../lib/status';
import type { AnyOrder, OrderStatus } from '../../types';

type AdminOrder = AnyOrder & { next: OrderStatus[] };

interface Props {
  token: string;
  onUnauthorized: () => void;
  overview?: boolean;
}

/** Ordrarna, med knappar för att flytta dem framåt i produktionen. */
export function OrderManager({ token, onUnauthorized, overview = false }: Props) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>(overview ? 'active' : 'all');
  const [files, setFiles] = useState<AdminPrintFile[]>([]);
  const [operations, setOperations] = useState<Awaited<ReturnType<typeof fetchOperations>> | null>(null);
  const [serviceError, setServiceError] = useState('');
  const [testingMail, setTestingMail] = useState(false);
  async function testEmail() {
    setTestingMail(true);
    try { const result = await testShopEmail(token); setNotice(result.accepted ? 'E-posttjänsten har accepterat testmejlet till support@formlabb.se. Kontrollera inkorgen för slutlig leverans.' : 'Testmejlet kunde inte skickas.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'E-posttestet misslyckades.'); }
    finally { setTestingMail(false); }
  }
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());
  const active = (order: AdminOrder) => ['mottagen', 'i_produktion'].includes(order.status);
  const overdue = (order: AdminOrder) => active(order) && Boolean(order.production?.dueDate && order.production.dueDate < today);
  const unpaid = (order: AdminOrder) => !['levererad', 'avbruten'].includes(order.status) && (!order.payment || order.payment.test || order.payment.status !== 'auktoriserad');

  const load = useCallback(async () => {
    try {
      const result = await fetchAdminOrders(token);
      setOrders(result.orders);
      setError(null);
      const [library, status] = await Promise.allSettled([fetchPrintFiles(token), fetchOperations(token)]);
      if (library.status === 'fulfilled') setFiles(library.value.files.filter(file => file.source === 'own'));
      if (status.status === 'fulfilled') setOperations(status.value);
      setServiceError(library.status === 'rejected' || status.status === 'rejected' ? 'Kunde inte uppdatera filbibliotek eller driftkonfiguration. Försök igen.' : '');
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
    if (next === 'avbruten' && !window.confirm(`Avbryt ${order.id}? Eventuellt reserverat lager återförs. En extern betalning återbetalas inte automatiskt.`)) return;
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
      {overview && <>
        <h2>Verkstadsöversikt</h2>
        <div className="workshop-metrics">
          {[['mottagen', 'Nya order', orders?.filter(order => order.status === 'mottagen').length], ['i_produktion', 'I produktion', orders?.filter(order => order.status === 'i_produktion').length], ['unpaid', 'Väntar betalning', orders?.filter(unpaid).length], ['overdue', 'Passerat klardatum', orders?.filter(overdue).length]].map(([key, label, count]) => <button type="button" className="panel workshop-metric" aria-pressed={filter === key} key={key} onClick={() => setFilter(String(key))}><span>{label}</span><strong>{count ?? '–'}</strong></button>)}
        </div>
        <div className="panel" style={{ margin: '18px 0' }}><h3>Driftkonfiguration</h3>{operations ? <div className="chip-row"><span className="badge">E-post: {operations.emailConfigured ? 'konfigurerad' : 'ej aktiverad'}</span><span className="badge">Klarna: {!operations.paymentConfigured ? 'ej aktiverad' : operations.paymentEnvironment === 'production' ? 'produktionsnycklar' : 'testnycklar'}</span><span className="badge">Orderlagring: {operations.storage === 'r2' ? 'privat R2' : 'lokal'}</span></div> : <p>Hämtar konfiguration…</p>}<p className="dim">Konfigurationen visar vilka tjänster som är inställda. Den är ingen garanti för leverans eller genomförd betalning. Auktorisering behöver fortfarande följas av debitering.</p><button type="button" className="btn btn-ghost" disabled={!operations?.emailConfigured || testingMail} onClick={() => void testEmail()}>{testingMail ? 'Skickar test…' : 'Testa e-post till support@formlabb.se'}</button></div>
      </>}
      <h2>
        Ordrar {orders ? <span className="dim">({orders.length})</span> : null}
      </h2>
      {notice && <p className="notice notice-success">{notice}</p>}
      {error && <p className="notice notice-error">{error}</p>}
      {serviceError && <p className="notice notice-error">{serviceError}</p>}
      <div className="workshop-toolbar"><label className="field">Sök order<input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Ordernummer, kund eller projekt" /></label><label className="field">Visa<select className="input" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Alla order</option><option value="active">Aktiva printjobb</option><option value="unpaid">Väntar betalning</option><option value="overdue">Passerat klardatum</option>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><button type="button" className="btn btn-ghost" onClick={() => void load()}>Uppdatera</button></div>
      {!orders && !error && <div className="skeleton" style={{ aspectRatio: 'auto', height: 200 }} />}

      <div className="stack" style={{ gap: 16 }}>
        {orders?.filter(order => (filter === 'all' || (filter === 'active' ? active(order) : filter === 'unpaid' ? unpaid(order) : filter === 'overdue' ? overdue(order) : order.status === filter)) && [order.id, order.customer.name, order.customer.email, order.type === 'custom' ? order.projectName : order.lines.map(line => line.name).join(' ')].join(' ').toLowerCase().includes(query.trim().toLowerCase())).map((order) => (
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
                        {line.quantity} × {line.name} · {line.color}{line.size ? ` · ${line.size}` : ''}
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
            <div className="chip-row" style={{ margin: '16px 0' }}><span className="badge">{order.payment?.test ? 'Obetald · testorder' : order.payment?.status === 'auktoriserad' ? 'Klarna auktoriserad' : 'Betalning avvaktar'}</span>{order.production?.machine && <span className="badge">{order.production.machine}</span>}{order.production?.dueDate && <span className="badge">Klardatum {order.production.dueDate}{overdue(order) ? ' · passerat' : ''}</span>}</div>
            <ProductionCard order={order} token={token} files={files} onSaved={(updated, next) => setOrders(current => current?.map(entry => entry.id === updated.id ? { ...updated, next } : entry) ?? null)} />

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
