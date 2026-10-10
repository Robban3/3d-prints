import { useCallback, useEffect, useState } from 'react';
import { ApiError, deleteDiscount, fetchDiscounts, saveDiscount } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { DiscountCode, DiscountKind } from '../../types';

/**
 * Rabattkoder i panelen. Koden går inte att byta efter att den skapats – den
 * kan redan vara utskickad – men allt annat är redigerbart, och räknaren visar
 * hur många som faktiskt löst in den.
 */

type Draft = {
  code: string;
  description: string;
  kind: DiscountKind;
  value: number;
  minSubtotal: number;
  maxUses: number;
  startsAt: string;
  endsAt: string;
  freeShipping: boolean;
  active: boolean;
};

const blank: Draft = {
  code: '',
  description: '',
  kind: 'procent',
  value: 10,
  minSubtotal: 0,
  maxUses: 0,
  startsAt: '',
  endsAt: '',
  freeShipping: false,
  active: true,
};

/** ISO-datum till det formulärets datumfält vill ha. */
function dayValue(iso?: string): string {
  return iso ? iso.slice(0, 10) : '';
}

function draftFrom(discount: DiscountCode): Draft {
  return {
    code: discount.code,
    description: discount.description,
    kind: discount.kind,
    value: discount.value,
    minSubtotal: discount.minSubtotal,
    maxUses: discount.maxUses,
    startsAt: dayValue(discount.startsAt),
    endsAt: dayValue(discount.endsAt),
    freeShipping: discount.freeShipping,
    active: discount.active,
  };
}

