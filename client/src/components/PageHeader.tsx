import { Link } from 'react-router';
import type { ReactNode } from 'react';

interface Crumb {
  to: string;
  label: string;
}

interface Props {
  eyebrow?: string;
  title: string;
  text?: ReactNode;
  crumbs?: Crumb[];
  /** Innehåll som läggs till höger om rubriken, t.ex. en knapp. */
  aside?: ReactNode;
}

/** Gemensamt sidhuvud så att alla undersidor börjar likadant. */
export function PageHeader({ eyebrow, title, text, crumbs, aside }: Props) {
  return (
    <section className="page-header">
      <div className="container">
        {crumbs && crumbs.length > 0 && (
          <nav className="breadcrumbs" aria-label="Brödsmulor">
            <Link to="/">Start</Link>
            {crumbs.map((crumb) => (
              <span key={crumb.to}>
                {' / '}
                <Link to={crumb.to}>{crumb.label}</Link>
              </span>
            ))}
          </nav>
        )}
        <div className="page-header-row">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h1>{title}</h1>
            {text && <p className="lead">{text}</p>}
          </div>
          {aside && <div className="page-header-aside">{aside}</div>}
        </div>
      </div>
    </section>
  );
}
