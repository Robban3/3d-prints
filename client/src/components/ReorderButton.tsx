import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, reorderCustomOrder } from '../lib/api';
import type { CustomOrderPrefill } from '../lib/prefill';

/**
 * Beställer samma printjobb igen. Filen kopieras på servern, eftersom
 * originalet hör till sin order, och formuläret öppnas förifyllt – ordern läggs
 * sedan på vanligt sätt, med samma validering och betalning som alla andra.
 */
export function ReorderButton({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      const { draft } = await reorderCustomOrder(orderId);
      const prefill: CustomOrderPrefill = {
        projectName: draft.projectName,
        description: draft.description,
        request: draft.request,
        customer: draft.customer,
        notice: draft.fileMissing
          ? `Uppgifterna från ${orderId} är ifyllda, men modellfilen gick inte att kopiera – ladda upp den igen.`
          : `Uppgifterna från ${orderId} är ifyllda, filen med.`,
        ...(draft.fileId && draft.fileName && draft.fileUrl
          ? {
              uploaded: {
                id: draft.fileId,
                fileName: draft.fileName,
                url: draft.fileUrl,
                size: draft.fileSize ?? 0,
                ...(draft.analysis ? { analysis: draft.analysis } : {}),
              },
            }
          : {}),
      };
      navigate('/egen-print', { state: prefill });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Beställningen kunde inte förberedas.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reorder">
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void start()}>
        {busy ? 'Förbereder…' : 'Beställ samma igen'}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
