import { useEffect, useState } from 'react';
import { ApiError, downloadPrintFile, saveProduction, checkProduction } from '../../lib/api';
import type { AdminPrintFile } from '../../lib/api';
import type { AnyOrder, OrderStatus, ProductionPlan } from '../../types';

function initial(order: AnyOrder): Omit<ProductionPlan, 'revision'> {
  return order.production ?? { machine: '', plannedDate: '', dueDate: '', estimatedHours: order.type === 'custom' ? order.quote.estimatedPrintHours : null, notes: '', modelIds: [] };
}

export function ProductionCard({ order, token, files, onSaved }: { order: AnyOrder; token: string; files: AdminPrintFile[]; onSaved: (order: AnyOrder, next: OrderStatus[]) => void }) {
  const [draft, setDraft] = useState(() => initial(order));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof checkProduction>> | null>(null);
  useEffect(() => { setChecks(null); }, [order.production]);
  async function verify() {
    setBusy(true); setMessage('');
    try { setChecks(await checkProduction(token, order.id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Kontrollen misslyckades.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { setDraft(initial(order)); }, [order.production]);
  function patch(value: Partial<typeof draft>) { setDraft(current => ({ ...current, ...value })); setMessage(''); }
  async function download(file: AdminPrintFile) {
    try { await downloadPrintFile(token, file); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Kunde inte hämta filen.'); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const result = await saveProduction(token, order.id, draft, order.production?.revision ?? 0);
      onSaved(result.order, result.next); setMessage('Produktionskortet är sparat.');
    } catch (error) { setMessage(error instanceof ApiError && Object.keys(error.fields).length ? Object.values(error.fields).join(' ') : error instanceof Error ? error.message : 'Kunde inte spara.'); }
    finally { setBusy(false); }
  }
  return <details className="production-card" data-testid={`production-${order.id}`}><summary>Produktionskort · filer och planering</summary>
    <div className="stack" style={{ gap: 16, marginTop: 18 }}>
      <div className="notice"><strong>Artikelunderlag</strong>{order.type === 'custom' ? <p>{order.articleNumber ?? 'Artikelnummer saknas på den äldre ordern.'}</p> : <ul>{order.lines.map((line, index) => <li key={index}><strong>{line.articleNumber ?? 'Artikelnummer saknas'}</strong> · {line.quantity} × {line.name} · {line.color}{line.size ? ` · ${line.size}` : ''}{line.productionSpecs && <><br />{line.productionSpecs.material} · {line.productionSpecs.dimensions.width} × {line.productionSpecs.dimensions.depth} × {line.productionSpecs.dimensions.height} mm · {line.productionSpecs.weightGrams} g · {line.productionSpecs.printTimeHours} h per vald artikel{line.productionSpecs.estimated ? ' (preliminärt)' : ''}</>}{line.personalization && <><br />Personlig text: {line.personalization}</>}</li>)}</ul>}</div>
      {order.type === 'custom' && <div className="notice"><strong>{order.projectName}</strong><p>{order.description}</p><p>{order.request.material.toUpperCase()} · {order.request.quality} · {order.request.quantity} st · {order.request.infill} % fyllning</p>
        {order.fileId && order.fileName ? <button type="button" className="btn btn-ghost" onClick={() => void download({ id: order.fileId!, fileName: order.fileName!, size: order.fileSize ?? 0, createdAt: order.createdAt, source: 'customer', orderId: order.id })}>Hämta {order.fileName}</button> : <p className="dim">Ingen kundfil finns kopplad till ordern.</p>}
      </div>}
      <div><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void verify()}>Kontrollera produktionsunderlag</button><p className="dim">Kontrollen gäller senast sparade produktionskortet.</p>{checks && <ul>{checks.checks.map(check => <li key={check.id}><strong>{check.status === 'ok' ? '✓' : check.status === 'missing' ? 'Saknas:' : 'Kontrollera:'} {check.label}</strong><p>{check.detail}</p></li>)}</ul>}</div>
      <form className="stack" style={{ gap: 16 }} onSubmit={save}>
        <div className="grid-2">
          <label className="field">Maskin<input className="input" maxLength={100} value={draft.machine} placeholder="Till exempel Bambu 1" onChange={e => patch({ machine: e.target.value })} /></label>
          <label className="field">Planerad printtid (timmar)<input className="input" type="number" min={0} max={20000} step="0.01" value={draft.estimatedHours ?? ''} onChange={e => patch({ estimatedHours: e.target.value === '' ? null : Number(e.target.value) })} /></label>
          <label className="field">Planerad start<input className="input" type="date" value={draft.plannedDate} onChange={e => patch({ plannedDate: e.target.value })} /></label>
          <label className="field">Planerat klardatum<input className="input" type="date" min={draft.plannedDate || undefined} value={draft.dueDate} onChange={e => patch({ dueDate: e.target.value })} /></label>
        </div>
        <label className="field">Interna anteckningar<textarea className="input" rows={3} maxLength={2000} value={draft.notes} onChange={e => patch({ notes: e.target.value })} /><span className="field-hint">Syns endast i admin. Skriv inte känsliga personuppgifter här.</span></label>
        <fieldset className="production-files"><legend>Egna printfiler till jobbet</legend>
          {!files.length && <p className="dim">Ladda upp era modeller under Printfiler för att koppla dem hit.</p>}
          {files.map(file => <div className="spread" key={file.id}><label className="checkbox"><input type="checkbox" checked={draft.modelIds.includes(file.id)} disabled={busy} onChange={e => patch({ modelIds: e.target.checked ? [...draft.modelIds, file.id] : draft.modelIds.filter(id => id !== file.id) })} /><span>{file.fileName}</span></label><button type="button" className="btn btn-quiet" onClick={() => void download(file)}>Hämta</button></div>)}
          {draft.modelIds.filter(id => !files.some(file => file.id === id)).map(id => <p className="notice" key={id}>En tidigare kopplad fil kunde inte laddas. Uppdatera ordervyn innan du sparar.</p>)}
        </fieldset>
        <button className="btn" disabled={busy}>{busy ? 'Sparar…' : 'Spara produktionskort'}</button>
        {message && <p role="status" className="notice">{message}</p>}
      </form>
    </div>
  </details>;
}
