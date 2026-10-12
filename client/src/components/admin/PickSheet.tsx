import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchPickList } from '../../lib/api';
import { formatDate, formatNumber } from '../../lib/format';
import { statusLabels } from '../../lib/status';
import type { OrderStatus, PickList } from '../../types';

/**
 * Plocklistan, gjord för att skrivas ut och tas med ut i verkstaden.
 *
 * Raderna är sammanslagna över ordrarna så varje sak hämtas en gång, men varje
 * rad bär med sig vilka ordrar den gäller – plocket är meningslöst om sakerna
 * sedan hamnar i fel låda. Rutan längst till vänster är till för pennan.
 */
export function PickSheet({
  token,
  ids,
  status,
  onClose,
}: {
  token: string;
  ids?: string[];
  status?: OrderStatus;
  onClose: () => void;
}) {
  const [list, setList] = useState<PickList | null>(null);
  const [error, setError] = useState('');

  const key = ids?.join(',') ?? '';
  const load = useCallback(async () => {
    setError('');
    try {
      const selection = key ? { ids: key.split(',') } : { status };
      setList((await fetchPickList(token, selection)).list);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Plocklistan kunde inte hämtas.');
    }
  }, [token, key, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="panel printable">
      <div className="spread">
        {/* Rubriken följer med ut på pappret; knapparna gör det inte. */}
        <h3 style={{ margin: 0 }}>Plocklista</h3>
        <div className="row no-print">
          <button type="button" className="btn" onClick={() => window.print()}>
            Skriv ut
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Stäng
          </button>
        </div>
      </div>

      {error && <p className="notice notice-error">{error}</p>}
      {!list && !error && <div className="skeleton" style={{ height: 140, marginTop: 14 }} />}

      {list && (
        <>
          <p className="dim" style={{ marginTop: 10, fontSize: '0.84rem' }}>
            {formatDate(list.generatedAt)} · {list.orders} {list.orders === 1 ? 'order' : 'ordrar'}{' '}
            · {list.items} exemplar
            {list.statuses.length > 0 &&
              ` · ${list.statuses.map((entry) => statusLabels[entry]).join(', ')}`}
          </p>

          {list.rows.length === 0 && list.jobs.length === 0 && (
            <p className="muted">Det finns ingenting att plocka i det här urvalet.</p>
          )}

          {list.rows.length > 0 && (
            <ul className="pick-list">
              {list.rows.map((row) => (
                <li key={row.key}>
                  <span className="pick-box" aria-hidden="true" />
                  <span className="pick-count">{row.quantity} st</span>
                  <span className="pick-main">
                    <strong>{row.name}</strong>
                    <span className="dim">
                      {row.color}
                      {row.size ? ` · ${row.size}` : ''}
                      {row.parameterText ? ` · ${row.parameterText}` : ''}
                      {row.material ? ` · ${row.material.toUpperCase()}` : ''}
                      {row.grams !== undefined ? ` · ${formatNumber(row.grams)} g` : ''}
                    </span>
                    <span className="dim">
                      {row.orders
                        .map((entry) => `${entry.id} (${entry.quantity} st, ${entry.customer})`)
                        .join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {list.jobs.length > 0 && (
            <>
              <h4 style={{ marginBottom: 8 }}>Egna printjobb</h4>
              <ul className="pick-list">
                {list.jobs.map((job) => (
                  <li key={job.orderId}>
                    <span className="pick-box" aria-hidden="true" />
                    <span className="pick-count">{job.quantity} st</span>
                    <span className="pick-main">
                      <strong>
                        {job.orderId} · {job.projectName}
                      </strong>
                      <span className="dim">
                        {job.customer} · {job.material.toUpperCase()} {job.quality}
                        {job.fileName ? ` · ${job.fileName}` : ''}
                      </span>
                      <span className="dim">{job.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
