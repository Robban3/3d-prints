import { useCallback, useEffect, useState } from 'react';
import { ApiError, deleteSpool, fetchQueue, saveSpool } from '../../lib/api';
import { formatDate, formatHours, formatNumber } from '../../lib/format';
import type { FilamentShortage, ProductionQueue as Queue, QueueJob, Spool } from '../../types';

/**
 * Verkstadens kö: vad som ska printas, på vilken skrivare, och när det blir
 * klart. Kön räknas fram ur ordrarna på servern, så den går inte att rucka på
 * här – det som styr ordningen är orderns status och om jobbet är express.
 *
 * Filamentrullarna ligger bredvid kön av en anledning: det är först när man ser
 * åtgången mot vad som finns på hyllan som siffrorna betyder något.
 */

interface Draft {
  material: string;
  color: string;
  grams: number;
  totalGrams: number;
  note: string;
}

const blank: Draft = { material: 'pla', color: '', grams: 1000, totalGrams: 1000, note: '' };

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

function materialText(job: QueueJob): string {
  return job.materials
    .map((entry) => `${entry.material.toUpperCase()} ${entry.color} ${formatNumber(entry.grams)} g`)
    .join(' · ');
}

function JobRow({ job, missing }: { job: QueueJob; missing: boolean }) {
  return (
    <div className="admin-row">
      <div className="queue-printer" title={`Skrivare ${job.printer}`}>
        <span className="stat-label">Skrivare</span>
        <strong>{job.printer}</strong>
      </div>

      <div className="admin-row-main">
        <strong>
          {job.orderId} · {job.customer}
        </strong>
        <span className="dim">{job.label}</span>
        {job.materials.length > 0 && <span className="dim">{materialText(job)}</span>}
      </div>

      <div className="admin-row-meta">
        {job.running ? (
          <span className="badge badge-accent">Printar</span>
        ) : (
          <span className="badge">Väntar {formatHours(job.waitingHours)}</span>
        )}
        {job.rush && <span className="badge badge-warn">Express</span>}
        {missing && <span className="badge badge-warn">Filament saknas</span>}
      </div>

      <div className="admin-row-actions">
        <div className="center">
          <span className="stat-label">Klart</span>
          <strong style={{ display: 'block', fontSize: '0.9rem' }}>
            {formatDate(job.readyAt)}
          </strong>
          <span className="dim" style={{ fontSize: '0.8rem' }}>
            {formatHours(job.remainingHours)} kvar
            {job.remainingHours !== job.hours ? ` av ${formatHours(job.hours)}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

function SpoolRow({
  spool,
  low,
  onEdit,
  onRemove,
}: {
  spool: Spool;
  low: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const percent =
    spool.totalGrams > 0 ? Math.round(Math.min(1, spool.grams / spool.totalGrams) * 100) : 0;

  return (
    <div className="admin-row">
      <div className="queue-printer">
        <span className="stat-label">{spool.material.toUpperCase()}</span>
      </div>

      <div className="admin-row-main">
        <strong>{spool.color}</strong>
        <span className="dim">
          {formatNumber(spool.grams)} g kvar av {formatNumber(spool.totalGrams)} g
          {spool.note ? ` · ${spool.note}` : ''}
        </span>
        <span
          className="progress"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${spool.color}, ${percent} % kvar`}
        >
          <span style={{ width: `${percent}%` }} />
        </span>
      </div>

      <div className="admin-row-meta">
        {low && <span className="badge badge-warn">Snart slut</span>}
        <span className="dim" style={{ fontSize: '0.8rem' }}>
          {formatDate(spool.addedAt)}
        </span>
      </div>

      <div className="admin-row-actions">
        <button type="button" className="btn-quiet" onClick={onEdit}>
          Ändra
        </button>
        <button type="button" className="btn-quiet" onClick={onRemove}>
          Ta bort
        </button>
      </div>
    </div>
  );
}

