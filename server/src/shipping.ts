/**
 * Fraktalternativ och uträkningen av vad en butiksorder kostar.
 *
 * Totalen räknas fram på ett enda ställe, av `orderTotals`. Varukorgen,
 * betalsessionen och ordern frågar alla här, så beloppet kunden ser, beloppet
 * Klarna auktoriserar och beloppet som sparas kan inte glida ifrån varandra.
 */

export interface ShippingOption {
  id: string;
  name: string;
  description: string;
  /** Avgift i kronor. */
  fee: number;
  /** Fri frakt från och med det här ordervärdet. Saknas = aldrig fri. */
  freeOver?: number;
  /** Leveranstid som den visas för kunden. */
  days: string;
}

export const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: 'postombud',
    name: 'Postombud',
    description: 'Hämtas hos ditt närmaste ombud. Du får en avisering när paketet är framme.',
    fee: 59,
    freeOver: 599,
    days: '2–4 arbetsdagar',
  },
  {
    id: 'hemleverans',
    name: 'Hemleverans',
    description: 'Lämnas vid din dörr. Du bokar tid i transportörens avisering.',
    fee: 99,
    freeOver: 1199,
    days: '2–4 arbetsdagar',
  },
  {
    id: 'express',
    name: 'Express',
    description: 'Går först i både produktion och transport. Ingen fri frakt.',
    fee: 179,
    days: '1–2 arbetsdagar',
  },
];

export const DEFAULT_SHIPPING_ID = 'postombud';

/** Den tidigare fasta avgiften och gränsen, som nu hör till standardalternativet. */
export const SHIPPING_FEE = SHIPPING_OPTIONS[0]!.fee;
export const FREE_SHIPPING_THRESHOLD = SHIPPING_OPTIONS[0]!.freeOver!;

export function findShippingOption(id: unknown): ShippingOption | undefined {
  return typeof id === 'string' ? SHIPPING_OPTIONS.find((option) => option.id === id) : undefined;
}

/** Alternativet kunden valt, eller standardalternativet när inget valts. */
export function shippingOptionFor(id: unknown): ShippingOption {
  return findShippingOption(id) ?? SHIPPING_OPTIONS.find((o) => o.id === DEFAULT_SHIPPING_ID)!;
}

/** Vad frakten kostar för ett visst ordervärde. */
export function feeFor(option: ShippingOption, subtotal: number): number {
  if (option.freeOver !== undefined && subtotal >= option.freeOver) return 0;
  return option.fee;
}

/** Fraktavgiften för standardalternativet. Finns kvar för äldre anrop. */
export function shippingFor(subtotal: number): number {
  return feeFor(shippingOptionFor(undefined), subtotal);
}

export interface AppliedDiscount {
  amount: number;
  freeShipping: boolean;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}

/**
 * Räknar ut vad ordern kostar. Rabatten dras av på varorna, inte på frakten –
 * en rabatt som äter upp frakten skulle göra totalen svår att förklara – och
 * fraktavgiften mäts mot summan före rabatt, så att en rabattkod inte tar bort
 * den fria frakten kunden redan kvalificerat sig för.
 */
export function orderTotals(input: {
  subtotal: number;
  shippingOption: ShippingOption;
  discount?: AppliedDiscount;
}): OrderTotals {
  const subtotal = Math.round(input.subtotal);
  const discount = Math.min(subtotal, Math.round(input.discount?.amount ?? 0));
  const shipping = input.discount?.freeShipping ? 0 : feeFor(input.shippingOption, subtotal);

  return {
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
  };
}
