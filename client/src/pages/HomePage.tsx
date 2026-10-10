import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { HeroScene } from '../components/HeroScene';
import { ProductCard } from '../components/ProductCard';
import { CategoryStrip } from '../components/CategoryStrip';
import { TrustBar } from '../components/TrustBar';
import { StatsRow } from '../components/StatsRow';
import { UploadDropzone } from '../components/UploadDropzone';
import { Icon } from '../components/Icon';
import { fetchConfig, fetchHomeContent, fetchProducts } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { IconName } from '../components/Icon';
import type { UploadedFile } from '../types';
import { shopJsonLd, useDocumentMeta } from '../lib/meta';
import { CampaignBlock } from '../components/CampaignBlock';
import { HeroMedia } from '../components/HeroMedia';

/** Visas innan innehållet hämtats, och om ingen rört heron i panelen. */
const DEFAULT_LEAD =
  'Högkvalitativa 3D-printade produkter och prototyper. Snabbt, hållbart och precis – precis som du vill ha det.';
const DEFAULT_HIGHLIGHT = 'Byggda för dig.';
const DEFAULT_SECONDARY = { label: 'Beställ din egen print', href: '/egen-print' };

const steps: Array<{ title: string; text: string }> = [
  { title: 'Ladda upp din 3D-fil', text: 'Vi kontrollerar och analyserar modellen' },
  { title: 'Få offert & välj material', text: 'Du får pris och leveranstid direkt' },
  { title: 'Vi printar din produkt', text: 'Kvalitetskontroll och efterbearbetning' },
  { title: 'Leverans till dig', text: 'Spårbar leverans inom 2–7 arbetsdagar' },
];

const miniFeatures: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: 'file', title: 'STL, 3MF, OBJ', text: 'Flera filformat' },
  { icon: 'bolt', title: 'Snabb offert', text: 'Direkt i formuläret' },
  { icon: 'shield', title: 'Hög kvalitet', text: 'Professionell finish' },
];

const values: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: 'target', title: 'Hög precision', text: 'Noggranna printar med skarpa detaljer.' },
  { icon: 'cube', title: 'Kvalitetsmaterial', text: 'Vi använder endast premium filament.' },
  { icon: 'leaf', title: 'Hållbarhet', text: 'Spillet mals ned och blir nytt material.' },
  { icon: 'heart', title: 'Kundfokus', text: 'Vi finns här för dig hela vägen.' },
];

/**
 * Heroknapparnas adresser kommer från panelen. Interna sökvägar ska gå genom
 * routern; en https-adress är en vanlig länk ut.
 */
function HeroLink({ className, label, href }: { className: string; label: string; href: string }) {
  if (href.startsWith('/')) {
    return (
      <Link className={className} to={href}>
        {label}
      </Link>
    );
  }
  return (
    <a className={className} href={href} rel="noreferrer noopener">
      {label}
    </a>
  );
}

