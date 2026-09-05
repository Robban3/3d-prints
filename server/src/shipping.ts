/** Fri frakt över den här gränsen, annars fast fraktavgift. */
export const FREE_SHIPPING_THRESHOLD = 599;
export const SHIPPING_FEE = 59;

export function shippingFor(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}
