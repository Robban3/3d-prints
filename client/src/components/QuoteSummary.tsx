import { formatHours, formatPrice } from '../lib/format';
import type { QuoteBreakdown } from '../types';

/**
 * Prisspecifikationen för ett kundunikt printjobb. Delas mellan formuläret, där
 * den räknas om medan kunden ändrar, och den sparade offerten, där den visar
 * vad som en gång räknades fram.
 */
interface Props {
  quote: QuoteBreakdown;
  quantity: number;
  materialName?: string;
}

export function QuoteSummary({ quote, quantity, materialName }: Props) {
  return (
    <>
      <div className="price" style={{ fontSize: '2.4rem', margin: '8px 0 4px' }}>
        {formatPrice(quote.total)}
      </div>
      <p className="dim" style={{ fontSize: '0.86rem' }}>
        {quantity} st · {formatPrice(quote.unitPrice)} per styck inkl. moms
      </p>

      <div style={{ margin: '18px 0' }}>
        <div className="summary-row">
          <span>Material{materialName ? ` (${materialName})` : ''}</span>
          <span>{formatPrice(quote.materialCost)}/st</span>
        </div>
        <div className="summary-row">
          <span>Maskintid</span>
          <span>{formatPrice(quote.machineCost)}/st</span>
        </div>
        {quote.postProcessingCost > 0 && (
          <div className="summary-row">
            <span>Efterbearbetning</span>
            <span>{formatPrice(quote.postProcessingCost)}/st</span>
          </div>
        )}
        {quote.volumeDiscount > 0 && (
          <div className="summary-row discount">
            <span>Volymrabatt</span>
            <span>−{formatPrice(quote.volumeDiscount)}</span>
          </div>
        )}
        <div className="summary-row">
          <span>Startavgift</span>
          <span>{formatPrice(quote.setupFee)}</span>
        </div>
        {quote.rushSurcharge > 0 && (
          <div className="summary-row">
            <span>Expresstillägg</span>
            <span>{formatPrice(quote.rushSurcharge)}</span>
          </div>
        )}
        <div className="summary-row total">
          <span>Att betala</span>
          <span>{formatPrice(quote.total)}</span>
        </div>
      </div>

      <div className="notice">
        <strong>Beräknad printtid:</strong> {formatHours(quote.estimatedPrintHours)}
        <br />
        <strong>Materialvikt:</strong> {quote.estimatedWeightGrams} g
        <br />
        <strong>Leverans:</strong> {quote.estimatedDeliveryDays} arbetsdagar
      </div>
    </>
  );
}
