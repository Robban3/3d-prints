import { Icon } from './Icon';
import type { IconName } from './Icon';

const stats: Array<{ icon: IconName; value: string; label: string }> = [
  { icon: 'clock', value: '1–3 dagar', label: 'Snabb produktion' },
  { icon: 'layers', value: '5 material', label: 'Hög kvalitet' },
  { icon: 'users', value: '1 000+ kunder', label: 'Nöjda kunder' },
  { icon: 'flag', value: 'Svenskt företag', label: 'Tillverkning i Göteborg' },
];

export function StatsRow() {
  return (
    <div className="stats-row">
      {stats.map((stat) => (
        <div className="stat" key={stat.value}>
          <Icon name={stat.icon} size={26} />
          <span>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
