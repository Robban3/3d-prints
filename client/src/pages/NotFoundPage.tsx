import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader
        eyebrow="404"
        title="Sidan gick inte att printa"
        text="Länken leder ingenstans. Kanske hittar du rätt härifrån:"
      />
      <section className="section">
        <div className="container center">
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-lg" to="/produkter">
              Produkter
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/egen-print">
              Beställ egen print
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
