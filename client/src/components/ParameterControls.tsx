import type { Product } from '../types';
import type { ParameterValues } from '../lib/parameters';
import { priceFor, snap } from '../lib/parameters';
import { formatPrice } from '../lib/format';

/**
 * Reglagen för en produkt med valbara mått.
 *
 * Varje reglage visar vad just det måttet gör med priset, inte bara totalen:
 * att dra bredden från 360 till 500 mm ska kännas som ett val med en prislapp,
 * inte som att siffran längst ner ändrar sig av sig själv.
 */
export function ParameterControls({
  product,
  values,
  onChange,
}: {
  product: Product;
  values: ParameterValues;
  onChange: (values: ParameterValues) => void;
}) {
  const parameters = product.parameters ?? [];
  if (parameters.length === 0) return null;

  const base = priceFor(product, values);

  return (
    <div className="stack" style={{ gap: 18 }}>
      {parameters.map((parameter) => {
        const value = values[parameter.id] ?? parameter.default;
        // Vad raden kostar jämfört med grundmåttet, räknat som servern gör det.
        const delta = base - priceFor(product, { ...values, [parameter.id]: parameter.default });
        return (
          <div className="field" key={parameter.id}>
            <label htmlFor={`parameter-${parameter.id}`}>
              {parameter.name}:{' '}
              <strong>
                {value} {parameter.unit}
              </strong>
              {delta !== 0 && (
                <span className="dim" style={{ marginLeft: 8, fontSize: '0.86rem' }}>
                  {delta > 0 ? '+' : '−'}
                  {formatPrice(Math.abs(delta))} mot standardmåttet
                </span>
              )}
            </label>
            <input
              id={`parameter-${parameter.id}`}
              type="range"
              min={parameter.min}
              max={parameter.max}
              step={parameter.step}
              value={value}
              onChange={(event) =>
                onChange({ ...values, [parameter.id]: snap(parameter, event.target.value) })
              }
            />
            <div className="spread dim" style={{ fontSize: '0.82rem' }}>
              <span>
                {parameter.min} {parameter.unit}
              </span>
              <span>
                {parameter.max} {parameter.unit}
              </span>
            </div>
            {parameter.description && <span className="field-hint">{parameter.description}</span>}
          </div>
        );
      })}
    </div>
  );
}
