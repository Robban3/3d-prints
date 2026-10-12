import { useState } from 'react';
import { adminForgot, adminLogin, adminReset, adminSetup } from '../../lib/api';
import { PageHeader } from '../PageHeader';

interface Props { email: string; setup: boolean; bootstrapKey: string; recoveryByEmail: boolean; onSignedIn: () => void }
export function AdminSignIn({ email: initialEmail, setup, bootstrapKey, recoveryByEmail, onSignedIn }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [key, setKey] = useState(bootstrapKey === 'session' ? '' : bootstrapKey);
  const [resetToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('aterstall') ?? '');
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const newPassword = setup || !!resetToken;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (!forgot && newPassword && password !== repeat) { setError('Lösenorden stämmer inte överens.'); return; }
    setBusy(true);
    try {
      if (forgot) {
        await adminForgot(email);
        setMessage(recoveryByEmail ? 'Om adressen tillhör adminkontot har vi skickat en återställningslänk.' : 'Återställningsbrevet sparas lokalt i server/data/utkorg eftersom e-postutskick inte är konfigurerat.');
      } else {
        if (resetToken) await adminReset(resetToken, password);
        else if (setup) await adminSetup(key, password);
        else await adminLogin(email, password);
        setPassword(''); setRepeat('');
        if (resetToken) window.history.replaceState(null, '', window.location.pathname + window.location.search);
        onSignedIn();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Kunde inte logga in. Försök igen.'); }
    finally { setBusy(false); }
  }
  const title = resetToken ? 'Välj nytt lösenord' : setup ? 'Aktivera ditt adminkonto' : forgot ? 'Återställ lösenord' : 'Välkommen tillbaka';
  return <>
    <PageHeader eyebrow="Verkstaden" title={title} text={setup ? 'Välj ditt lösenord för att börja hantera butiken.' : 'Logga in för att hantera ordrar, produkter och design.'} />
    <section className="section"><div className="container admin-login-container"><form className="panel stack admin-login-form" onSubmit={submit}>
      {!resetToken && <div className="field"><label htmlFor="admin-email">E-postadress</label><input id="admin-email" className="input" type="email" autoComplete="username" required value={email} readOnly={setup} onChange={event => setEmail(event.target.value)} /></div>}
      {setup && (!bootstrapKey || bootstrapKey === 'session') && <div className="field"><label htmlFor="admin-bootstrap">Befintlig adminnyckel</label><input id="admin-bootstrap" className="input" type="password" autoComplete="off" required value={key} onChange={event => setKey(event.target.value)} /><span className="dim">Behövs bara vid första aktiveringen. Finns i server/.env.</span></div>}
      {!forgot && <div className="field"><label htmlFor="admin-password">{newPassword ? 'Välj lösenord' : 'Lösenord'}</label><input id="admin-password" className="input" type="password" autoComplete={newPassword ? 'new-password' : 'current-password'} required minLength={newPassword ? 12 : undefined} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} />{newPassword && <span className="dim">Minst 12 tecken. Använd gärna en lång lösenfras.</span>}</div>}
      {!forgot && newPassword && <div className="field"><label htmlFor="admin-repeat">Bekräfta lösenord</label><input id="admin-repeat" className="input" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={repeat} onChange={event => setRepeat(event.target.value)} /></div>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Vänta…' : forgot ? 'Skicka återställningslänk' : resetToken ? 'Spara nytt lösenord' : setup ? 'Aktivera konto' : 'Logga in'}</button>
      {!setup && !resetToken && <button className="btn-quiet" type="button" onClick={() => { setForgot(!forgot); setError(''); setMessage(''); }}>{forgot ? 'Tillbaka till inloggning' : 'Glömt lösenord?'}</button>}
    </form></div></section>
  </>;
}
