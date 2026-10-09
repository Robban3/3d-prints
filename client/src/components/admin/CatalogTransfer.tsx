import { useRef, useState } from 'react';
import { ApiError, exportCatalog, importCatalog } from '../../lib/api';
import type { ImportResult } from '../../types';

interface Props {
  token: string;
  onImported: () => void;
}

/**
 * Massredigering sker genom att exportera katalogen, ändra i filen och läsa in
 * den igen. Importen visar alltid en plan först, och skriver ingenting om
 * någon rad är felaktig.
 */
export function CatalogTransfer({ token, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportResult | null>(null);
  const [catalog, setCatalog] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const data = await exportCatalog(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `katalog-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('Katalogen är exporterad.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Exporten misslyckades.');
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setPlan(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setCatalog(parsed);
      setFileName(file.name);
      setBusy(true);
      setPlan(await importCatalog(token, parsed, false));
    } catch (caught) {
      setCatalog(null);
      setError(
        caught instanceof ApiError ? caught.message : 'Filen kunde inte läsas som JSON.',
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function apply() {
    if (!catalog) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importCatalog(token, catalog, true);
      setPlan(result);
      setMessage(
        `Importen är klar: ${result.created ?? 0} skapade, ${result.updated ?? 0} uppdaterade.`,
      );
      setCatalog(null);
      onImported();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Importen misslyckades.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Export och import</h2>
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        Exportera katalogen, ändra många produkter på en gång i filen, och läs in den igen.
        Produkter matchas på webbadressen, så befintliga uppdateras i stället för att dubbleras.
      </p>

      {message && <p className="notice notice-success">{message}</p>}
      {error && <p className="notice notice-error">{error}</p>}

      <div className="panel">
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => void download()}>
            Exportera katalogen
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            Välj fil att importera
          </button>
          {fileName && <span className="dim">{fileName}</span>}
        </div>
      </div>

      {plan && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="spread">
            <h3 style={{ margin: 0 }}>
              {plan.applied ? 'Importen är genomförd' : 'Så här skulle importen gå'}
            </h3>
            <div className="row">
              <span className="badge badge-accent">{plan.ok} godkända</span>
              {plan.failed > 0 && <span className="badge badge-warn">{plan.failed} fel</span>}
            </div>
          </div>

          <div className="stack" style={{ gap: 6, marginTop: 16 }}>
            {plan.rows.map((row) => (
              <div className="import-row" key={row.index}>
                <span
                  className={
                    row.status === 'fel' ? 'badge badge-warn' : 'badge'
                  }
                >
                  {row.status}
                </span>
                <strong>{row.name}</strong>
                {row.errors && (
                  <span className="error" style={{ gridColumn: '1 / -1' }}>
                    {Object.entries(row.errors)
                      .map(([field, text]) => (field ? `${field}: ${text}` : text))
                      .join(' · ')}
                  </span>
                )}
              </div>
            ))}
          </div>

          {!plan.applied && (
            <div className="row" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="btn"
                disabled={busy || plan.failed > 0 || plan.ok === 0}
                title={plan.failed > 0 ? 'Rätta felen i filen först' : undefined}
                onClick={() => void apply()}
              >
                {busy ? 'Importerar…' : `Importera ${plan.ok} produkter`}
              </button>
              {plan.failed > 0 && (
                <span className="dim" style={{ fontSize: '0.84rem' }}>
                  Inget skrivs så länge någon rad är felaktig.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
