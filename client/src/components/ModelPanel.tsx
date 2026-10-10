import { useState } from 'react';
import { ModelFacts } from './ModelFacts';
import { ModelViewer } from './ModelViewer';
import { Icon } from './Icon';
import { formatBytes } from '../lib/format';
import { isPreviewable } from '../lib/mesh';
import type { ModelAnalysis } from '../types';

/**
 * Den uppladdade modellen som den visas på en lagd order – i verkstadens panel
 * och på kundens orderkvitto.
 *
 * Uppmätningen sparas på ordern, så siffrorna visas även om filen städats bort.
 * 3D-vyn tolkar filen på nytt och fungerar därför också för ordrar som lades
 * innan uppmätningen fanns, så länge filen finns kvar.
 */

interface Props {
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  model?: ModelAnalysis;
  /**
   * I en lista med många ordrar ritas 3D-vyn först när någon ber om den – varje
   * vy tar ett eget WebGL-sammanhang.
   */
  collapsible?: boolean;
}

export function ModelPanel({ fileName, fileUrl, fileSize, model, collapsible }: Props) {
  const [open, setOpen] = useState(false);

  if (!fileName && !model) return null;
  const canPreview = Boolean(fileUrl) && Boolean(fileName) && isPreviewable(fileName!);
  const showViewer = canPreview && (!collapsible || open);

  return (
    <div className="model-panel">
      {fileName && (
        <div className="model-panel-head">
          <Icon name="file" size={15} />
          {fileUrl ? (
            <a href={fileUrl} className="file-link">
              {fileName}
            </a>
          ) : (
            <span>{fileName}</span>
          )}
          {fileSize ? <span className="dim">{formatBytes(fileSize)}</span> : null}
          {collapsible && canPreview && (
            <button type="button" className="btn-quiet" onClick={() => setOpen((on) => !on)}>
              {open ? 'Göm 3D-vyn' : 'Visa modellen i 3D'}
            </button>
          )}
        </div>
      )}

      {showViewer && <ModelViewer url={fileUrl} fileName={fileName!} />}
      {model && <ModelFacts analysis={model} />}
    </div>
  );
}
