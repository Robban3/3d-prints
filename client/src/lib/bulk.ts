import type { OrderStatus } from '../types';

/**
 * Vilka statusar hela urvalet kan flyttas till: de som varje markerad order har
 * som nästa steg.
 *
 * Kan en enda av dem inte, erbjuds knappen inte. Ett bulkbyte som är till
 * hälften gjort är värre än inget alls – då vet man inte längre vad som hänt.
 *
 * Fri från React, så den går att testa för sig.
 */
export function sharedNext(selected: Array<{ next: OrderStatus[] }>): OrderStatus[] {
  if (selected.length === 0) return [];
  return selected
    .slice(1)
    .reduce<
      OrderStatus[]
    >((shared, order) => shared.filter((status) => order.next.includes(status)), [...selected[0]!.next]);
}
