import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ApiError, downloadPrintFile, fetchPrintFiles, uploadPrintFile, saveFileFolder, movePrintFile } from '../../lib/api';
import type { AdminPrintFile, FileFolder } from '../../lib/api';
import { Icon } from '../Icon';

const FILE_DRAG = 'application/x-formlabb-printfile';
export function PrintFileLibrary({ token }: { token: string }) {
  const [files, setFiles] = useState<AdminPrintFile[]>([]);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [current, setCurrent] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [folderName, setFolderName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  async function load() {
    setLoading(true);
    try { const result = await fetchPrintFiles(token); setFiles(result.files); setFolders(result.folders ?? []); }
    catch (error) { setError(error instanceof Error ? error.message : 'Kunde inte hämta printfiler.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [token]);
  const destination = current === 'all' || current === 'root' ? null : current;
  async function upload(selected: File[], target: string | null = destination) {
    if (busy || !selected.length) return;
    setBusy(true); setError(''); setMessage('');
    const failures: string[] = []; let uploaded = 0;
    try {
      for (const [index, file] of selected.entries()) {
        setProgress(`Laddar upp ${index + 1} av ${selected.length}: ${file.name}`);
        if (file.size > 100 * 1024 * 1024) { failures.push(`${file.name}: högst 100 MB per fil.`); continue; }
        try { await uploadPrintFile(token, file, target); uploaded++; }
        catch (error) { failures.push(error instanceof Error ? error.message : `${file.name}: uppladdningen misslyckades.`); }
      }
      await load();
      if (uploaded) setMessage(`${uploaded} ${uploaded === 1 ? 'fil uppladdad' : 'filer uppladdade'}.`);
      if (failures.length) setError(failures.join(' '));
    } finally { setBusy(false); setProgress(''); }
  }
  async function move(id: string, folderId: string | null) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await movePrintFile(token, id, folderId); await load(); setMessage('Filen är flyttad.'); }
    catch (error) { setError(error instanceof Error ? error.message : 'Filen kunde inte flyttas.'); }
    finally { setBusy(false); }
  }
  function drop(event: DragEvent, target: string | null) {
    event.preventDefault(); event.stopPropagation(); setDragTarget(null);
    if (busy) return;
    if (event.dataTransfer.files.length) { void upload(Array.from(event.dataTransfer.files), target); return; }
    const id = event.dataTransfer.getData(FILE_DRAG);
    if (id && files.some(file => file.id === id)) void move(id, target);
  }
  async function folderSave() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await saveFileFolder(token, folderName, editing ?? undefined);
      await load(); setCurrent(result.folder.id); setFolderName(''); setEditing(null);
      setMessage(editing ? 'Mappnamnet är uppdaterat.' : 'Mappen är skapad.');
    } catch (error) { setError(error instanceof ApiError ? Object.values(error.fields).join(' ') || error.message : error instanceof Error ? error.message : 'Mappen kunde inte sparas.'); }
    finally { setBusy(false); }
  }
  async function download(file: AdminPrintFile) {
    setBusy(true); setError('');
    try { await downloadPrintFile(token, file); }
    catch (error) { setError(error instanceof Error ? error.message : 'Nedladdningen misslyckades.'); }
    finally { setBusy(false); }
  }
  const matching = files.filter(file => (current === 'all' || (current === 'root' ? !file.folderId : file.folderId === current))
    && (source === 'all' || source === file.source)
    && `${file.fileName} ${file.orderId ?? ''} ${file.projectName ?? ''}`.toLocaleLowerCase('sv').includes(search.toLocaleLowerCase('sv')));
  const selectedFolder = folders.find(folder => folder.id === current);
  return <div className="stack">
    <h2>Printfiler</h2>
    <p className="muted">Samla alla delar till en modell i en namngiven mapp. Dra filer till en mapp, eller använd Flytta på mobilen. Kundfilernas orderkoppling och gallring behålls.</p>
    <form className="panel file-folder-form" onSubmit={event => { event.preventDefault(); void folderSave(); }}>
      <label className="field">{editing ? 'Nytt mappnamn' : 'Mappnamn'}<input className="input" maxLength={100} required value={folderName} disabled={busy} placeholder="Till exempel Julgranskula – alla delar" onChange={event => setFolderName(event.target.value)} /></label>
      <button className="btn" disabled={busy || !folderName.trim()}>{editing ? 'Spara mappnamn' : 'Skapa mapp'}</button>
      {editing && <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setFolderName(''); }}>Avbryt</button>}
    </form>
    <nav className="file-folder-grid" aria-label="Filmappar">
      {[{ id: 'all', name: 'Alla filer' }, { id: 'root', name: 'Osorterade filer' }, ...folders].map(folder => <div key={folder.id} className={`file-folder${current === folder.id ? ' is-active' : ''}${dragTarget === folder.id ? ' is-drop-target' : ''}`}
        onDragOver={event => { event.preventDefault(); if (!busy && folder.id !== 'all') setDragTarget(folder.id); }}
        onDragLeave={() => setDragTarget(null)} onDrop={event => { if (folder.id === 'all') { event.preventDefault(); setDragTarget(null); } else drop(event, folder.id === 'root' ? null : folder.id); }}>
        <button type="button" className="file-folder-open" aria-current={current === folder.id ? 'page' : undefined} onClick={() => setCurrent(folder.id)}>
          <Icon name="file" size={24} /><strong>{folder.name}</strong><span className="dim">{files.filter(file => folder.id === 'all' || (folder.id === 'root' ? !file.folderId : file.folderId === folder.id)).length} filer</span>
        </button>
        {folder.id !== 'all' && folder.id !== 'root' && <button type="button" className="btn-quiet" disabled={busy} aria-label={`Byt namn på ${folder.name}`} onClick={() => { setEditing(folder.id); setFolderName(folder.name); }}>Byt namn</button>}
      </div>)}
    </nav>
    <div className="panel stack">
      <h3>{selectedFolder?.name ?? (current === 'root' ? 'Osorterade filer' : 'Alla filer')}</h3>
      <div className={`file-upload-zone${dragTarget === 'upload' ? ' is-drop-target' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragTarget('upload'); }} onDragLeave={() => setDragTarget(null)} onDrop={event => drop(event, destination)}>
        <Icon name="upload" size={28} /><strong>Dra och släpp en eller flera printfiler här</strong>
        <p className="dim">Nya filer sparas i {selectedFolder ? `mappen ${selectedFolder.name}` : 'Osorterade filer'}.</p>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => picker.current?.click()}>Välj filer</button>
        <input ref={picker} className="sr-only" aria-label="Ladda upp egna printfiler" type="file" multiple accept=".stl,.obj,.3mf,.step,.stp,.f3d" disabled={busy} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
        <span className="dim">STL, OBJ, 3MF, STEP, STP och F3D · högst 100 MB per fil</span>
      </div>
      {busy && <p role="status">{progress || 'Arbetar…'}</p>}
      <div className="workshop-toolbar">
        <label className="field">Sök fil, projekt eller ordernummer<input className="input" type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="field">Visa<select className="input" value={source} onChange={event => setSource(event.target.value)}><option value="all">Alla printfiler</option><option value="own">Egna filer</option><option value="customer">Kundfiler</option></select></label>
        <button type="button" className="btn btn-ghost" disabled={loading || busy} onClick={() => { setError(''); void load(); }}>Uppdatera listan</button>
      </div>
    </div>
    {message && <p className="notice notice-success" role="status">{message}</p>}
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {loading ? <p role="status">Hämtar printfiler…</p> : <>
      <p className="dim">{matching.length} filer</p>
      {matching.length === 0 && <p className="notice">Inga filer matchar i den här vyn. Välj Alla filer för att söka i hela biblioteket.</p>}
      {matching.map(file => <div className="panel admin-file-card" key={file.id} draggable={!busy} onDragStart={event => { event.dataTransfer.setData(FILE_DRAG, file.id); event.dataTransfer.effectAllowed = 'move'; }}>
        <div className="stack">
          <strong>{file.fileName}</strong>
          <span className="dim">{file.source === 'own' ? 'Egen fil' : 'Kundfil'} · {(file.size / 1024 / 1024).toLocaleString('sv', { maximumFractionDigits: 2 })} MB · {new Date(file.createdAt).toLocaleDateString('sv')}</span>
          <span className="dim">{folders.find(folder => folder.id === file.folderId)?.name ?? 'Osorterade filer'}</span>
          {file.orderId && <span>Order {file.orderId}{file.projectName ? ` · ${file.projectName}` : ''}</span>}
          {file.source === 'customer' && !file.orderId && <span className="dim">Ingen beställning ännu</span>}
        </div>
        <div className="file-card-actions">
          <label className="field">Flytta<select className="input" aria-label={`Flytta ${file.fileName}`} disabled={busy} value={file.folderId ?? ''} onChange={event => void move(file.id, event.target.value || null)}><option value="">Osorterade filer</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void download(file)}>Hämta fil</button>
        </div>
      </div>)}
    </>}
  </div>;
}
