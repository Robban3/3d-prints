import { useState } from 'react';
import { exportPersonalData, minimizePersonalData } from '../../lib/api';

export function PrivacyManager({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function minimize() {
    if (!verified || !window.confirm(`Radera kundfiler, telefon, anteckningar och projektbeskrivningar för avslutade ordrar kopplade till ${email}? Åtgärden går inte att ångra. Namn, e-post, adress och ekonomiska orderuppgifter behålls för separat bedömning av bokföring och rättsliga anspråk. Du måste ha prövat kundens begäran innan du fortsätter.`)) return;
    setBusy(true); setMessage('');
    try {
      const result = await minimizePersonalData(token, email);
      setMessage(`${result.minimized} avslutade ordrar har fått kundfiler och extra uppgifter raderade. ${result.active} aktiva ordrar lämnades kvar. Detta är inte fullständig radering: pröva kvarvarande kontakt-, bokförings- och ärendeuppgifter samt data hos andra leverantörer separat.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kunde inte hantera begäran.'); }
    finally { setBusy(false); }
  }
  async function download(event: React.FormEvent) {
    event.preventDefault(); if (!verified) return;
    setBusy(true); setMessage('');
    try {
      const data = await exportPersonalData(token, email);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'registerutdrag.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Registerutdraget är nedladdat. Kontrollera innehållet och överför det säkert till den verifierade kunden. Det innehåller uppgifter från webbshoppen; e-post, betalningsleverantör och transportör behöver kontrolleras separat.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kunde inte skapa registerutdraget.'); }
    finally { setBusy(false); }
  }
  return <div className="stack" style={{ gap: 20 }}>
    <section className="panel"><h2>GDPR och kunduppgifter</h2><p>Kundfiler gallras 90 dagar efter leverans eller avbruten order. Oanvända kunduppladdningar gallras efter 24 timmar. Egna biblioteksfiler omfattas inte av kundfilsgallringen.</p><p>Kontrollera identiteten innan du lämnar ut uppgifter eller hanterar rättelse och radering. Bokföringsunderlag får inte raderas enbart för att kunden begär det. Övriga uppgifter ska inte sparas längre än de behövs.</p></section>
    <form className="panel stack" onSubmit={download}><h3>Registerutdrag från webbshoppen</h3>
      <label className="field">Kundens e-postadress<input className="input" type="email" required value={email} onChange={event => { setEmail(event.target.value); setVerified(false); }} /></label>
      <label className="checkbox"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} /><span>Jag har verifierat kundens identitet och rätt till uppgifterna.</span></label>
      <button className="btn" disabled={busy || !verified || !email}>{busy ? 'Skapar…' : 'Ladda ner registerutdrag'}</button>
      <button type="button" className="btn btn-ghost" disabled={busy || !verified || !email} onClick={minimize}>Hantera raderingsbegäran för avslutade ordrar</button>
      {message && <p role="status">{message}</p>}
    </form>
  </div>;
}
