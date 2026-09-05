import { Icon } from './Icon';
import type { IconName } from './Icon';

const items: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: 'bolt', title: 'Snabb produktion', text: '1–3 arbetsdagar' },
  { icon: 'shield', title: 'Hög kvalitet', text: 'Professionell finish' },
  { icon: 'flag', title: 'Svenskt företag', text: 'Tillverkning i Göteborg' },
];

export function TopBar() {
  return (
    <div className="topbar">
      <div className="container">
        {items.map((item) => (
          <div className="topbar-item" key={item.title}>
            <Icon name={item.icon} size={17} />
            <span>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </span>
          </div>
        ))}
        <div className="topbar-item topbar-right">
          <Icon name="headset" size={17} />
          <span>
            <strong>Kundsupport</strong>
            <span>
              <a href="mailto:hej@formlabb.se">hej@formlabb.se</a>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
