import { Icon } from './Icon';
import type { IconName } from './Icon';

const items: Array<{ icon: IconName; text: string }> = [
  { icon: 'truck', text: 'Fri frakt över 599 kr' },
  { icon: 'clock', text: '1–3 dagars produktion' },
  { icon: 'return', text: '30 dagars öppet köp' },
  { icon: 'card', text: 'Säker betalning med Klarna' },
];

export function TrustBar() {
  return (
    <div className="trust-row">
      {items.map((item) => (
        <div key={item.text}>
          <Icon name={item.icon} size={18} />
          {item.text}
        </div>
      ))}
    </div>
  );
}
