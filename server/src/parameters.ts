import type { Product, ProductParameter } from './types.ts';

/**
 * Produkter med valbara mått.
 *
 * Det här är den ena saken en 3D-printbutik kan som ingen lagerhållande butik
 * kan: hyllan görs i den bredd kunden faktiskt behöver. Varje parameter har ett
 * grundvärde som ingår i priset, och ett pris per enhet därutöver – så en
 * bredare hylla kostar mer, och en smalare kostar mindre.
 *
 * Allt här är ren räkning. Värdena som kommer från kunden normaliseras alltid
 * innan de används, och priset räknas om på servern när ordern läggs: det som
 * klienten visat är ett besked, inte ett avtal.
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
  const snapped = parameter.min + steps * parameter.step;
  // Steget kan gå förbi taket; då gäller taket.
  const bounded = Math.min(parameter.max, snapped);
  // Flyttalsavrundning ger annars 239.99999999999997.
  return Math.round(bounded * 1000) / 1000;
}

/**
 * Värdena som faktiskt ska användas. Parametrar kunden inte satt får sitt
 * grundvärde, och allt som inte är en parameter på produkten faller bort.
 */
export function normalizeValues(
  parameters: ProductParameter[] | undefined,
  input: unknown,
): ParameterValues {
  if (!parameters || parameters.length === 0) return {};
  const raw = (input ?? {}) as Record<string, unknown>;
  const values: ParameterValues = {};
  for (const parameter of parameters) {
    values[parameter.id] = snap(parameter, raw[parameter.id]);
  }
  return values;
}

/**
 * Pristillägget för de valda måtten. Grundvärdet ingår i produktens pris, så
 * avvikelsen därifrån är det som kostar – åt båda hållen.
 */
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

/**
 * Printtiden skalad mot hur mycket större delen blivit. En hylla som är dubbelt
 * så bred tar inte lika lång tid som två hyllor, men den tar längre tid än en –
 * och att visa grundtiden för varje mått vore att lova något vi inte håller.
 */
export function printTimeFor(product: Product, values: ParameterValues): number {
  if (!product.parameters || product.parameters.length === 0 || product.price <= 0) {
    return product.printTimeHours;
  }
  const factor = priceFor(product, values) / product.price;
  return Math.max(0.5, Math.round(product.printTimeHours * factor * 10) / 10);
}

/** Måtten i klartext, som de visas på ordern: "Bredd 400 mm · Djup 120 mm". */
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
