import { feeFor } from '../lib/totals';
import { formatPrice } from '../lib/format';
import type { ShippingOption } from '../types';

/**
 * Val av fraktsätt. Avgiften som visas är den som gäller för den här
 * varukorgen, så fri frakt syns direkt i stället för som ett villkor.
 */
interface Props {
  options: ShippingOption[];
  selected: string;
  subtotal: number;
  /** En kod med fri frakt gör valet gratis oavsett alternativ. */
  freeShipping?: boolean;
  onSelect: (id: string) => void;
}

export function ShippingPicker({ options, selected, subtotal, freeShipping, onSelect }: Props) {
  if (options.length === 0) return null;

  return (
    <div className="field">
      <span className="field-label">Fraktsätt</span>
      <div className="shipping-options" role="radiogroup" aria-label="Fraktsätt">
        {options.map((option) => {
          const fee = freeShipping ? 0 : feeFor(option, subtotal);
          const missing = option.freeOver !== undefined && fee > 0 ? option.freeOver - subtotal : 0;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected === option.id}
              className="shipping-option"
              onClick={() => onSelect(option.id)}
            >
              <span className="shipping-option-head">
                <strong>{option.name}</strong>
                <span className="shipping-fee">{fee === 0 ? 'Fri' : formatPrice(fee)}</span>
              </span>
              <span className="dim">{option.days}</span>
              <span className="shipping-option-text">{option.description}</span>
              {missing > 0 && (
                <span className="shipping-option-nudge">
                  {formatPrice(missing)} kvar till fri frakt
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
