import { ResponsiveImage } from '../components/ResponsiveImage';
// Startsidan visar den utvalda kollektionen direkt efter kampanjen.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ProductCard } from '../components/ProductCard';
import { SeasonHero } from '../components/SeasonHero';
import { useAppearance } from '../lib/appearance';
import { themeFor } from '../lib/themes';
import { TrustBar } from '../components/TrustBar';
import { UploadDropzone } from '../components/UploadDropzone';
import { Icon } from '../components/Icon';
import { fetchConfig, fetchProducts } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { UploadedFile } from '../types';

const steps: Array<{ title: string; text: string }> = [
  { title: 'Ladda upp din 3D-fil', text: 'Vi kontrollerar och analyserar modellen' },
  { title: 'Få offert & välj material', text: 'Du får pris och leveranstid direkt' },
  { title: 'Vi printar din produkt', text: 'Kvalitetskontroll och efterbearbetning' },
  { title: 'Leverans till dig', text: 'Spårbar leverans inom 2–7 arbetsdagar' },
];

const campaignSlugs = ['vas-signe', 'julgran-2-pack', 'stjarna', 'kruka-elise'];


export function HomePage() {
  const { theme } = useAppearance();
  const design = themeFor(theme);
  const navigate = useNavigate();
  const { data, loading, error } = useAsync(() => fetchProducts(), []);
  const config = useAsync(() => fetchConfig(), []);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);

  const products = data?.products ?? [];
  const popular = [...products]
    .sort((a, b) => {
      const ai = campaignSlugs.indexOf(a.slug), bi = campaignSlugs.indexOf(b.slug);
      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || Number(b.featured) - Number(a.featured) || b.rating * b.reviewCount - a.rating * a.reviewCount;
    })
    .slice(0, 4);
  return (
    <>
      <SeasonHero />
      <section className="section featured-collection" aria-labelledby="featured-heading">
        <div className="container">
          <div className="collection-heading">
            <h2 id="featured-heading">{theme === 'nordic' ? 'Utvalt för dig' : design.collection}</h2>
            <span className="collection-rule" aria-hidden="true" />
            <Link className="link-arrow" to="/produkter">
              Visa alla produkter
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>

          {loading ? (
            <div className="product-grid home-products">
              {Array.from({ length: 4 }, (_, index) => (
                <div className="skeleton" key={index} />
              ))}
            </div>
          ) : error ? <p className="notice notice-error" role="alert">Kunde inte hämta produkterna. Försök ladda om sidan.</p> : popular.length === 0 ? <p className="muted">Nya favoriter är på väg. Titta gärna in igen snart.</p> : (
            <div className="product-grid home-products">
              {popular.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

        </div>
      </section>

      <section className="season-section container" aria-label="Inspiration inför julen">
        <div className="season-intro"><div className="collection-heading"><h2>Gör plats för julen</h2><span className="collection-rule" aria-hidden="true" /></div><h3>Lite mer personligt. Lite mer du.</h3><p>Upptäck 3D-printade inredningsdetaljer, unika julklappar och personliga skatter – alla formgivna och tillverkade lokalt i Sverige.</p></div>
        <Link className="season-card photo-card" to="/produkter?kategori=julkollektionen"><ResponsiveImage src="/images/campaign/gifts.webp" alt="Spiralvas, julstjärna och inslagen julklapp" loading="lazy" sizes="(max-width: 700px) 100vw, 50vw" /><span className="photo-card-copy"><strong>Presenter med personlighet</strong><span>Unika gåvor som håller länge.</span></span><Icon name="arrowRight" size={22} /></Link>
        <Link className="season-card photo-card" to="/egen-print"><ResponsiveImage src="/images/campaign/wrapping.webp" alt="Händer som knyter ett vinrött band kring en julklapp" loading="lazy" sizes="(max-width: 700px) 100vw, 50vw" /><span className="photo-card-copy"><strong>Din idé, vår verkstad</strong><span>Vi 3D-printar din design.</span></span><Icon name="arrowRight" size={22} /></Link>
      </section>

      <section className="container home-category-navigation"><h2>Hitta din form</h2><span className="collection-rule" aria-hidden="true" /><nav aria-label="Kategorier"><Link to="/produkter?kategori=julkollektionen">Julkollektionen</Link><Link to="/produkter?kategori=halloween">Halloween</Link><Link to="/produkter?kategori=inredning">Hem</Link><Link to="/produkter?kategori=kontor">Skrivbord</Link><Link to="/produkter?kategori=prylar">Hobby</Link><Link to="/produkter?kategori=kok">Kök</Link><Link to="/egen-print">Egen print</Link></nav></section>

      <section className="home-workshop">
        <ResponsiveImage className="workshop-photo" src="/images/campaign/printing.webp" alt="En spiralvas växer fram i 3D-skrivaren" loading="lazy" sizes="(max-width: 700px) 100vw, 50vw" />
        <div className="workshop-content">
          <div className="custom-pitch">
            <h2>
              Har du en egen design?
              <br />
              <span className="accent-text">Vi printar den åt dig.</span>
            </h2>
            <p className="muted">
              Ladda upp din 3D-fil så får du en offert direkt. Välj material, färg och kvalitet – vi
              tar hand om resten.
            </p>
          </div>

          <div>
            <UploadDropzone
              accepted={config.data?.upload.extensions ?? ['.stl', '.obj', '.3mf']}
              maxBytes={config.data?.upload.maxBytes ?? 100 * 1024 * 1024}
              uploaded={uploaded}
              onUploaded={(file) => {
                setUploaded(file);
                // Filen följer med till formuläret, så den inte behöver laddas upp igen.
                if (file) navigate('/egen-print', { state: { uploaded: file } });
              }}
            />
            <p className="center" style={{ marginTop: 14, marginBottom: 0 }}>
              <Link className="link-arrow" to="/material">
                Läs mer om våra material
                <Icon name="arrowRight" size={16} />
              </Link>
            </p>
          </div>

          <div className="workshop-steps" aria-label="Så här fungerar det">
            {steps.map((step, index) => (
              <div className="step" key={step.title}>
                <span className="step-num">{index + 1}</span>
                <span>
                  <strong>{step.title}</strong>
                  <span>{step.text}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="home-trust">
        <div className="container"><TrustBar /></div>
      </div>
    </>
  );
}
