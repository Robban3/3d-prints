import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { LithophanePreview } from '../components/LithophanePreview';
import { defaultLithophane } from '../lib/lithophane';
import type { LithophaneMesh, LithophaneSettings } from '../lib/lithophane';
import { uploadModelFile } from '../lib/api';

interface Photo { image: HTMLImageElement; url: string; name: string }
interface Model { mesh: LithophaneMesh; stl: ArrayBuffer; key: string; settings: LithophaneSettings }

export function LithophanePage() {
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [settings, setSettings] = useState({ ...defaultLithophane });
  const [resolution, setResolution] = useState(160), [upright, setUpright] = useState(true);
  const [backlight, setBacklight] = useState(true), [model, setModel] = useState<Model | null>(null);
  const [busy, setBusy] = useState(false), [loadingImage, setLoadingImage] = useState(false), [error, setError] = useState('');
  const [uploading, setUploading] = useState(false), [uploadProgress, setUploadProgress] = useState(0);
  const picker = useRef<HTMLInputElement>(null), imageRevision = useRef(0), cancelUpload = useRef<(() => void) | null>(null);
  const generationKey = JSON.stringify([photo?.url, settings, resolution, upright]);
  const disabled = busy || loadingImage || uploading || !model || model.key !== generationKey;
  const patch = (value: Partial<LithophaneSettings>) => setSettings(current => ({ ...current, ...value }));
  useEffect(() => () => { imageRevision.current++; cancelUpload.current?.(); }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  async function choose(file?: File) {
    if (!file || uploading) return;
    const revision = ++imageRevision.current; setLoadingImage(true); setError('');
    let url = '';
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('Bilden får vara högst 12 MB. Spara gärna en mindre kopia.');
      const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
      if (!png && !jpg && !webp) throw new Error('Välj en bild i JPG, PNG eller WebP. HEIC behöver först sparas som JPG.');
      url = URL.createObjectURL(file);
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Bilden kunde inte öppnas. Prova att spara den som JPG eller PNG.')); image.src = url; });
      if (image.naturalWidth * image.naturalHeight > 24_000_000 || !image.naturalWidth || !image.naturalHeight) throw new Error('Bilden är för stor. Minska den till högst 24 megapixel.');
      if (revision !== imageRevision.current) { URL.revokeObjectURL(url); return; }
      setPhoto({ image, url, name: file.name }); setModel(null);
    } catch (error) { if (url) URL.revokeObjectURL(url); if (revision === imageRevision.current) setError(error instanceof Error ? error.message : 'Bilden kunde inte öppnas.'); }
    finally { if (revision === imageRevision.current) setLoadingImage(false); }
  }

  useEffect(() => {
    if (!photo) return;
    setBusy(true); setError('');
    let worker: Worker | undefined, active = true, deadline: number | undefined;
    const timer = window.setTimeout(() => {
      try {
        let width = resolution, height = Math.max(2, Math.round(resolution * photo.image.naturalHeight / photo.image.naturalWidth));
        if (height > 360) { width = Math.max(2, Math.round(width * 360 / height)); height = 360; }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Webbläsaren kunde inte läsa bilden.');
        context.drawImage(photo.image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        worker = new Worker(new URL('../lib/lithophane.worker.ts', import.meta.url), { type: 'module' });
        deadline = window.setTimeout(() => { worker?.terminate(); if (active) { setError('Beräkningen tog för lång tid. Prova lägre detaljnivå.'); setModel(null); setBusy(false); } }, 30000);
        worker.onmessage = (event: MessageEvent<Model & { error?: string }>) => {
          if (!active) return;
          clearTimeout(deadline);
          if (event.data.error) { setError(event.data.error); setModel(null); } else setModel({ ...event.data, key: generationKey, settings: { ...settings } });
          setBusy(false); worker?.terminate();
        };
        worker.onerror = () => { clearTimeout(deadline); if (active) { setError('Modellen kunde inte skapas. Prova lägre detaljnivå eller ladda om sidan.'); setModel(null); setBusy(false); } worker?.terminate(); };
        worker.postMessage({ pixels, width, height, settings, upright }, [pixels.buffer]);
      } catch (error) { if (active) { setError(error instanceof Error ? error.message : 'Modellen kunde inte skapas.'); setBusy(false); setModel(null); } }
    }, 250);
    return () => { active = false; clearTimeout(timer); clearTimeout(deadline); worker?.terminate(); };
  }, [photo, settings, resolution, upright, generationKey]);

  function file() {
    if (!model) throw new Error('Skapa modellen först.');
    const name = (photo?.name.replace(/\.[^.]+$/, '') ?? 'foto').replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 70);
    return new File([model.stl], `formlabb-litofan-${name}.stl`, { type: 'application/octet-stream' });
  }
  function download() {
    if (disabled) return;
    const stl = file(), url = URL.createObjectURL(stl), anchor = document.createElement('a');
    anchor.href = url; anchor.download = stl.name; document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function order() {
    if (disabled || !model) return;
    setUploading(true); setUploadProgress(0); setError('');
    const upload = uploadModelFile(file(), setUploadProgress); cancelUpload.current = upload.abort;
    const timeout = window.setTimeout(upload.abort, 120000);
    try {
      const uploaded = await upload.promise;
      navigate('/egen-print', { state: { uploaded, lithophane: { volumeCm3: model.mesh.volumeCm3, name: 'Litofan från foto', description: `Litofan, ${settings.shape === 'flat' ? 'platt' : `böjd ${settings.angle}°`}, ${Math.round(model.mesh.width)} × ${Math.round(model.mesh.height)} mm. Tjocklek ${settings.minThickness}–${settings.maxThickness} mm. Önskas i vit PLA, 100 % fyllning och fin lagerhöjd. Kontrollera ljusgenomsläpp och printtid före produktion.` } } });
    } catch (error) { setError(error instanceof Error ? error.message : 'Modellen kunde inte skickas. Försök igen.'); }
    finally { clearTimeout(timeout); cancelUpload.current = null; setUploading(false); }
  }
  function range(label: string, key: 'brightness' | 'contrast' | 'gamma' | 'smoothing', min: number, max: number, step: number) {
    return <label className="field litho-range">{label}<span className="dim">{settings[key].toLocaleString('sv')}</span><input type="range" min={min} max={max} step={step} value={settings[key]} onChange={event => patch({ [key]: Number(event.target.value) })} /></label>;
  }
  return <>
    <PageHeader eyebrow="Från foto till 3D" title="Skapa din egen litofan" text="Ett foto som träder fram när ljuset lyser igenom. Gör en personlig modell, hämta STL-filen eller låt oss printa den." />
    <section className="section"><div className="container litho-layout">
        <div className="panel stack litho-photo-panel">
          <h2>1. Välj ditt foto</h2>
          <div className="litho-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void choose(event.dataTransfer.files[0]); }}>
            {photo ? <img src={photo.url} alt="Ditt valda foto, endast i webbläsaren" /> : <Icon name="upload" size={32} />}
            <strong>{loadingImage ? 'Öppnar bilden…' : photo ? photo.name : 'Dra in ett foto eller välj en bild'}</strong>
            <button className="btn btn-ghost" disabled={uploading || loadingImage} onClick={() => picker.current?.click()}>{photo ? 'Byt bild' : 'Välj bild'}</button>
            <input className="sr-only" ref={picker} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Välj foto till litofan" onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
            <span className="dim">JPG, PNG och WebP · högst 12 MB</span>
          </div>
          <p className="field-hint">Fotot bearbetas på din enhet. Det laddas inte upp när du justerar eller hämtar STL. Väljer du att beställa skickas 3D-modellen till oss.</p>
        </div>
        <fieldset className="panel stack litho-settings" disabled={uploading}>
          <legend>2. Modell och bild</legend>
          <div className="grid-2">
            <label className="field">Bredd (mm)<input className="input" type="number" min={20} max={250} value={settings.width} onChange={event => patch({ width: Number(event.target.value) })} /></label>
            <label className="field">Form<select className="input" value={settings.shape} onChange={event => patch({ shape: event.target.value as LithophaneSettings['shape'] })}><option value="flat">Platt panel</option><option value="curved">Böjd panel / cylinder</option></select></label>
            <label className="field">Minsta tjocklek (mm)<input className="input" type="number" min={.4} max={5.9} step={.1} value={settings.minThickness} onChange={event => patch({ minThickness: Number(event.target.value) })} /></label>
            <label className="field">Största tjocklek (mm)<input className="input" type="number" min={.5} max={6} step={.1} value={settings.maxThickness} onChange={event => patch({ maxThickness: Number(event.target.value) })} /></label>
            <label className="field">Ram (mm)<input className="input" type="number" min={0} max={10} step={.5} value={settings.border} onChange={event => patch({ border: Number(event.target.value) })} /></label>
            <label className="field">Detaljnivå<select className="input" value={resolution} onChange={event => setResolution(Number(event.target.value))}><option value={96}>Snabb – 96 punkter</option><option value={160}>Normal – 160 punkter</option><option value={240}>Fin – 240 punkter</option></select></label>
          </div>
          {settings.shape === 'curved' && <label className="field">Böjning: {settings.angle}°<input type="range" min={30} max={360} step={5} value={settings.angle} onChange={event => patch({ angle: Number(event.target.value) })} /><span className="field-hint">360° ger en sluten cylinder. Bredden blir omkretsen.</span></label>}
          {range('Ljusstyrka', 'brightness', -100, 100, 1)}{range('Kontrast', 'contrast', -80, 80, 1)}{range('Gamma', 'gamma', .3, 3, .05)}{range('Utjämning', 'smoothing', 0, 3, 1)}
          <label className="litho-check"><input type="checkbox" checked={settings.invert} onChange={event => patch({ invert: event.target.checked })} />Invertera ljus och mörker</label>
          <label className="litho-check"><input type="checkbox" checked={settings.mirror} onChange={event => patch({ mirror: event.target.checked })} />Spegla bilden</label>
          <label className="litho-check"><input type="checkbox" checked={upright} onChange={event => setUpright(event.target.checked)} />Exportera stående för utskrift</label>
          <button className="btn btn-ghost" type="button" onClick={() => { setSettings({ ...defaultLithophane }); setResolution(160); setUpright(true); }}>Återställ inställningar</button>
        </fieldset>
        <div className="panel stack litho-preview-panel">
          <div className="spread"><h2>Din förhandsvisning</h2><button className="btn btn-ghost" aria-pressed={backlight} onClick={() => setBacklight(value => !value)}>{backlight ? 'Släck bakljus' : 'Tänd bakljus'}</button></div>
          {model ? <LithophanePreview mesh={model.mesh} backlight={backlight} min={model.settings.minThickness} max={model.settings.maxThickness} /> : <div className="litho-empty"><Icon name="sparkle" size={44} /><h3>Ditt foto. Ett nytt ljus.</h3><p>Välj en bild för att se den som en printbar 3D-modell.</p></div>}
          {(busy || loadingImage) && <p role="status">{loadingImage ? 'Öppnar bilden…' : 'Skapar modell och STL…'}</p>}
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {model && <dl className="litho-stats"><div><dt>Mått</dt><dd>{model.mesh.width.toLocaleString('sv')} × {Math.round(model.mesh.height)} mm{settings.shape === 'curved' ? ' längs ytan' : ''}</dd></div><div><dt>Trianglar</dt><dd>{(model.mesh.indices.length / 3).toLocaleString('sv')}</dd></div><div><dt>STL-fil</dt><dd>{(model.stl.byteLength / 1024 / 1024).toLocaleString('sv', { maximumFractionDigits: 1 })} MB</dd></div></dl>}
          <p className="field-hint">Ljusförhandsvisningen är ungefärlig. Det färdiga resultatet beror på filament, skrivare och ljuskälla. Bildens proportioner behålls.</p>
          <div className="litho-actions"><button className="btn" disabled={disabled} onClick={download}>Hämta STL</button><button className="btn btn-ghost" disabled={disabled} onClick={() => void order()}>Beställ print hos oss</button></div>
          {uploading && <div className="stack"><p role="status">{uploadProgress < 100 ? `Skickar 3D-modellen: ${uploadProgress} %` : 'Sparar modellen – vänta på bekräftelsen…'}</p><progress aria-label="Överföring till Formlabb" max={100} value={uploadProgress} /><button className="btn btn-ghost" onClick={() => cancelUpload.current?.()}>Avbryt överföringen</button></div>}
        </div>
        <div className="panel litho-print-tips"><h3>För ett fint ljusgenomsläpp</h3><p>Välj vit PLA och ett foto med tydliga kontraster. En stående utskrift, 100 % fyllning och 0,1–0,16 mm lagerhöjd är en bra utgångspunkt. Använd en LED-ljuskälla.</p><p>Vi kontrollerar modellen och printtiden innan produktion. <Link to="/integritet">Så hanterar vi dina filer.</Link></p></div>
    </div></section>
  </>;
}
