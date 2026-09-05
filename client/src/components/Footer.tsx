import { Link } from 'react-router';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link to="/" className="brand" style={{ marginBottom: 12 }}>
              <Logo size={30} />
              FORMLABB
            </Link>
            <p style={{ maxWidth: '34ch' }}>
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
                <Link to="/produkter?kategori=inredning">Hem &amp; inredning</Link>
              </li>
              <li>
                <Link to="/produkter?kategori=kontor">Kontor &amp; skrivbord</Link>
              </li>
              <li>
                <Link to="/egen-print">Beställ egen print</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Kundservice</h4>
            <ul>
              <li>
                <Link to="/spara-order">Spåra order</Link>
              </li>
              <li>
                <Link to="/sa-funkar-det">Så funkar det</Link>
              </li>
              <li>
                <Link to="/material">Material</Link>
              </li>
              <li>
                <Link to="/om-oss">Frakt, retur och FAQ</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Verkstaden</h4>
            <ul>
              <li>Tredje Långgatan 14</li>
              <li>413 03 Göteborg</li>
              <li>Vardagar 09–17</li>
              <li>
                <a href="mailto:hej@formlabb.se">hej@formlabb.se</a>
              </li>
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
