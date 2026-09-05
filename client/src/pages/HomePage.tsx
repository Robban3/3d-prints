import { Link } from 'react-router';
import { ProductArt } from '../components/ProductArt';
import { ProductCard } from '../components/ProductCard';
import { fetchProducts } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const usps = [
  {
    icon: '⚙',
    title: 'Egen verkstad',
    text: 'Åtta maskiner i Göteborg. Vi äger hela kedjan från slicing till packning, utan mellanhänder.',
  },
  {
    icon: '⏱',
    title: 'Print startar samma dag',
    text: 'Beställningar före 14.00 läggs i kön direkt. Lagervara skickas normalt inom ett dygn.',
  },
  {
    icon: '♻',
    title: 'Materialet går tillbaka',
    text: 'Stödmaterial och misslyckade print mals ned och blir nytt filament. Vi skickar i papper.',
  },
  {
    icon: '✎',
    title: 'Din fil, vår maskin',
    text: 'Ladda upp en STL så får du pris direkt. Har du bara en skiss ritar vi modellen åt dig.',
  },
];

const steps = [
  {
    n: '01',
    title: 'Ladda upp din fil',
    text: 'STL, OBJ, 3MF eller STEP. Har du ingen fil hjälper vi dig att rita.',
  },
  {
    n: '02',
    title: 'Välj material och kvalitet',
    text: 'Priset uppdateras direkt när du ändrar något i formuläret.',
  },
  {
    n: '03',
    title: 'Vi printar och kontrollerar',
    text: 'Varje detalj mäts och rensas från stödmaterial innan den packas.',
  },
  {
    n: '04',
    title: 'Hemleverans',
    text: 'Spårbar leverans inom 2–7 arbetsdagar beroende på jobbets storlek.',
  },
];

export function HomePage() {
  const { data, loading } = useAsync(() => fetchProducts(), []);
  const products = data?.products ?? [];
  const featured = products.filter((product) => product.featured).slice(0, 4);
  const heroArt = products.slice(0, 4);

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">3D-print från Göteborg</span>
            <h1>Saker som inte fanns förrän någon printade dem</h1>
            <p className="lead">
              Fjorton egendesignade produkter för hem och kontor – och en verkstad som lika gärna
              printar din egen fil. Ladda upp en modell så får du pris och leveranstid på sekunden.
            </p>
            <div className="row" style={{ marginTop: 26 }}>
              <Link className="btn btn-lg" to="/produkter">
                Se produkterna
              </Link>
              <Link className="btn btn-ghost btn-lg" to="/egen-print">
                Beställ egen print
              </Link>
            </div>
            <div className="row" style={{ marginTop: 26, gap: 24 }}>
              <span className="muted">✓ Fri frakt över 599 kr</span>
              <span className="muted">✓ 30 dagars öppet köp</span>
              <span className="muted">✓ 4,7 av 5 i snitt</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            {heroArt.map((product) => (
              <div className="art-tile" key={product.id}>
                <ProductArt
                  shape={product.art.shape}
                  accent={product.art.accent}
                  title={product.name}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="usp-grid">
            {usps.map((usp) => (
              <div className="usp" key={usp.title}>
                <div className="usp-icon" aria-hidden="true">
                  {usp.icon}
                </div>
                <h3>{usp.title}</h3>
                <p>{usp.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="spread section-head">
            <div>
              <h2>Populärt just nu</h2>
              <p>Fyra produkter som lämnar verkstaden i högst takt den här månaden.</p>
            </div>
            <Link className="btn btn-ghost" to="/produkter">
              Alla 14 produkter
            </Link>
          </div>
          {loading ? (
            <div className="product-grid">
              {[0, 1, 2, 3].map((n) => (
                <div className="skeleton" key={n} />
              ))}
            </div>
          ) : (
            <div className="product-grid">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="panel" style={{ padding: 'clamp(28px, 5vw, 52px)' }}>
            <div className="hero-grid">
              <div>
                <span className="eyebrow">Egen print</span>
                <h2>Skicka din fil – vi gör resten</h2>
                <p className="muted">
                  Prototyper, reservdelar till diskmaskinen, en modell till examensarbetet eller 200
                  giveaways till mässan. Fyll i formuläret så räknar vi fram pris och leveransdatum
                  medan du skriver, innan du bestämmer dig.
                </p>
                <ol className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
                  {steps.map((step) => (
                    <li key={step.n} className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
                      <span className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                        {step.n}
                      </span>
                      <span>
                        <strong>{step.title}</strong>
                        <br />
                        <span className="muted" style={{ fontSize: '0.92rem' }}>
                          {step.text}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
                <Link className="btn btn-lg" to="/egen-print" style={{ marginTop: 26 }}>
                  Räkna ut ditt pris
                </Link>
              </div>
              <div className="panel panel-tight" style={{ background: 'var(--bg-raised)' }}>
                <h3>Vad kostar det ungefär?</h3>
                <table className="spec-table">
                  <tbody>
                    <tr>
                      <th>Liten detalj, PLA (20 cm³)</th>
                      <td>från 149 kr</td>
                    </tr>
                    <tr>
                      <th>Reservdel i PETG (60 cm³)</th>
                      <td>ca 280 kr</td>
                    </tr>
                    <tr>
                      <th>Prototyp i resin (40 cm³)</th>
                      <td>ca 420 kr</td>
                    </tr>
                    <tr>
                      <th>50 st giveaways (12 cm³/st)</th>
                      <td>ca 40 kr/st</td>
                    </tr>
                  </tbody>
                </table>
                <p
                  className="dim"
                  style={{
                    fontSize: '0.85rem',
                    marginTop: 14,
                    marginBottom: 0,
                  }}
                >
                  Exakt pris får du direkt i formuläret. Startavgiften på 95 kr tas ut en gång per
                  order, oavsett antal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
