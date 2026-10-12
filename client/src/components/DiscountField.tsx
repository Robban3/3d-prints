import { useState } from 'react';
import { Icon } from './Icon';
import { formatPrice } from '../lib/format';
import type { AppliedDiscount } from '../types';

/**
 * Inmatning av rabattkod. Vad koden är värd kommer från servern, så fältet
 * skickar bara koden vidare och visar svaret.
 */
interface Props {
  code: string;
  discount: AppliedDiscount | null;
  error: string;
  checking: boolean;
  onApply: (code: string) => void;
  onClear: () => void;
}

export function DiscountField({ code, discount, error, checking, onApply, onClear }: Props) {
  const [input, setInput] = useState('');

  if (code && discount) {
    return (
      <div className="discount-applied">
        <Icon name="check" size={15} />
        <span>
          <strong>{discount.code}</strong>
          <span className="dim">
            {' '}
            {discount.amount > 0 ? `−${formatPrice(discount.amount)}` : ''}
            {discount.freeShipping ? ' · fri frakt' : ''}
          </span>
        </span>
        <button type="button" className="btn-quiet" onClick={onClear}>
          Ta bort
        </button>
      </div>
    );
  }

  return (
    <div className="discount-field">
      <label htmlFor="discount-code">Rabattkod</label>
      <div className="discount-row">
        <input
          id="discount-code"
          className="input"
          autoComplete="off"
          spellCheck={false}
          placeholder="t.ex. HOST20"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter i fältet ska inte skicka iväg kassans formulär.
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (input.trim()) onApply(input.trim());
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!input.trim() || checking}
          onClick={() => onApply(input.trim())}
        >
          {checking ? 'Prövar…' : 'Lös in'}
        </button>
      </div>
      {/* Ett fel hör till den kod som just prövades, inte till fältet. */}
      {code && error && <span className="error">{error}</span>}
    </div>
  );
}