export function DiscountManager({ token }: { token: string }) {
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDiscounts((await fetchDiscounts(token)).discounts);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Koderna kunde inte hämtas.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setDraft(blank);
    setEditing(null);
    setErrors({});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      await saveDiscount(token, draft, editing ?? undefined);
      reset();
      await load();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setMessage(error.message);
      } else {
        setMessage('Koden kunde inte sparas.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(discount: DiscountCode) {
    const warning =
      discount.uses > 0
        ? `${discount.code} är inlöst ${discount.uses} gånger. Ta bort den ändå?`
        : `Ta bort ${discount.code}?`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    try {
      await deleteDiscount(token, discount.code);
      if (editing === discount.code) reset();
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Koden kunde inte tas bort.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      <form className="panel" onSubmit={submit} noValidate>
        <h3 style={{ marginTop: 0 }}>{editing ? `Ändra ${editing}` : 'Ny rabattkod'}</h3>

        <div className="grid-3">
          <div className="field">
            <label htmlFor="rabattkod">Kod</label>
            <input
              id="rabattkod"
              className="input"
              autoComplete="off"
              spellCheck={false}
              placeholder="HOST20"
              // Koden kan redan vara utskickad, så den låses när den finns.
              disabled={editing !== null}
              value={draft.code}
              onChange={(event) =>
                setDraft({ ...draft, code: event.target.value.toUpperCase().replace(/\s+/g, '') })
              }
            />
            {errors.code && <span className="error">{errors.code}</span>}
          </div>

          <div className="field">
            <label htmlFor="rabatttyp">Typ</label>
            <select
              id="rabatttyp"
              className="input"
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value as DiscountKind })}
            >
              <option value="procent">Procent av ordern</option>
              <option value="kronor">Fast belopp i kronor</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="rabattvarde">{draft.kind === 'procent' ? 'Procent' : 'Kronor'}</label>
            <input
              id="rabattvarde"
              className="input"
              type="number"
              min={1}
              max={draft.kind === 'procent' ? 90 : 100000}
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: Number(event.target.value) })}
            />
            {errors.value && <span className="error">{errors.value}</span>}
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="rabattbeskrivning">Beskrivning</label>
          <input
            id="rabattbeskrivning"
            className="input"
            placeholder="Höstkampanj 2026"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
          <span className="field-hint">Syns bara här, inte för kunden.</span>
          {errors.description && <span className="error">{errors.description}</span>}
        </div>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="rabattminsta">Lägsta ordervärde</label>
            <input
              id="rabattminsta"
              className="input"
              type="number"
              min={0}
              value={draft.minSubtotal}
              onChange={(event) => setDraft({ ...draft, minSubtotal: Number(event.target.value) })}
            />
            <span className="field-hint">0 = ingen gräns.</span>
            {errors.minSubtotal && <span className="error">{errors.minSubtotal}</span>}
          </div>

          <div className="field">
            <label htmlFor="rabattmax">Max antal inlösen</label>
            <input
              id="rabattmax"
              className="input"
              type="number"
              min={0}
              value={draft.maxUses}
              onChange={(event) => setDraft({ ...draft, maxUses: Number(event.target.value) })}
            />
            <span className="field-hint">0 = obegränsat.</span>
            {errors.maxUses && <span className="error">{errors.maxUses}</span>}
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="rabattstart">Gäller från (valfritt)</label>
            <input
              id="rabattstart"
              className="input"
              type="date"
              value={draft.startsAt}
              onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
            />
            {errors.startsAt && <span className="error">{errors.startsAt}</span>}
          </div>
          <div className="field">
            <label htmlFor="rabattslut">Gäller till (valfritt)</label>
            <input
              id="rabattslut"
              className="input"
              type="date"
              value={draft.endsAt}
              onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
            />
            {errors.endsAt && <span className="error">{errors.endsAt}</span>}
          </div>
        </div>

        <div className="stack" style={{ gap: 10, marginTop: 16 }}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.freeShipping}
              onChange={(event) => setDraft({ ...draft, freeShipping: event.target.checked })}
            />
            <span>
              <strong>Ger även fri frakt</strong>
              <span>Frakten blir gratis oavsett ordervärde och fraktsätt.</span>
            </span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
            />
            <span>
              <strong>Aktiv</strong>
              <span>Stäng av koden utan att ta bort den eller tappa räknaren.</span>
            </span>
          </label>
        </div>

        {message && (
          <p className="notice notice-error" style={{ marginTop: 14 }}>
            {message}
          </p>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Sparar…' : editing ? 'Spara ändringen' : 'Skapa koden'}
          </button>
          {editing && (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Avbryt
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : discounts.length === 0 ? (
        <p className="muted">Inga rabattkoder än.</p>
      ) : (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Koder</h3>
          <table className="spec-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Rabatt</th>
                <th>Villkor</th>
                <th>Inlöst</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {discounts.map((discount) => (
                <tr key={discount.code}>
                  <th>
                    {discount.code}
                    {!discount.active && <span className="pill pill-off"> Avstängd</span>}
                    <br />
                    <span className="dim" style={{ fontSize: '0.8rem' }}>
                      {discount.description}
                    </span>
                  </th>
                  <td>
                    {discount.kind === 'procent'
                      ? `${discount.value.toString().replace('.', ',')} %`
                      : `${discount.value} kr`}
                    {discount.freeShipping && (
                      <>
                        <br />
                        <span className="dim" style={{ fontSize: '0.8rem' }}>
                          + fri frakt
                        </span>
                      </>
                    )}
                  </td>
                  <td style={{ fontSize: '0.84rem' }}>
                    {discount.minSubtotal > 0 ? `Från ${discount.minSubtotal} kr` : 'Inget minimum'}
                    {discount.startsAt && (
                      <>
                        <br />
                        Från {formatDate(discount.startsAt)}
                      </>
                    )}
                    {discount.endsAt && (
                      <>
                        <br />
                        Till {formatDate(discount.endsAt)}
                      </>
                    )}
                  </td>
                  <td>
                    {discount.uses}
                    {discount.maxUses > 0 ? ` / ${discount.maxUses}` : ''}
                  </td>
                  <td>
                    <div className="row">
                      <button
                        type="button"
                        className="btn-quiet"
                        onClick={() => {
                          setDraft(draftFrom(discount));
                          setEditing(discount.code);
                          setErrors({});
                        }}
                      >
                        Ändra
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={busy}
                        onClick={() => void remove(discount)}
                      >
                        Ta bort
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
