import type { AnyOrder } from './types.ts';

/**
 * Hur långt ett printjobb har kommit.
 *
 * Printtiden är redan beräknad när ordern läggs, och tidpunkten då den gick i
 * produktion står i orderns historik. Då går det att visa en framstegsmätare
 * utan att verkstaden rapporterar något alls.
 *
 * Mätaren stannar på 99 % så länge jobbet pågår. Att visa 100 % på något som
 * inte är klart är ett löfte vi inte kan hålla – och att visa mer än 100 % är
 * bara förvirrande.
 */

const MAX_SHARE_WHILE_RUNNING = 0.99;

export interface PrintProgress {
  /** När jobbet gick i produktion. */
  startedAt: string;
  /** Beräknad printtid för hela ordern, i timmar. */
  hours: number;
  /** Andel klar, 0–1. */
  share: number;
  /** Beräknad tid kvar i timmar. 0 när tiden passerat. */
  remainingHours: number;
  done: boolean;
  /** True när jobbet tagit längre tid än beräknat men inte skickats. */
  overdue: boolean;
}

/** Den beräknade printtiden för ordern, oavsett ordertyp. */
export function productionHoursFor(order: AnyOrder): number | undefined {
  const hours = order.type === 'custom' ? order.quote.estimatedPrintHours : order.productionHours;
  return typeof hours === 'number' && hours > 0 ? hours : undefined;
}

/** Tidpunkten då ordern senast gick i produktion. */
function startedAt(order: AnyOrder): string | undefined {
  // Senaste händelsen gäller: en order kan ha gått tillbaka och in igen.
  for (let i = order.history.length - 1; i >= 0; i -= 1) {
    if (order.history[i]!.status === 'i_produktion') return order.history[i]!.at;
  }
  return undefined;
}

/**
 * Framsteget, eller undefined när det inte går att säga något: ordern har inte
 * börjat printas, är avbruten, eller saknar en beräknad printtid.
 */
export function printProgress(order: AnyOrder, now: Date = new Date()): PrintProgress | undefined {
  if (order.status === 'mottagen' || order.status === 'avbruten') return undefined;

  const hours = productionHoursFor(order);
  const started = startedAt(order);
  if (hours === undefined || started === undefined) return undefined;

  // Skickad eller levererad betyder att printet är klart, vad klockan än säger.
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
