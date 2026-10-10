import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  fetchMailTemplates,
  previewMailTemplate,
  resetMailTemplate,
  saveMailTemplate,
} from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { MailTemplate } from '../../types';

/**
 * Breven till kunden, redigerbara här.
 *
 * Texterna i koden är utgångsläget, inte sanningen. Det som är uträknat –
 * orderrader, summa, adress – är platshållare, för dem kan ingen skriva för
 * hand. Skriver man en platshållare som inte finns säger servern ifrån, för
 * alternativet är att kunden får en tom lucka i sitt brev.
 */
export function MailTemplateManager({ token }: { token: string }) {
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string }>({ subject: '', body: '' });
  const [preview, setPreview] = useState<{ subject: string; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates((await fetchMailTemplates(token)).templates);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Mallarna kunde inte hämtas.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function open(template: MailTemplate) {
    if (openId === template.id) {
      setOpenId(null);
      return;
    }
    setOpenId(template.id);
    setDraft({ subject: template.subject, body: template.body });
    setPreview(null);
    setErrors({});
    setNotice('');
  }

  async function save(template: MailTemplate) {
    setBusy(true);
    setErrors({});
    setMessage('');
    setNotice('');
    try {
      await saveMailTemplate(token, template.id, draft);
      setNotice(`${template.name} sparad. Nästa brev går ut med den nya texten.`);
      await load();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setMessage(error.message);
      } else {
        setMessage('Mallen kunde inte sparas.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function restore(template: MailTemplate) {
    if (!window.confirm(`Lägg tillbaka originaltexten för ${template.name}?`)) return;
    setBusy(true);
    try {
      const result = await resetMailTemplate(token, template.id);
      setDraft({ subject: result.template.subject, body: result.template.body });
      setNotice(`${template.name} är tillbaka i utgångsläget.`);
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Mallen kunde inte återställas.');
    } finally {
      setBusy(false);
    }
  }

  async function showPreview(template: MailTemplate) {
    try {
      // Förhandsvisningen visar den sparade texten, inte utkastet i rutan.
      setPreview((await previewMailTemplate(token, template.id)).preview);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Förhandsvisningen gick inte.');
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h2 style={{ margin: 0 }}>Mejlmallar</h2>
      <p className="muted" style={{ fontSize: '0.9rem', margin: 0 }}>
        Texterna som går ut till kunden. Platshållarna i klamrar fylls i när brevet skickas – de går
        att flytta och utelämna, men inte hitta på. Spara tomt är inte möjligt; vill du tillbaka
        till originalet finns knappen för det.
      </p>

      {message && <p className="notice notice-error">{message}</p>}
      {notice && <p className="notice notice-success">{notice}</p>}
      {loading && <div className="skeleton" style={{ height: 200 }} />}

      {templates.map((template) => (
        <div key={template.id}>
          <div className="admin-row">
            <div className="queue-printer">
              <span className="stat-label">Brev</span>
            </div>
            <div className="admin-row-main">
              <strong>{template.name}</strong>
              <span className="dim">{template.description}</span>
              <span className="dim">Ämne: {template.subject}</span>
            </div>
            <div className="admin-row-meta">
              {template.custom ? (
                <span className="badge badge-accent">
                  Ändrad{template.savedAt ? ` ${formatDate(template.savedAt)}` : ''}
                </span>
              ) : (
                <span className="badge">Utgångsläge</span>
              )}
            </div>
            <div className="admin-row-actions">
              <button type="button" className="btn-quiet" onClick={() => open(template)}>
                {openId === template.id ? 'Stäng' : 'Ändra'}
              </button>
            </div>
          </div>

          {openId === template.id && (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor={`mall-amne-${template.id}`}>Ämnesrad</label>
                <input
                  id={`mall-amne-${template.id}`}
                  className="input"
                  value={draft.subject}
                  onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                />
                {errors.subject && <span className="error">{errors.subject}</span>}
              </div>

              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor={`mall-text-${template.id}`}>Brevtext</label>
                <textarea
                  id={`mall-text-${template.id}`}
                  rows={16}
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
                <span className="field-hint">
                  Platshållare: {template.variables.map((name) => `{{${name}}}`).join(', ')}
                </span>
                {errors.body && <span className="error">{errors.body}</span>}
              </div>

              <div className="row" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void save(template)}
                >
                  {busy ? 'Sparar…' : 'Spara'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void showPreview(template)}
                >
                  Förhandsvisa
                </button>
                {template.custom && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => void restore(template)}
                  >
                    Tillbaka till originalet
                  </button>
                )}
              </div>

              {preview && (
                <div className="panel panel-tight" style={{ marginTop: 16 }}>
                  <span className="field-label">Så här ser brevet ut</span>
                  <p style={{ margin: '8px 0' }}>
                    <strong>{preview.subject}</strong>
                  </p>
                  <pre className="mail-preview">{preview.text}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
