import type { AnyOrder } from '../types';

/**
 * Hur långt ett printjobb har kommit.
 *
 * Det här är en spegling av serverns progress.ts. Mätaren måste röra sig medan
 * sidan är öppen, så den räknas här i stället för att hämtas en gång i
 * sekunden. Siffrorna i båda testerna är desamma – glider uträkningarna isär
 * går ett av dem sönder.
 */

const MAX_SHARE_WHILE_RUNNING = 0.99;

export interface PrintProgress {
  startedAt: string;
  hours: number;
  /** Andel klar, 0–1. */
  share: number;
  remainingHours: number;
  done: boolean;
  /** Jobbet har tagit längre tid än beräknat men inte skickats. */
  overdue: boolean;
}

export function productionHoursFor(order: AnyOrder): number | undefined {
  const hours = order.type === 'custom' ? order.quote.estimatedPrintHours : order.productionHours;
  return typeof hours === 'number' && hours > 0 ? hours : undefined;
}

function startedAt(order: AnyOrder): string | undefined {
  // Senaste händelsen gäller: en order kan ha gått tillbaka och in igen.
  for (let i = order.history.length - 1; i >= 0; i -= 1) {
    if (order.history[i]!.status === 'i_produktion') return order.history[i]!.at;
  }
  return undefined;
}

export function printProgress(order: AnyOrder, now: Date = new Date()): PrintProgress | undefined {
  if (order.status === 'mottagen' || order.status === 'avbruten') return undefined;

  const hours = productionHoursFor(order);
  const started = startedAt(order);
  if (hours === undefined || started === undefined) return undefined;

  if (order.status !== 'i_produktion') {
    return { startedAt: started, hours, share: 1, remainingHours: 0, done: true, overdue: false };
  }

  const elapsedHours = (now.getTime() - new Date(started).getTime()) / 3_600_000;
  const raw = elapsedHours / hours;
  const share = Math.min(MAX_SHARE_WHILE_RUNNING, Math.max(0, raw));

  return {
    startedAt: started,
    hours,
    share: Math.round(share * 1000) / 1000,
    remainingHours: Math.max(0, Math.round((hours - elapsedHours) * 10) / 10),
    done: false,
    overdue: raw > 1,
  };
}
