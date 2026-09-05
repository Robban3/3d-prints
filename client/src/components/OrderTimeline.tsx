import { formatDate } from '../lib/format';
import { productionFlow, statusLabels } from '../lib/status';
import type { AnyOrder } from '../types';

/** Visar hur långt ordern kommit, och när varje steg inträffade. */
export function OrderTimeline({ order }: { order: AnyOrder }) {
  const history = order.history ?? [];
  const timeOf = (status: string) => history.find((event) => event.status === status)?.at;

  if (order.status === 'avbruten') {
    const event = history.find((entry) => entry.status === 'avbruten');
    return (
      <div className="notice" style={{ marginTop: 18 }}>
        <strong>Ordern är avbruten.</strong>
        {event && <span className="dim"> {formatDate(event.at)}</span>}
        {event?.note && <p style={{ margin: '6px 0 0' }}>{event.note}</p>}
      </div>
    );
  }

  const currentIndex = productionFlow.indexOf(order.status);

  return (
    <ol className="timeline">
      {productionFlow.map((status, index) => {
        const at = timeOf(status);
        const state =
          index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending';
        const note = history.find((event) => event.status === status)?.note;
        return (
          <li key={status} className={`timeline-step ${state}`}>
            <span className="timeline-dot" aria-hidden="true" />
            <div>
              <strong>{statusLabels[status]}</strong>
              {at ? (
                <span className="dim">{formatDate(at)}</span>
              ) : (
                <span className="dim">Väntar</span>
              )}
              {note && <span className="timeline-note">{note}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
