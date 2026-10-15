import { ResponsiveImage } from '../components/ResponsiveImage';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ProductCard } from '../components/ProductCard';
import { fetchConfig, fetchProducts } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { PageHeader } from '../components/PageHeader';
import type { Product } from '../types';
import { productPrice } from '../lib/productPrice';

type SortId = 'popular' | 'price-asc' | 'price-desc' | 'name';

const sorters: Record<SortId, (a: Product, b: Product) => number> = {
  popular: (a, b) => b.rating * b.reviewCount - a.rating * a.reviewCount,
  'price-asc': (a, b) => productPrice(a).price - productPrice(b).price,
  'price-desc': (a, b) => productPrice(b).price - productPrice(a).price,
  name: (a, b) => a.name.localeCompare(b.name, 'sv'),
};

const sortLabels: Array<{ id: SortId; label: string }> = [
  { id: 'popular', label: 'Populärast' },
  { id: 'price-asc', label: 'Lägsta pris' },
  { id: 'price-desc', label: 'Högsta pris' },
  { id: 'name', label: 'Namn A–Ö' },
];

export function ShopPage({ bargains = false }: { bargains?: boolean }) {
  const [params, setParams] = useSearchParams();
  const category = params.get('kategori') ?? 'alla';
  const christmas = !bargains && category === 'julkollektionen';
  const halloween = !bargains && category === 'halloween';
  // Sökningen bor i URL:en, så att headerns sökruta och delade länkar slår
  // igenom även när butiken redan är öppen.
  const search = params.get('sok') ?? '';
  const [material, setMaterial] = useState('alla');
  const [sort, setSort] = useState<SortId>('popular');

  const config = useAsync(() => fetchConfig(), []);
  const { data, loading, error } = useAsync(() => fetchProducts({ category }), [category]);

  const visible = useMemo(() => {
    const term = search.toLowerCase().trim();
    const filtered = (data?.products ?? [])
      .filter(product => !bargains || productPrice(product).sale)
      .filter((product) => material === 'alla' || product.material === material)
      .filter((product) =>
        term
          ? [product.name, product.tagline, product.description]
              .join(' ')
              .toLowerCase()
              .includes(term)
          : true,
      );
    return [...filtered].sort(sorters[sort]);
  }, [data, search, material, sort, bargains]);

  function selectCategory(id: string) {
    const next = new URLSearchParams(params);
    if (id === 'alla') next.delete('kategori');
    else next.set('kategori', id);
    setParams(next, { replace: true });
  }

  function setSearch(term: string) {
    const next = new URLSearchParams(params);
    if (term) next.set('sok', term);
    else next.delete('sok');
    setParams(next, { replace: true });
  }

  const categories = config.data?.categories ?? [];
  const materials = config.data?.materials ?? [];
  const active = categories.find((entry) => entry.id === category);

  return (
    <>
      {christmas ? <section className="collection-banner" aria-label="Julkollektionen">
        <a href="#collection-products" aria-label="Upptäck julkollektionen – visa produkterna"><ResponsiveImage src="/images/campaign/julkollektionen-banner.webp" alt="En jul med personlig prägel – gröna och vinröda julkulor, benvita granar, stjärna och ett personligt namnornament" width="1357" height="762" /></a>
        <div className="collection-banner-mobile"><h1>En jul med personlig prägel</h1><p>3D-printat julpynt och personliga presenter.</p><a className="btn" href="#collection-products">Upptäck julkollektionen</a></div>
        <h1 className="sr-only collection-banner-desktop-title">Julkollektionen</h1>
      </section> : halloween ? <section className="container halloween-collection-banner" aria-label="Halloweenkollektionen">
        <div className="halloween-collection-copy">
          <span className="eyebrow">Halloween hos Formlabb</span>
          <h1>Lite kusligare.<br />Mycket mer du.</h1>
          <p>3D-printade detaljer för höstens mysigaste och kusligaste stunder.</p>
          <a className="btn" href="#collection-products">Upptäck Halloween <span aria-hidden="true">→</span></a>
        </div>
        <ResponsiveImage src="/images/campaign/halloween-collection.webp" alt="Orange pumpa, benvitt spöke och mörka fladdermöss i ett varmt Halloween-stilleben" width="1536" height="1024" />
      </section> : <PageHeader
        eyebrow="Butik"
        title={bargains ? 'Fyndhörnan' : active ? active.name : 'Alla produkter'}
        text={
          bargains ? 'Utvalda produkter till lägre pris. Hitta en favorit bland våra aktuella fynd.' : active
            ? active.description
            : 'Allt vi designar och printar i egen verkstad, redo att skickas.'
        }
        crumbs={active ? [{ to: '/produkter', label: 'Produkter' }] : undefined}
      />}
      <section className={`section${christmas || halloween ? ' christmas-products' : ''}`} id="collection-products">
        <div className="container">
          <div className="toolbar">
            <select
              className="select"
              aria-label="Kategori"
              value={category}
              onChange={(event) => selectCategory(event.target.value)}
            >
              <option value="alla">Alla kategorier</option>
              {categories.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            <select
              className="select"
              aria-label="Material"
              value={material}
              onChange={(event) => setMaterial(event.target.value)}
            >
              <option value="alla">Alla material</option>
              {materials.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            <div className="toolbar-right">
              <input
                className="input"
                type="search"
                aria-label="Sök"
                placeholder="Sök produkt…"
                value={search}
                style={{ width: 210 }}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="select"
                aria-label="Sortering"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortId)}
              >
                {sortLabels.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    Sortera: {entry.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="notice notice-error">{error}</p>}

          {loading ? (
            <div className="product-grid">
              {Array.from({ length: 12 }, (_, index) => (
                <div className="skeleton" key={index} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="panel center">
              <h3>{bargains && !search && category === 'alla' && material === 'alla' ? 'Nya fynd är på väg' : 'Inga träffar'}</h3>
              <p className="muted">
                {bargains && !search && category === 'alla' && material === 'alla' ? 'Just nu har vi inga aktiva erbjudanden. Titta gärna in igen snart.' : `Vi hittade inga produkter som matchar dina val. Prova ett annat ord eller filter.`}
              </p>
            </div>
          ) : (
            <>
              <p className="dim" style={{ fontSize: '0.88rem' }}>
                Visar {visible.length} produkter
              </p>
              <div className="product-grid">
                {visible.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
