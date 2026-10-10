import { useRef, useState } from 'react';
import { ApiError, uploadMedia } from '../../lib/api';
import { formatBytes } from '../../lib/format';
import { Icon } from '../Icon';
import type { Media } from '../../types';

/**
 * Laddar upp en bild eller video och visar den valda filen.
 *
 * Förhandsvisningen använder samma element som startsidan gör, så det som syns
 * här är det som kommer att synas där.
 */
interface Props {
  label: string;
  hint?: string;
  value?: Media;
  /** Begränsa till bild, t.ex. för stillbilden bakom en video. */
  imagesOnly?: boolean;
  error?: string;
  onChange: (media: Media | undefined) => void;
}

export function MediaField({ label, hint, value, imagesOnly, error, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [localError, setLocalError] = useState('');

  const accept = imagesOnly
    ? '.jpg,.jpeg,.png,.webp,.avif'
    : '.jpg,.jpeg,.png,.webp,.avif,.mp4,.webm';

  async function select(file: File | undefined) {
    if (!file) return;
    setLocalError('');
    setProgress(0);
    try {
      const media = await uploadMedia(file, setProgress).promise;
      if (imagesOnly && media.kind !== 'image') {
        setLocalError('Det här fältet tar bara bilder.');
        return;
      }
      onChange(media);
    } catch (caught) {
      setLocalError(caught instanceof ApiError ? caught.message : 'Filen kunde inte laddas upp.');
    } finally {
      setProgress(null);
      // Samma fil ska gå att välja igen efter ett misslyckat försök.
      if (input.current) input.current.value = '';
    }
  }

  const message = error || localError;

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => void select(event.target.files?.[0])}
      />

      {value ? (
        <div className="media-chip">
          {value.kind === 'video' ? (
            <video className="media-thumb" src={value.url} muted playsInline preload="metadata" />
          ) : (
            <img className="media-thumb" src={value.url} alt="" />
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{value.fileName}</strong>
            <br />
            <span className="dim" style={{ fontSize: '0.8rem' }}>
              {value.kind === 'video' ? 'Video' : 'Bild'}
            </span>
          </span>
          <button type="button" className="btn-quiet" onClick={() => onChange(undefined)}>
            Ta bort
          </button>
        </div>
      ) : progress !== null ? (
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
        </div>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => input.current?.click()}>
          <Icon name="upload" size={15} />
          Välj {imagesOnly ? 'bild' : 'bild eller video'}
        </button>
      )}

      {hint && !message && <span className="field-hint">{hint}</span>}
      {message && <span className="error">{message}</span>}
    </div>
  );
}

/** Gränsen servern sätter, så texten i panelen stämmer med verkligheten. */
export const MEDIA_LIMIT_HINT = `Video som MP4 eller WEBM, högst ${formatBytes(40 * 1024 * 1024)}. Kort och ljudlös loop fungerar bäst – varje besökare laddar hem den.`;
