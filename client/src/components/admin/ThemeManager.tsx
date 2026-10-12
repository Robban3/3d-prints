import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, fetchAdminAppearance, saveAppearance } from '../../lib/api';
import { useAppearance } from '../../lib/appearance';
import { themeFor, themes } from '../../lib/themes';
import type { ThemeId } from '../../types';

export function ThemeManager({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const { active, preview, setPreview, publish } = useAppearance();
  const [selected, setSelected] = useState<ThemeId>(active);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchAdminAppearance(token).then(({ appearance }) => {
      if (cancelled) return;
      publish(appearance.theme, true);
      setSelected(preview ?? appearance.theme);
      setLoading(false);
    }).catch((caught: unknown) => {
      if (cancelled) return;
      setError(caught instanceof Error ? caught.message : 'Kunde inte hämta butikens tema.');
      setLoading(false);
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized();
    });
    return () => { cancelled = true; };
    // Inläsningen följer adminnyckeln, inte lokala förhandsvisningar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function activate() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { appearance } = await saveAppearance(token, selected);
      publish(appearance.theme);
      setMessage(`${themeFor(appearance.theme).name} är nu aktivt för alla besökare.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kunde inte aktivera temat. Försök igen.');
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="theme-manager">
      <div className="spread section-head">
        <div><span className="eyebrow">Butikens uttryck</span><h2>Fyra teman. Ett Formlabb.</h2><p className="muted">Välj ett tema och förhandsvisa det innan du aktiverar det för alla besökare.</p></div>
        <span className="theme-active-label">Aktivt: {themeFor(active).name}</span>
      </div>
      {loading && <p role="status">Hämtar aktuellt tema…</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      <fieldset className="theme-options" disabled={loading || saving}>
        <legend className="sr-only">Välj butikens tema</legend>
        {themes.map((design) => (
          <label className={`theme-option${selected === design.id ? ' is-selected' : ''}`} key={design.id}>
            <input type="radio" name="shop-theme" value={design.id} checked={selected === design.id} onChange={() => { setSelected(design.id); setMessage(''); }} />
            <img src={`/images/themes/${design.id}.webp`} alt="" width="1536" height="1024" loading="lazy" />
            <div className="theme-option-body"><div className="spread"><strong>{design.name}</strong>{active === design.id && <span className="theme-active-label">Aktivt</span>}</div><p>{design.description}</p><span className="theme-swatches" aria-hidden="true">{design.colors.map((color) => <i key={color} style={{ background: color }} />)}</span></div>
          </label>
        ))}
      </fieldset>
      <div className="theme-controls panel">
        <div><strong>{themeFor(selected).name}</strong><p className="muted">Temat ändrar färger, typografi, startsida och kampanjbild. Sortiment och beställningar behålls.</p></div>
        <div className="row">
          <button className="btn btn-ghost" disabled={loading || saving} onClick={() => setPreview(selected)}>Förhandsvisa</button>
          {preview && <Link className="link-arrow" to="/">Se startsidan →</Link>}
          <button className="btn" disabled={loading || saving || selected === active} onClick={() => void activate()}>{saving ? 'Aktiverar…' : 'Aktivera tema'}</button>
        </div>
      </div>
    </div>
  );
}
