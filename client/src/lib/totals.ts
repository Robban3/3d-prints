import type { CartItem } from './cart';
import type { AppliedDiscount, ShippingOption } from '../types';

/**
 * Vad varukorgen kostar, så att varukorgen och kassan visar samma siffror.
 *
 * Avsiktligt fri från React: det är ren räkning, och då går den att testa
 * utan att rendera något.
 *
 * Det här är en spegling av serverns `orderTotals` – den räknar om allt när
 * ordern läggs och är den som gäller. Att räkna här också är bara för att
 * kunden ska se totalen direkt, utan ett anrop per knapptryck.
 */

export function feeFor(option: ShippingOption | undefined, subtotal: number): number {
  if (!option) return 0;
  if (option.freeOver !== undefined && subtotal >= option.freeOver) return 0;
  return option.fee;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}

export function cartTotals(input: {
  subtotal: number;
  option?: ShippingOption;
  discount?: AppliedDiscount | null;
}): CartTotals {
  const subtotal = Math.round(input.subtotal);
  const discount = Math.min(subtotal, Math.round(input.discount?.amount ?? 0));
  // Fraktgränsen mäts mot summan före rabatt, precis som på servern.
  const shipping = input.discount?.freeShipping ? 0 : feeFor(input.option, subtotal);
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

/** Varukorgens rader i den form API:t vill ha dem. */
export function orderLines(items: CartItem[]) {
  return items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    color: item.color,
    size: item.size,
  }));
}
