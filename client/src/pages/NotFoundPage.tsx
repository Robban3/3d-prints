import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="section">
      <div className="container center">
        <span className="eyebrow">404</span>
        <h1>Sidan gick inte att printa</h1>
        <p className="muted">
          Länken leder ingenstans. Kanske hittar du rätt härifrån:
        </p>
        <div
          className="row"
          style={{ justifyContent: "center", marginTop: 20 }}
        >
          <Link className="btn" to="/produkter">
            Produkter
          </Link>
          <Link className="btn btn-ghost" to="/egen-print">
            Beställ egen print
          </Link>
        </div>
      </div>
    </section>
  );
}
