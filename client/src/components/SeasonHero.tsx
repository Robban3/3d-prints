import { Link } from 'react-router';
import { Icon } from './Icon';
import { useAppearance } from '../lib/appearance';
import { themeFor } from '../lib/themes';

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
            <Link className="btn btn-lg" to="/produkter?kategori=julkollektionen">{design.cta}<Icon name="arrowRight" size={18} /></Link>
            {theme !== 'nordic' && <Link className="season-secondary" to="/egen-print">Beställ din egen print <Icon name="arrowRight" size={16} /></Link>}
          </div>
          {theme !== 'nordic' && <div className="season-hero-note"><span>Design med personlighet</span><span>Printat i Göteborg</span></div>}
        </div>
        <div className="season-hero-image">
          <img src={theme === 'nordic' ? '/images/themes/nordic-reference.png' : `/images/themes/${theme}.webp`} alt={design.imageAlt} width="1536" height="1024" loading="eager" />
          {theme !== 'nordic' && <span className="season-image-caption">Julen i Formlabb · Inspiration</span>}
        </div>
      </div>
    </section>
  );
}
