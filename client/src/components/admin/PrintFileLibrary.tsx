import { useEffect, useState } from 'react';
import { downloadPrintFile, fetchPrintFiles, uploadPrintFile } from '../../lib/api';
import type { AdminPrintFile } from '../../lib/api';

export function PrintFileLibrary({ token }: { token: string }) {
  const [files, setFiles] = useState<AdminPrintFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  async function load() { setLoading(true); try { setFiles((await fetchPrintFiles(token)).files); } catch (error) { setError(error instanceof Error ? error.message : 'Kunde inte hämta printfiler.'); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [token]);
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { setError('Filen får vara högst 100 MB.'); return; }
    setBusy(true); setError('');
    try { await uploadPrintFile(token, file); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Uppladdningen misslyckades.'); }
    finally { setBusy(false); }
  }
  async function download(file: AdminPrintFile) {
    setBusy(true); setError('');
    try { await downloadPrintFile(token, file); }
    catch (error) { setError(error instanceof Error ? error.message : 'Nedladdningen misslyckades.'); }
    finally { setBusy(false); }
  }
  const matching = files.filter(file => (source === 'all' || source === file.source)
    && `${file.fileName} ${file.orderId ?? ''} ${file.projectName ?? ''}`.toLocaleLowerCase('sv').includes(search.toLocaleLowerCase('sv')));
  return <div className="stack">
    <h2>Printfiler</h2>
    <p className="muted">Hämta egna modeller och kundernas uppladdningar. Egna filer sparas i biblioteket. Kundfiler utan beställning tas bort efter ett dygn.</p>
    <div className="panel stack">
      <label className="field">Ladda upp egen printfil
        <input type="file" accept=".stl,.obj,.3mf,.step,.stp,.f3d" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
      </label>
      <span className="dim">STL, OBJ, 3MF, STEP, STP och F3D · högst 100 MB per fil</span>
      {busy && <p role="status">Överför fil…</p>}
      <label className="field">Sök fil, projekt eller ordernummer<input className="input" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="field">Visa<select className="input" value={source} onChange={event => setSource(event.target.value)}><option value="all">Alla printfiler</option><option value="own">Egna filer</option><option value="customer">Kundfiler</option></select></label>
      <button className="btn-quiet" disabled={loading || busy} onClick={() => { setError(''); void load(); }}>Uppdatera listan</button>
    </div>
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {loading ? <p role="status">Hämtar printfiler…</p> : <>
      <p className="dim">{matching.length} filer</p>
      {matching.length === 0 && <p className="notice">Inga printfiler matchar. Ladda upp egna filer här; kundernas filer visas automatiskt.</p>}
      {matching.map(file => <div className="panel admin-file-card" key={file.id}>
        <div className="stack">
        <strong>{file.fileName}</strong>
        <span className="dim">{file.source === 'own' ? 'Egen fil' : 'Kundfil'} · {(file.size / 1024 / 1024).toLocaleString('sv', { maximumFractionDigits: 2 })} MB · {new Date(file.createdAt).toLocaleDateString('sv')}</span>
        {file.orderId && <span>Order {file.orderId}{file.projectName ? ` · ${file.projectName}` : ''}</span>}
        {file.source === 'customer' && !file.orderId && <span className="dim">Ingen beställning ännu</span>}
        </div>
        <button className="btn btn-ghost" disabled={busy} onClick={() => void download(file)}>Hämta fil</button>
      </div>)}
    </>}
  </div>;
}
