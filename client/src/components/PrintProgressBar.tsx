import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { formatHours } from '../lib/format';
import { printProgress } from '../lib/progress';
import type { AnyOrder } from '../types';

/**
 * Framstegsmätare för ett printjobb som pågår.
 *
 * Printtiden är beräknad när ordern lades och starttiden står i historiken, så
 * mätaren rör sig av sig själv utan att verkstaden rapporterar något. Den
 * stannar på 99 % så länge jobbet pågår – att visa 100 % på något som inte är
 * klart är ett löfte vi inte kan hålla.
 */
export function PrintProgressBar({ order }: { order: AnyOrder }) {
  const [now, setNow] = useState(() => new Date());

  // En minut räcker: ett printjobb tar timmar.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const progress = printProgress(order, now);
  if (!progress || progress.done) return null;

  const percent = Math.round(progress.share * 100);

  return (
    <div className="print-progress">
      <div className="print-progress-head">
        <span>
          <Icon name="bolt" size={15} /> <strong>Printas just nu</strong>
        </span>
        <span className="print-progress-percent">{percent} %</span>
      </div>
      <span
        className="progress"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Printjobbets framsteg"
      >
        <span style={{ width: `${percent}%` }} />
      </span>
      <p className="dim">
        {progress.overdue
          ? `Jobbet har tagit längre tid än de ${formatHours(progress.hours)} vi räknade med. Vi hör av oss om något hänt.`
          : `Ungefär ${formatHours(progress.remainingHours)} kvar av ${formatHours(progress.hours)}. Sedan följer kvalitetskontroll och paketering.`}
      </p>
    </div>
  );
}
