import { Link } from 'react-router';
import { Icon } from './Icon';
import { useAppearance } from '../lib/appearance';
import { themeFor, themeImage } from '../lib/themes';
import { ResponsiveImage } from './ResponsiveImage';

export function SeasonHero() {
  const { theme } = useAppearance();
  const design = themeFor(theme);
  return (
    <section className={`season-hero season-hero-${theme}`} aria-label={design.eyebrow}>
      <div className="container season-hero-grid">
        <div className="season-hero-copy">
          <span className="season-label">{design.eyebrow}</span>
          <h1>{design.headline[0]}<br /><span>{design.headline[1]}</span></h1>
          <p>{design.text}</p>
          <div className="hero-cta">
            <Link className="btn btn-lg" to={theme === 'halloween' ? '/produkter?kategori=halloween' : theme === 'nordic' || theme === 'workshop' ? '/produkter?kategori=julkollektionen' : '/produkter'}>{design.cta}<Icon name="arrowRight" size={18} /></Link>
            {theme !== 'nordic' && <Link className="season-secondary" to="/egen-print">Beställ din egen print <Icon name="arrowRight" size={16} /></Link>}
          </div>
          {theme !== 'nordic' && <div className="season-hero-note"><span>Design med personlighet</span><span>Printat i Göteborg</span></div>}
        </div>
        <div className="season-hero-image">
          <ResponsiveImage src={theme === 'nordic' ? '/images/themes/nordic-reference.png' : themeImage(theme)} alt={design.imageAlt} sizes="(max-width: 900px) 100vw, 60vw" width="1536" height="1024" loading="eager" fetchPriority="high" />
          {theme !== 'nordic' && <span className="season-image-caption">{design.name} · Formlabb</span>}
        </div>
      </div>
    </section>
  );
}
