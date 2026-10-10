import { useRef, useState } from 'react';
import { fetchStats } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatPrice } from '../../lib/format';
import { statusLabels } from '../../lib/status';
import { Icon } from '../Icon';
import type { DashboardStats, DayBucket, OrderStatus } from '../../types';

/**
 * Översikten i panelen: hur mycket som sålts, var ordrarna står, vad som går
 * bäst och vad som håller på att ta slut.
 *
 * Diagrammen ritas som SVG utan bibliotek. Varje diagram visar en serie, så
 * ingen färg behöver bära identitet – rubriken säger vad som visas och varje
 * stapel har sin egen etikett. Siffrorna finns också som tabell, för den som
 * läser med skärmläsare eller vill kopiera dem.
 */

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 220;
const PAD = { top: 16, right: 14, bottom: 28, left: 54 };

/** Rundar upp till en jämn siffra så y-axeln får läsbara steg. */
function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function shortDate(date: string): string {
  // ÅÅÅÅ-MM-DD → D/M, som är det som får plats på axeln.
  const [, month, day] = date.split('-');
  return `${Number(day)}/${Number(month)}`;
}

function RevenueChart({ days }: { days: DayBucket[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  if (days.length < 2) return <p className="muted">För få dagar att rita en graf på.</p>;

  const max = niceMax(Math.max(...days.map((day) => day.revenue)));
  const plotWidth = VIEW_WIDTH - PAD.left - PAD.right;
  const plotHeight = VIEW_HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotHeight;

  const xFor = (index: number) => PAD.left + (index / (days.length - 1)) * plotWidth;
  const yFor = (value: number) => baseline - (value / max) * plotHeight;

  const last = days.length - 1;
  const points = days.map((day, index) => ({ x: xFor(index), y: yFor(day.revenue) }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  // Ytan är samma kurva, stängd ner mot baslinjen.
  const area = [
    `M${PAD.left},${baseline}`,
    ...points.map((point) => `L${point.x},${point.y}`),
    `L${xFor(last)},${baseline}`,
    'Z',
  ].join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  /** Pekarens läge räknas om till ett dagindex, oavsett hur stor svg:n ritats. */
  function locate(clientX: number): number | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const ratio = (x - PAD.left) / plotWidth;
    if (ratio < -0.02 || ratio > 1.02) return null;
    return Math.min(last, Math.max(0, Math.round(ratio * last)));
  }

  const hovered = active === null ? null : days[active];

  return (
    <div className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label={`Omsättning per dag de senaste ${days.length} dagarna`}
        onPointerMove={(event) => setActive(locate(event.clientX))}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((tick) => {
          const y = baseline - tick * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={VIEW_WIDTH - PAD.right}
                y1={y}
                y2={y}
                className="chart-grid"
                vectorEffect="non-scaling-stroke"
              />
              <text x={PAD.left - 10} y={y + 4} className="chart-tick" textAnchor="end">
                {Math.round(max * tick).toLocaleString('sv-SE')}
              </text>
            </g>
          );
        })}

        <path d={area} className="chart-area" />
        <polyline points={line} className="chart-line" vectorEffect="non-scaling-stroke" />

        {/* Bara första, mittersta och sista datumet – resten kolliderar. */}
        {[0, Math.floor(last / 2), last].map((index) => (
          <text
            key={index}
            x={xFor(index)}
            y={VIEW_HEIGHT - 8}
            className="chart-tick"
            textAnchor={index === 0 ? 'start' : index === last ? 'end' : 'middle'}
          >
            {shortDate(days[index]!.date)}
          </text>
        ))}

        {active !== null && hovered && (
          <g>
            <line
              x1={xFor(active)}
              x2={xFor(active)}
              y1={PAD.top}
              y2={baseline}
              className="chart-crosshair"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={xFor(active)}
              cy={yFor(hovered.revenue)}
              r={5}
              className="chart-point"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
      </svg>

      {hovered && (
        <div className="chart-tooltip" role="status">
          <strong>{hovered.date}</strong>
          <span>{formatPrice(hovered.revenue)}</span>
          <span className="dim">
            {hovered.orders} {hovered.orders === 1 ? 'order' : 'ordrar'}
          </span>
        </div>
      )}

      <details className="chart-table">
        <summary>Visa siffrorna som tabell</summary>
        <table className="spec-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Omsättning</th>
              <th>Ordrar</th>
            </tr>
          </thead>
          <tbody>
            {days
              .filter((day) => day.orders > 0)
              .map((day) => (
                <tr key={day.date}>
                  <th>{day.date}</th>
                  <td>{formatPrice(day.revenue)}</td>
                  <td>{day.orders}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Texten som skrivs vid stapeln i stället för råa värdet. */
  display?: string;
  note?: string;
}

/** Vågräta staplar med etikett per rad, så ingen färg behöver bära betydelse. */
function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="bar-label">
            {row.label}
            {row.note && <span className="dim"> {row.note}</span>}
          </span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
              title={`${row.label}: ${row.display ?? row.value}`}
            />
          </span>
          <span className="bar-value">{row.display ?? row.value.toLocaleString('sv-SE')}</span>
        </li>
      ))}
    </ul>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

const STATUS_ORDER: OrderStatus[] = [
  'mottagen',
  'i_produktion',
  'skickad',
  'levererad',
  'avbruten',
];

export function Dashboard({ token }: { token: string }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAsync(() => fetchStats(token, days), [token, days]);

  if (loading && !data) return <div className="skeleton" style={{ height: 320 }} />;
  if (error) return <p className="notice notice-error">{error}</p>;
  if (!data) return null;

  const stats: DashboardStats = data.stats;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="stat-row">
        <StatTile
          label="Omsättning totalt"
          value={formatPrice(stats.revenue.total)}
          note={`${formatPrice(stats.revenue.period)} de senaste ${days} dagarna`}
        />
        <StatTile
          label="Snittordervärde"
          value={formatPrice(stats.orders.averageValue)}
          note={`${stats.orders.active} ordrar räknade`}
        />
        <StatTile
          label="Väntar på start"
          value={String(stats.orders.waitingToStart)}
          note={`${stats.orders.shop} butik · ${stats.orders.custom} egna jobb`}
        />
        <StatTile
          label="Omdömen att granska"
          value={String(stats.pendingReviews)}
          note={stats.pendingReviews > 0 ? 'Ligger i fliken Omdömen' : 'Inget i kö'}
        />
      </div>

      <div className="panel">
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>Omsättning per dag</h3>
          <div className="chip-row" style={{ margin: 0 }}>
            {[7, 30, 90].map((option) => (
              <button
                key={option}
                type="button"
                className="chip"
                aria-pressed={days === option}
                onClick={() => setDays(option)}
              >
                {option} dagar
              </button>
            ))}
          </div>
        </div>
        <RevenueChart days={stats.revenue.byDay} />
      </div>

      <div className="admin-grid-2">
        <div className="panel">
          <h3>Ordrar per status</h3>
          <BarList
            rows={STATUS_ORDER.map((status) => ({
              key: status,
              label: statusLabels[status],
              value: stats.orders.byStatus[status] ?? 0,
            }))}
            empty="Inga ordrar än."
          />
        </div>

        <div className="panel">
          <h3>Bästsäljare</h3>
          <BarList
            rows={stats.bestsellers.map((entry) => ({
              key: entry.productId,
              label: entry.name,
              value: entry.quantity,
              display: `${entry.quantity} st`,
              note: `· ${formatPrice(entry.revenue)}`,
            }))}
            empty="Inga butiksordrar än."
          />
        </div>
      </div>

      <div className="panel">
        <h3>
          Lågt lager <span className="dim">· {data.lowStockThreshold} st eller mindre</span>
        </h3>
        {stats.lowStock.length === 0 ? (
          <p className="muted">Alla produkter har saldo över gränsen.</p>
        ) : (
          <table className="spec-table">
            <thead>
              <tr>
                <th>Produkt</th>
                <th>Saldo</th>
                <th>Väntar</th>
              </tr>
            </thead>
            <tbody>
              {stats.lowStock.map((entry) => (
                <tr key={entry.productId}>
                  <th>{entry.name}</th>
                  <td>{entry.stock === 0 ? <strong>Slutsåld</strong> : `${entry.stock} st`}</td>
                  <td>
                    {entry.watchers > 0 ? (
                      <span className="watchers">
                        <Icon name="users" size={14} /> {entry.watchers}
                      </span>
                    ) : (
                      <span className="dim">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {stats.lowStock.some((entry) => entry.watchers > 0) && (
          <p className="dim" style={{ fontSize: '0.84rem', marginBottom: 0 }}>
            Kunder som bevakar en slutsåld produkt får ett mejl automatiskt när du höjer saldot.
          </p>
        )}
      </div>
    </div>
  );
}