export function HomePage() {
  useDocumentMeta({
    title: '3D-printade produkter och egna printjobb',
    description:
      'Svensk 3D-printverkstad. Köp färdiga produkter i egen design eller ladda upp din fil – vi mäter upp modellen och ger pris direkt.',
    jsonLd: shopJsonLd(),
  });
  const navigate = useNavigate();
  const { data, loading } = useAsync(() => fetchProducts(), []);
  const config = useAsync(() => fetchConfig(), []);
  const content = useAsync(() => fetchHomeContent(), []);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);

  const hero = content.data?.hero;
  const campaigns = content.data?.campaigns ?? [];
  const banners = campaigns.filter((campaign) => campaign.layout === 'banner');
  const cards = campaigns.filter((campaign) => campaign.layout === 'kort');

  // En tom highlight betyder att raden inte ska visas alls.
  const highlight = hero ? hero.highlight : DEFAULT_HIGHLIGHT;
  const secondary = hero ? hero.secondary : DEFAULT_SECONDARY;

  const products = data?.products ?? [];
  const popular = [...products]
    .sort((a, b) => b.rating * b.reviewCount - a.rating * a.reviewCount)
    .slice(0, 12);
  // Betyget räknas fram ur produkternas egna omdömen i stället för att hittas på.
  const reviewCount = products.reduce((sum, product) => sum + product.reviewCount, 0);
  const averageRating = reviewCount
    ? products.reduce((sum, product) => sum + product.rating * product.reviewCount, 0) / reviewCount
    : 0;

  return (
    <>
      <section className="hero">
        <div className="container">
          <div>
            {hero?.eyebrow && <span className="eyebrow">{hero.eyebrow}</span>}
            <h1>
              {hero?.title ?? '3D-printade produkter.'}
              {highlight && (
                <>
                  <br />
                  <span className="accent-text">{highlight}</span>
                </>
              )}
            </h1>
            <p className="lead">{hero?.text ?? DEFAULT_LEAD}</p>
            <div className="hero-cta">
              <HeroLink
                className="btn btn-lg"
                label={hero?.primary.label ?? 'Utforska produkter'}
                href={hero?.primary.href ?? '/produkter'}
              />
              {secondary && (
                <HeroLink
                  className="btn btn-ghost btn-lg"
                  label={secondary.label}
                  href={secondary.href}
                />
              )}
            </div>
            <span className="rating-strip">
              <span className="rating-boxes" aria-hidden="true">
                <i>★</i>
                <i>★</i>
                <i>★</i>
                <i>★</i>
                <i>★</i>
              </span>
              {averageRating.toFixed(1).replace('.', ',')}/5 baserat på{' '}
              {reviewCount.toLocaleString('sv-SE')} omdömen
            </span>
          </div>

          <div className="hero-visual">
            {hero?.media ? (
              <HeroMedia media={hero.media} poster={hero.poster} autoplay={hero.autoplay} />
            ) : (
              <HeroScene />
            )}
          </div>
        </div>
      </section>

      {banners.length > 0 && (
        <div className="container campaign-banners">
          {banners.map((campaign) => (
            <CampaignBlock key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}

      <div className="container">
        <CategoryStrip />
      </div>

      {cards.length > 0 && (
        <div className="container campaign-cards">
          {cards.map((campaign) => (
            <CampaignBlock key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}

      <section className="section">
        <div className="container">
          <div className="spread section-head">
            <h2 style={{ margin: 0 }}>Populära produkter</h2>
            <Link className="link-arrow" to="/produkter">
              Visa alla produkter
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>

          {loading ? (
            <div className="product-grid">
              {Array.from({ length: 12 }, (_, index) => (
                <div className="skeleton" key={index} />
              ))}
            </div>
          ) : (
            <div className="product-grid">
              {popular.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          <TrustBar />
        </div>
      </section>

      <section className="section section-alt">
        <div className="container custom-grid">
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
            <div className="mini-features">
              {miniFeatures.map((feature) => (
                <div className="mini-feature" key={feature.title}>
                  <Icon name={feature.icon} size={18} />
                  <span>
                    <strong>{feature.title}</strong>
                    <span>{feature.text}</span>
                  </span>
                </div>
              ))}
            </div>
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

          <div className="steps-panel">
            <h3>Så här fungerar det</h3>
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

      <section className="section-tight">
        <div className="container">
          <StatsRow />
        </div>
      </section>

      <section className="section-tight" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="value-grid">
            {values.map((value) => (
              <div className="value-item" key={value.title}>
                <Icon name={value.icon} size={24} />
                <strong>{value.title}</strong>
                <p>{value.text}</p>
              </div>
            ))}
            <div className="newsletter">
              <strong>Få nyheter &amp; erbjudanden</strong>
              <p>Anmäl dig till vårt nyhetsbrev.</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  navigate('/om-oss');
                }}
              >
                <input className="input" type="email" placeholder="Din e-postadress" required />
                <button type="submit" className="btn">
                  Prenumerera
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
