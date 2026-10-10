import { useState } from 'react';
import { TextAreaField, TextField } from './Field';
import { Icon } from './Icon';
import { ApiError, submitReview } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Review, ReviewSummary } from '../types';

/**
 * Omdömen om en produkt, med betygsfördelning och ett formulär.
 *
 * Inget omdöme syns direkt: det granskas först, och formuläret säger det rakt
 * ut så att ingen tror att inlägget försvunnit.
 */

const emptyForm = { author: '', email: '', rating: 0, title: '', body: '' };

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="stars" aria-label={`${full} av 5`}>
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
    </span>
  );
}

interface Props {
  slug: string;
  reviews: Review[];
  summary: ReviewSummary | null;
}

export function ReviewSection({ slug, reviews, summary }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setErrors({});
    setMessage('');
    try {
      await submitReview(slug, form);
      setSent(true);
      setForm(emptyForm);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setMessage(error.message);
      } else {
        setMessage('Omdömet kunde inte skickas. Försök igen.');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="review-section">
      <h2>Omdömen</h2>

      <div className="review-layout">
        <div>
          {summary && summary.count > 0 ? (
            <div className="review-summary">
              <div className="review-score">
                <strong>{summary.average.toFixed(1).replace('.', ',')}</strong>
                <Stars value={summary.average} />
                <span className="dim">
                  {summary.count} {summary.count === 1 ? 'omdöme' : 'omdömen'}
                </span>
              </div>
              <ul className="review-bars">
                {[5, 4, 3, 2, 1].map((grade) => {
                  const count = summary.distribution[grade] ?? 0;
                  const share = summary.count === 0 ? 0 : (count / summary.count) * 100;
                  return (
                    <li key={grade}>
                      <span className="review-bar-grade">{grade} ★</span>
                      <span className="review-bar">
                        <span style={{ width: `${share}%` }} />
                      </span>
                      <span className="review-bar-count">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="muted">
              Ingen har lämnat ett omdöme om den här produkten än. Har du köpt den? Då är ditt
              omdöme det första andra får läsa.
            </p>
          )}

          {reviews.length > 0 && (
            <ul className="review-list">
              {reviews.map((review) => (
                <li key={review.id} className="review">
                  <div className="review-head">
                    <Stars value={review.rating} />
                    <strong>{review.author}</strong>
                    {review.verifiedPurchase && (
                      <span className="review-verified">
                        <Icon name="shield" size={13} /> Verifierat köp
                      </span>
                    )}
                    <span className="dim">{formatDate(review.createdAt)}</span>
                  </div>
                  {review.title && <p className="review-title">{review.title}</p>}
                  <p className="review-body">{review.body}</p>
                  {review.reply && (
                    <p className="review-reply">
                      <strong>Formlabb svarar:</strong> {review.reply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel panel-tight">
          {sent ? (
            <>
              <h3>Tack!</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                Vi läser igenom omdömet och publicerar det inom en arbetsdag. Hör vi något som
                behöver rättas till hör vi av oss först.
              </p>
            </>
          ) : open ? (
            <form onSubmit={send} noValidate className="stack">
              <h3 style={{ margin: 0 }}>Skriv ett omdöme</h3>

              <div className="field">
                <span className="field-label">Betyg</span>
                <div className="rating-input" role="radiogroup" aria-label="Betyg">
                  {[1, 2, 3, 4, 5].map((grade) => (
                    <button
                      key={grade}
                      type="button"
                      role="radio"
                      aria-checked={form.rating === grade}
                      aria-label={`${grade} av 5`}
                      className={form.rating >= grade ? 'star on' : 'star'}
                      onClick={() => setForm((current) => ({ ...current, rating: grade }))}
                    >
                      ★
                    </button>
                  ))}
                </div>
                {errors.rating && <span className="error">{errors.rating}</span>}
              </div>

              <TextField
                label="Vad vill du kallas?"
                name="review-author"
                value={form.author}
                error={errors.author}
                onChange={(event) =>
                  setForm((current) => ({ ...current, author: event.target.value }))
                }
              />
              <TextField
                label="Mejladress"
                name="review-email"
                type="email"
                value={form.email}
                error={errors.email}
                hint="Visas aldrig i butiken. Vi använder den för att se om du handlat produkten."
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
              />
              <TextField
                label="Rubrik (valfritt)"
                name="review-title"
                value={form.title}
                error={errors.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
              <TextAreaField
                label="Ditt omdöme"
                name="review-body"
                placeholder="Hur blev ytan? Passade måtten? Vad använder du den till?"
                value={form.body}
                error={errors.body}
                onChange={(event) =>
                  setForm((current) => ({ ...current, body: event.target.value }))
                }
              />

              {message && <p className="notice notice-error">{message}</p>}

              <button type="submit" className="btn btn-block" disabled={sending}>
                {sending ? 'Skickar…' : 'Skicka omdömet'}
              </button>
              <p className="dim" style={{ fontSize: '0.8rem', margin: 0 }}>
                Omdömet granskas innan det publiceras.
              </p>
            </form>
          ) : (
            <>
              <h3>Har du köpt den?</h3>
              <p className="muted">
                Berätta hur den blev. Vi granskar varje omdöme innan det publiceras, så det syns
                inte på en gång.
              </p>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
                Skriv ett omdöme
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
