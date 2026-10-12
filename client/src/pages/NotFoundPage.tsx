import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { useDocumentMeta } from '../lib/meta';

export function NotFoundPage() {
  useDocumentMeta({
    title: 'Sidan finns inte',
    description: 'Länken leder inte vidare. Bläddra i sortimentet i stället.',
    noindex: true,
  });
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
