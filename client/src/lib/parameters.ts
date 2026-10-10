import type { Product, ProductParameter } from '../types';

/**
 * Räkningen bakom produkter med valbara mått.
 *
 * En spegling av serverns `parameters.ts`: servern räknar alltid om priset när
 * ordern läggs, det här är bara för att kunden ska se summan röra sig direkt
 * när reglaget dras. Ren räkning utan React, så den går att testa för sig.
 */

export interface ParameterValues {
  [parameterId: string]: number;
}

/** Avrundar till närmaste steg och håller värdet inom spannet. */
export function snap(parameter: ProductParameter, value: unknown): number {
  const raw = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(raw)) return parameter.default;

  const clamped = Math.min(parameter.max, Math.max(parameter.min, raw));
  const steps = Math.round((clamped - parameter.min) / parameter.step);
  const bounded = Math.min(parameter.max, parameter.min + steps * parameter.step);
  return Math.round(bounded * 1000) / 1000;
}

/** Grundvärdena, som produktsidan börjar på. */
export function defaultValues(parameters: ProductParameter[] | undefined): ParameterValues {
  const values: ParameterValues = {};
  for (const parameter of parameters ?? []) values[parameter.id] = parameter.default;
  return values;
}

/** Pristillägget för de valda måtten – avvikelsen från grundvärdet kostar. */
export function parameterPrice(
  parameters: ProductParameter[] | undefined,
  values: ParameterValues,
): number {
  if (!parameters || parameters.length === 0) return 0;
  const total = parameters.reduce((sum, parameter) => {
    const value = values[parameter.id] ?? parameter.default;
    return sum + (value - parameter.default) * parameter.pricePerUnit;
  }, 0);
  return Math.round(total);
}

/** Produktens pris med de valda måtten inräknade, aldrig under noll. */
export function priceFor(product: Product, values: ParameterValues): number {
  return Math.max(0, product.price + parameterPrice(product.parameters, values));
}

/** Måtten som produkten faktiskt får, med kundens val inlagda. */
export function dimensionsFor(product: Product, values: ParameterValues): Product['dimensions'] {
  const dimensions = { ...product.dimensions };
  for (const parameter of product.parameters ?? []) {
    if (!parameter.axis) continue;
    dimensions[parameter.axis] = values[parameter.id] ?? parameter.default;
  }
  return dimensions;
}

/** Printtiden skalad mot hur mycket större delen blivit. */
export function printTimeFor(product: Product, values: ParameterValues): number {
  if (!product.parameters || product.parameters.length === 0 || product.price <= 0) {
    return product.printTimeHours;
  }
  const factor = priceFor(product, values) / product.price;
  return Math.max(0.5, Math.round(product.printTimeHours * factor * 10) / 10);
}

/** Måtten i klartext: "Bredd 400 mm · Höjd 120 mm". */
export function describeValues(
  parameters: ProductParameter[] | undefined,
  values: ParameterValues,
): string {
  if (!parameters || parameters.length === 0) return '';
  return parameters
    .map((parameter) => {
      const value = values[parameter.id] ?? parameter.default;
      return `${parameter.name} ${value} ${parameter.unit}`;
    })
    .join(' · ');
}

/** True när produkten har mått kunden får välja. */
export function isParametric(product: Product): boolean {
  return (product.parameters?.length ?? 0) > 0;
}
