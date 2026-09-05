import { Link } from 'react-router';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const entries: Array<{ to: string; icon: IconName; title: string; text: string }> = [
  { to: '/produkter', icon: 'grid', title: 'Alla produkter', text: 'Visa alla' },
  { to: '/produkter?kategori=inredning', icon: 'home', title: 'Hem', text: 'Inredning & prylar' },
  { to: '/produkter?kategori=kontor', icon: 'desk', title: 'Desk', text: 'Kontor & organisering' },
  { to: '/produkter?kategori=prylar', icon: 'hobby', title: 'Hobby', text: 'Modeller & tillbehör' },
  { to: '/produkter?kategori=kok', icon: 'gear', title: 'Kök', text: 'Funktionella delar' },
  { to: '/egen-print', icon: 'sparkle', title: 'Special', text: 'Unika designer' },
];

export function CategoryStrip() {
  return (
    <nav className="category-strip" aria-label="Kategorier">
      {entries.map((entry) => (
        <Link key={entry.title} to={entry.to}>
          <Icon name={entry.icon} size={22} />
          <strong>{entry.title}</strong>
          <span>{entry.text}</span>
        </Link>
      ))}
    </nav>
  );
}
