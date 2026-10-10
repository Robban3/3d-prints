import { useState } from 'react';
import { TextField } from './Field';
import { ApiError, watchStock } from '../lib/api';

/**
 * Fångar upp den som ville handla en slutsåld produkt. Ett enda mejl utgår, när
 * saldot fyllts på – det står i rutan, så ingen behöver undra om det blir fler.
 */
export function StockWatchForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setErrors({});
    setMessage('');
    try {
      await watchStock(slug, email);
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setMessage(error.message);
      } else {
        setMessage('Bevakningen kunde inte sparas. Försök igen.');
      }
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="notice notice-success">
        <strong>Vi hör av oss.</strong> Du får ett mejl så fort den står i hyllan igen – och inget
        annat.
      </div>
    );
  }

  return (
    <form className="stock-watch" onSubmit={send} noValidate>
      <h3>Slutsåld just nu</h3>
      <p className="muted">
        Lämna din mejladress så skickar vi ett besked när den finns igen. Ett mejl, inget
        nyhetsbrev.
      </p>
      <TextField
        label="Mejladress"
        name="watch-email"
        type="email"
        placeholder="du@exempel.se"
        value={email}
        error={errors.email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {message && !errors.email && <p className="notice notice-error">{message}</p>}
      <button type="submit" className="btn btn-block" disabled={sending}>
        {sending ? 'Sparar…' : 'Meddela mig'}
      </button>
    </form>
  );
}
