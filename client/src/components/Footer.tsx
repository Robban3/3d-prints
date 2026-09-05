import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link to="/" className="brand" style={{ marginBottom: 12 }}>
              <Logo />
              Formlabb
            </Link>
            <p style={{ maxWidth: '32ch' }}>
              Vi designar och printar i egen verkstad i Göteborg. Åtta maskiner, ingen mellanhand
              och produktion som startar samma dag du beställer.
            </p>
          </div>
          <div>
            <h4>Butiken</h4>
            <ul>
              <li>
                <Link to="/produkter">Alla produkter</Link>
              </li>
              <li>
                <Link to="/egen-print">Beställ egen print</Link>
              </li>
              <li>
                <Link to="/spara-order">Spåra order</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Kundservice</h4>
            <ul>
              <li>
                <Link to="/om-oss">Frakt och retur</Link>
              </li>
              <li>
                <Link to="/om-oss">Vanliga frågor</Link>
              </li>
              <li>
                <a href="mailto:hej@formlabb.se">hej@formlabb.se</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Verkstaden</h4>
            <ul>
              <li>Tredje Långgatan 14</li>
              <li>413 03 Göteborg</li>
              <li>Vardagar 09–17</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom spread">
          <span>© {new Date().getFullYear()} Formlabb AB · Org.nr 559xxx-xxxx</span>
          <span>Priser inkl. moms · Fri frakt över 599 kr</span>
        </div>
      </div>
    </footer>
  );
}
