import { useCallback, useEffect, useState } from 'react';
import { ApiError, deleteReview, fetchAdminReviews, moderateReview } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Icon } from '../Icon';
import type { AdminReview, ReviewStatus } from '../../types';

/**
 * Modereringskön. Inget omdöme har publicerats förrän någon tryckt på det här,
 * så vyn visar hela texten och vem som skrivit den – inte bara en rubrik.
 */

const filters: Array<{ id: ReviewStatus | 'alla'; label: string }> = [
  { id: 'väntar', label: 'Väntar' },
  { id: 'publicerad', label: 'Publicerade' },
  { id: 'avslagen', label: 'Avslagna' },
  { id: 'alla', label: 'Alla' },
];

const statusLabels: Record<ReviewStatus, string> = {
  väntar: 'Väntar på granskning',
  publicerad: 'Publicerad',
  avslagen: 'Avslagen',
};

export function ReviewManager({ token, onChanged }: { token: string; onChanged?: () => void }) {
  const [filter, setFilter] = useState<ReviewStatus | 'alla'>('väntar');
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAdminReviews(token, filter === 'alla' ? undefined : filter);
      setReviews(result.reviews);
      setWaiting(result.waiting);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Omdömena kunde inte hämtas.');
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function moderate(review: AdminReview, status: ReviewStatus) {
    setBusy(review.id);
    setError('');
    try {
      // Svaret skickas bara med när det ändrats, så ett sparat svar inte nollas.
      const reply = replies[review.id];
      await moderateReview(token, review.id, status, reply);
      await load();
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Ändringen gick inte igenom.');
    } finally {
      setBusy('');
    }
  }

  async function remove(review: AdminReview) {
    if (!window.confirm(`Ta bort omdömet från ${review.author}? Det går inte att ångra.`)) return;
    setBusy(review.id);
    try {
      await deleteReview(token, review.id);
      await load();
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Omdömet kunde inte tas bort.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="spread" style={{ alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>
          Omdömen {waiting > 0 && <span className="pill pill-warn">{waiting} väntar</span>}
        </h3>
        <div className="chip-row" style={{ margin: 0 }}>
          {filters.map((entry) => (
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
      </div>

      {error && <p className="notice notice-error">{error}</p>}
      {loading && <div className="skeleton" style={{ height: 180 }} />}

      {!loading && reviews.length === 0 && (
        <p className="muted">
          {filter === 'väntar' ? 'Inget väntar på granskning just nu.' : 'Inga omdömen här.'}
        </p>
      )}

      {!loading &&
        reviews.map((review) => (
          <article key={review.id} className="panel admin-review">
            <div className="admin-review-head">
              <span className="stars" aria-label={`${review.rating} av 5`}>
                {'★'.repeat(review.rating)}
                {'☆'.repeat(5 - review.rating)}
              </span>
              <strong>{review.author}</strong>
              {review.verifiedPurchase && (
                <span className="review-verified">
                  <Icon name="shield" size={13} /> Verifierat köp
                </span>
              )}
              <span
                className={`pill pill-${review.status === 'publicerad' ? 'ok' : review.status === 'avslagen' ? 'off' : 'warn'}`}
              >
                {statusLabels[review.status]}
              </span>
            </div>

            <p className="dim" style={{ fontSize: '0.84rem', margin: '0 0 10px' }}>
              {review.productName} · {formatDate(review.createdAt)} · {review.email}
            </p>

            {review.title && <p className="review-title">{review.title}</p>}
            <p className="review-body">{review.body}</p>

            <div className="field">
              <label htmlFor={`reply-${review.id}`}>Svar som visas under omdömet (valfritt)</label>
              <textarea
                id={`reply-${review.id}`}
                rows={2}
                maxLength={1000}
                value={replies[review.id] ?? review.reply ?? ''}
                onChange={(event) =>
                  setReplies((current) => ({ ...current, [review.id]: event.target.value }))
                }
              />
            </div>

            <div className="row">
              {review.status !== 'publicerad' && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy === review.id}
                  onClick={() => void moderate(review, 'publicerad')}
                >
                  Publicera
                </button>
              )}
              {review.status === 'publicerad' && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy === review.id}
                  onClick={() => void moderate(review, 'publicerad')}
                >
                  Spara svaret
                </button>
              )}
              {review.status !== 'avslagen' && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy === review.id}
                  onClick={() => void moderate(review, 'avslagen')}
                >
                  Avslå
                </button>
              )}
              {review.status === 'publicerad' && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy === review.id}
                  onClick={() => void moderate(review, 'väntar')}
                >
                  Avpublicera
                </button>
              )}
              <button
                type="button"
                className="btn-quiet"
                disabled={busy === review.id}
                onClick={() => void remove(review)}
              >
                Ta bort
              </button>
            </div>
          </article>
        ))}
    </div>
  );
}
