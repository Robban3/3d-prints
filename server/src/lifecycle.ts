import type { OrderStatus } from './types.ts';

/**
 * En order rör sig framåt genom produktionen, och kan avbrytas fram tills den
 * skickats. Övergångarna är avsiktligt strikta så att en order inte kan hoppa
 * från mottagen till levererad av misstag.
 */
const transitions: Record<OrderStatus, OrderStatus[]> = {
  mottagen: ['i_produktion', 'avbruten'],
  i_produktion: ['skickad', 'avbruten'],
  skickad: ['levererad'],
  levererad: [],
  avbruten: [],
};

export const statusLabels: Record<OrderStatus, string> = {
  mottagen: 'Mottagen',
  i_produktion: 'I produktion',
  skickad: 'Skickad',
  levererad: 'Levererad',
  avbruten: 'Avbruten',
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && value in transitions;
}

export function nextStatuses(current: OrderStatus): OrderStatus[] {
  return transitions[current];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

/** Saldot ska tillbaka till lagret när en butiksorder avbryts. */
export function shouldRestoreStock(to: OrderStatus): boolean {
  return to === 'avbruten';
}
