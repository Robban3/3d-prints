import { useRef, useState } from 'react';
import { ApiError, deleteUpload, uploadModelFile } from '../lib/api';
import { formatBytes } from '../lib/format';
import { Icon } from './Icon';
import type { UploadedFile } from '../types';

interface Props {
  accepted: string[];
  maxBytes: number;
  uploaded: UploadedFile | null;
  onUploaded: (file: UploadedFile | null) => void;
  /** Anropas när uppladdningen startar och slutar, så formuläret kan låsa knappen. */
  onBusyChange?: (busy: boolean) => void;
  error?: string;
}

/**
 * Delas mellan startsidan och beställningsformuläret. Filen laddas upp direkt när
 * den väljs, så att kunden ser att den kommit fram innan resten fylls i.
 */
export function UploadDropzone({
  accepted,
  maxBytes,
  uploaded,
  onUploaded,
  onBusyChange,
  error,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<(() => void) | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState('');

  async function select(file: File | undefined) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!accepted.some((extension) => lower.endsWith(extension))) {
      setLocalError(`Filformatet stöds inte. Ladda upp ${accepted.join(', ')}.`);
      return;
    }
    if (file.size > maxBytes) {
      setLocalError(
        `Filen är större än ${formatBytes(maxBytes)}. Hör av dig så löser vi överföringen manuellt.`,
      );
      return;
    }

    setLocalError('');
    setProgress(0);
    onBusyChange?.(true);
    const upload = uploadModelFile(file, setProgress);
    abort.current = upload.abort;
    try {
      onUploaded(await upload.promise);
    } catch (caught) {
      onUploaded(null);
      setLocalError(
        caught instanceof ApiError ? caught.message : 'Uppladdningen misslyckades. Försök igen.',
      );
    } finally {
      abort.current = null;
      setProgress(null);
      onBusyChange?.(false);
      // Samma fil ska gå att välja igen efter ett misslyckat försök.
      if (input.current) input.current.value = '';
    }
  }

  function remove() {
    if (progress !== null) {
      abort.current?.();
      return;
    }
    if (uploaded) void deleteUpload(uploaded.id);
    onUploaded(null);
    setLocalError('');
  }

  const message = error || localError;

  return (
    <div className="field">
      <input
        ref={input}
        type="file"
        accept={accepted.join(',')}
        hidden
        onChange={(event) => void select(event.target.files?.[0])}
      />

      {progress !== null ? (
        <div className="file-chip">
          <span style={{ flex: 1 }}>
            <strong>Laddar upp… {progress} %</strong>
            <span
              className="progress"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </span>
          </span>
          <button type="button" className="btn-quiet" onClick={remove}>
            Avbryt
          </button>
        </div>
      ) : uploaded ? (
        <div className="file-chip">
          <span>
            <strong>{uploaded.fileName}</strong>
            <br />
            <span className="dim" style={{ fontSize: '0.82rem' }}>
              {formatBytes(uploaded.size)} · uppladdad och sparad hos oss
            </span>
          </span>
          <button type="button" className="btn-quiet" onClick={remove}>
            Ta bort
          </button>
        </div>
      ) : (
        <div
          className={dragging ? 'dropzone dragging' : 'dropzone'}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') input.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void select(event.dataTransfer.files[0]);
          }}
        >
          <span className="dropzone-icon">
            <Icon name="upload" size={26} />
          </span>
          <strong>Dra &amp; släpp din fil här</strong>
          <span className="or">eller</span>
          <span className="btn">Välj fil från datorn</span>
          <div className="dropzone-meta">
            <span>
              <Icon name="file" size={14} /> Max {formatBytes(maxBytes)}
            </span>
            <span>
              <Icon name="cube" size={14} /> {accepted.join(', ').toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {message && <span className="error">{message}</span>}
    </div>
  );
}
