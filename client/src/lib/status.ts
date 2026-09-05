import type { OrderStatus } from '../types';

export const statusLabels: Record<OrderStatus, string> = {
  mottagen: 'Mottagen',
  i_produktion: 'I produktion',
  skickad: 'Skickad',
  levererad: 'Levererad',
  avbruten: 'Avbruten',
};

/** Stegen som visas i tidslinjen. Avbrutna ordrar följer inte den här vägen. */
export const productionFlow: OrderStatus[] = ['mottagen', 'i_produktion', 'skickad', 'levererad'];