export function ProductionQueue({ token, materials }: { token: string; materials: string[] }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [spools, setSpools] = useState<Spool[]>([]);
  const [short, setShort] = useState<FilamentShortage[]>([]);
  const [lowGrams, setLowGrams] = useState(250);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchQueue(token);
      setQueue(data.queue);
      setSpools(data.spools);
      setShort(data.shortages);
      setLowGrams(data.lowFilamentGrams);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Kön kunde inte hämtas.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = useCallback(() => {
    setDraft({ ...blank, material: materials[0] ?? 'pla' });
    setEditing(null);
  }, [materials]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await saveSpool(token, draft, editing ?? undefined);
      reset();
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Rullen kunde inte sparas.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(spool: Spool) {
    if (!window.confirm(`Ta bort rullen ${spool.material.toUpperCase()} ${spool.color}?`)) return;
    setBusy(true);
    try {
      await deleteSpool(token, spool.id);
      if (editing === spool.id) reset();
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Rullen kunde inte tas bort.');
    } finally {
      setBusy(false);
    }
  }

  // Materialen som fattas, så jobben som behöver dem kan flaggas i kön.
  const missing = new Set(short.map((entry) => entry.material));

  return (
    <div className="stack" style={{ gap: 22 }}>
      {message && <p className="notice notice-error">{message}</p>}

      <div className="stack" style={{ gap: 14 }}>
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>Produktionskö</h3>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            Uppdatera
          </button>
        </div>

        {loading && <div className="skeleton" style={{ height: 180 }} />}

        {!loading && queue && (
          <div className="stat-row">
            <Tile label="I kön" value={`${queue.jobs.length} jobb`} />
            <Tile
              label="Printar nu"
              value={`${queue.running} av ${queue.printers}`}
              note={`${queue.waiting} väntar på sin tur`}
            />
            <Tile label="Maskintid kvar" value={formatHours(queue.hours)} />
            <Tile label="Allt klart" value={queue.readyAt ? formatDate(queue.readyAt) : '–'} />
          </div>
        )}

        {!loading && queue?.jobs.length === 0 && (
          <p className="muted">
            Inget står i kö just nu. Allt som kommit in är skickat eller levererat.
          </p>
        )}

        {queue?.jobs.map((job) => (
          <JobRow
            key={job.orderId}
            job={job}
            missing={job.materials.some((entry) => missing.has(entry.material))}
          />
        ))}
      </div>

      {short.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Filamentet räcker inte till kön</h3>
          <ul className="plain-list">
            {short.map((entry) => (
              <li key={entry.material}>
                <strong>{entry.material.toUpperCase()}</strong> ({entry.color}): kön kräver{' '}
                {formatNumber(entry.needed)} g, på hyllan finns {formatNumber(entry.available)} g.
                Köp in minst {formatNumber(entry.needed - entry.available)} g till.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="stack" style={{ gap: 14 }}>
        <h3 style={{ margin: 0 }}>Filamentlager</h3>
        <p className="field-hint" style={{ margin: 0 }}>
          En rad per rulle. Åtgången bokförs när en order går i produktion, och väger du om en rulle
          skriver du in det nya värdet här.
        </p>

        {spools.length === 0 && !loading && <p className="muted">Inga rullar registrerade ännu.</p>}

        {spools.map((spool) => (
          <SpoolRow
            key={spool.id}
            spool={spool}
            low={spool.grams <= lowGrams}
            onEdit={() => {
              setEditing(spool.id);
              setDraft({
                material: spool.material,
                color: spool.color,
                grams: spool.grams,
                totalGrams: spool.totalGrams,
                note: spool.note ?? '',
              });
            }}
            onRemove={() => void remove(spool)}
          />
        ))}

        <form className="panel" onSubmit={submit} noValidate>
          <h4 style={{ margin: '0 0 12px' }}>{editing ? 'Ändra rullen' : 'Ny rulle'}</h4>
          <div className="parameter-grid">
            <div className="field">
              <label htmlFor="rulle-material">Material</label>
              <select
                id="rulle-material"
                className="input"
                value={draft.material}
                onChange={(event) => setDraft({ ...draft, material: event.target.value })}
              >
                {materials.map((id) => (
                  <option key={id} value={id}>
                    {id.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rulle-farg">Färg</label>
              <input
                id="rulle-farg"
                className="input"
                placeholder="Matt svart"
                value={draft.color}
                onChange={(event) => setDraft({ ...draft, color: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="rulle-kvar">Gram kvar</label>
              <input
                id="rulle-kvar"
                className="input"
                type="number"
                min={0}
                value={draft.grams}
                onChange={(event) => setDraft({ ...draft, grams: Number(event.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="rulle-ny">Gram ny</label>
              <input
                id="rulle-ny"
                className="input"
                type="number"
                min={1}
                value={draft.totalGrams}
                onChange={(event) => setDraft({ ...draft, totalGrams: Number(event.target.value) })}
              />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="rulle-not">Anteckning</label>
            <input
              id="rulle-not"
              className="input"
              placeholder="Leverantör, batch eller vilken skrivare rullen sitter i"
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Sparar…' : editing ? 'Spara rullen' : 'Lägg till rulle'}
            </button>
            {editing && (
              <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>
                Avbryt
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
