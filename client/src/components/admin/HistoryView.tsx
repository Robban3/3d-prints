import { useEffect, useState } from 'react';
import { ApiError, fetchHistory } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { AuditEntry } from '../../types';

const actionLabels: Record<AuditEntry['action'], string> = {
  skapad: 'Skapad',
  ändrad: 'Ändrad',
  borttagen: 'Borttagen',
  importerad: 'Importerad',
  status: 'Status',
};

/** Vad som ändrats i katalogen och i ordrarna, senaste först. */
export function HistoryView({ token }: { token: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchHistory(token)
      .then((result) => {
        if (active) setEntries(result.entries);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : 'Kunde inte hämta historiken');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <>
      <h2>Historik</h2>
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        De senaste ändringarna i katalogen och i ordrarnas status, med vem som gjorde dem. Händelser
        utan namn är från tiden före inloggningen, eller sådant som sker av sig självt – som
        beskedet till dem som bevakat en slutsåld produkt.
      </p>

      {error && <p className="notice notice-error">{error}</p>}
      {!entries && !error && (
        <div className="skeleton" style={{ aspectRatio: 'auto', height: 160 }} />
      )}
      {entries?.length === 0 && <p className="notice">Inga ändringar har gjorts ännu.</p>}

      <div className="stack" style={{ gap: 8 }}>
        {entries?.map((entry, index) => (
          <div className="history-row" key={`${entry.at}-${index}`}>
            <span className="badge">{actionLabels[entry.action]}</span>
            <span className="dim mono" style={{ fontSize: '0.8rem' }}>
              {entry.entity}
            </span>
            <strong>{entry.summary}</strong>
            {entry.by && (
              <span className="dim" style={{ fontSize: '0.82rem' }}>
                av {entry.by}
              </span>
            )}
            {entry.changed && entry.changed.length > 0 && (
              <span className="dim" style={{ fontSize: '0.82rem' }}>
                {entry.changed.join(', ')}
              </span>
            )}
            <span className="dim" style={{ fontSize: '0.82rem', marginLeft: 'auto' }}>
              {formatDate(entry.at)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
