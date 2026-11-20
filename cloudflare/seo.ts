import type { Product } from '../client/src/types';
import { selectedProductImage } from '../client/src/lib/productImage';
import { productPrice } from '../client/src/lib/productPrice';
import { shippingFor } from '../server/src/shipping';
import {
  christmasCategory, christmasDescription, christmasImage, christmasIntro, christmasPath, christmasTitle,
} from '../client/src/lib/christmas';

const origin = 'https://formlabb.se';
const productPath = (slug: string) => '/produkter/' + encodeURIComponent(slug);
const absolute = (path: string) => new URL(path, origin).href;
const escapeMarkup = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

type FetchCatalog = (request: Request) => Promise<Response>;

const pages: Record<string, [string, string]> = {
  '/': ['Formlabb – 3D-printade produkter och egna printjobb', 'Formlabb printar egendesignade 3D-produkter för hem och kontor – och tar emot dina egna filer för print på beställning.'],
  '/produkter': ['Produkter | Formlabb', 'Upptäck Formlabbs 3D-printade produkter för hem och kontor.'],
  '/fyndhornan': ['Fyndhörnan | Formlabb', 'Upptäck aktuella erbjudanden hos Formlabb.'],
  '/egen-print': ['Beställ egen 3D-print | Formlabb', 'Ladda upp din modell och beställ ett eget printjobb hos Formlabb.'],
  '/litofan': ['Litofan | Formlabb', 'Skapa en personlig litofan från ditt foto.'],
  '/om-oss': ['Om oss | Formlabb', 'Läs om Formlabb, frakt, returer och vanliga frågor.'],
  '/material': ['Material | Formlabb', 'Läs om materialen för våra 3D-printade produkter.'],
  '/sa-funkar-det': ['Så funkar det | Formlabb', 'Så beställer du produkter och egna printjobb hos Formlabb.'],
  '/kontakt': ['Kontakt | Formlabb', 'Kontakta Formlabb för hjälp med produkter och printjobb.'],
  '/integritet': ['Integritet | Formlabb', 'Så hanterar Formlabb dina personuppgifter.'],
};

export function productOffer(product: Product) {
  const price = productPrice(product, product.sizes?.[0]?.priceDelta ?? 0).price;
  return {
    '@type': 'Offer',
    url: absolute(productPath(product.slug)),
    priceCurrency: 'SEK',
    price,
    availability: 'https://schema.org/' + (product.stock > 0 ? 'InStock' : 'OutOfStock'),
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'SE' },
      shippingRate: { '@type': 'MonetaryAmount', value: shippingFor(price), currency: 'SEK' },
    },
    // The published policy promises 30-day free returns for stock products.
    // Do not infer the terms for made-to-order or personalized products.
    ...(product.stock > 0 && !['namnornament', 'var-forsta-jul'].includes(product.slug) ? {
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        merchantReturnLink: absolute('/om-oss'),
        applicableCountry: 'SE',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
      },
    } : {}),
  };
}

export function merchantFeed(products: Product[]) {
  const items = products.filter(product => product.published !== false).flatMap(product => {
    const image = selectedProductImage(product)?.url;
    if (!image) return [];
    const offer = productOffer(product);
    const fields = {
      id: product.id, title: product.name, description: product.description || product.tagline,
      link: offer.url, image_link: absolute(image), condition: 'new',
      availability: product.stock > 0 ? 'in_stock' : 'out_of_stock',
      price: offer.price.toFixed(2) + ' SEK', brand: 'Formlabb',
      // Formlabb designs and manufactures these products; do not invent GTINs.
      identifier_exists: 'no',
    };
    return ['<item>' + Object.entries(fields).map(([key, value]) =>
      '<g:' + key + '>' + escapeMarkup(value) + '</g:' + key + '>').join('') +
      '<g:shipping><g:country>SE</g:country><g:price>' +
      offer.shippingDetails.shippingRate.value.toFixed(2) + ' SEK</g:price></g:shipping></item>'];
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' +
    '<title>Formlabb</title><link>' + origin + '</link><description>Formlabbs produkter</description>' +
    items.join('') + '</channel></rss>';
}

export async function storefrontSeo(
  request: Request, assets: Fetcher, fetchCatalog: FetchCatalog,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /verkstad\nSitemap: ' +
      absolute('/sitemap.xml') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  if (pathname === '/sitemap.xml' || pathname === '/merchant-feed.xml') {
    const catalog = await fetchCatalog(new Request(new URL('/api/products', url)));
    if (!catalog.ok) return new Response(null, { status: 503 });
    const { products } = await catalog.json<{ products: Product[] }>();
    if (pathname === '/merchant-feed.xml') {
      return new Response(merchantFeed(products), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    }
    const paths = [...Object.keys(pages), christmasPath,
      ...products.filter(product => product.published !== false).map(product => productPath(product.slug))];
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      [...new Set(paths)].map(path => '<url><loc>' + escapeMarkup(absolute(path)) + '</loc></url>').join('') +
      '</urlset>', { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }

  if (pathname.replace(/\/$/, '') === '/produkter' && url.searchParams.get('kategori') === christmasCategory) {
    url.pathname = christmasPath;
    url.searchParams.delete('kategori');
    return Response.redirect(url.href, 301);
  }

  if (pathname.replace(/\/$/, '') === '/produkter/spiral-vas') {
    url.pathname = '/produkter/vas-nexo';
    return Response.redirect(url.href, 301);
  }

  const html = await assets.fetch(request);
  if (!html.ok || !html.headers.get('Content-Type')?.includes('text/html') || request.method === 'HEAD') return html;
  if (pathname === christmasPath || pathname === christmasPath + '/') {
    return decorate(christmasTitle, christmasDescription, christmasPath, christmasImage)
      .on('#root', { element(element) {
        element.setInnerContent('<h1>Julkollektionen</h1><p>' + escapeMarkup(christmasIntro) + '</p>', { html: true });
      } }).transform(html);
  }

  const match = /^\/produkter\/([a-z0-9-]+)\/?$/i.exec(pathname);
  if (!match) {
    const path = pathname.replace(/\/$/, '') || '/';
    const page = pages[path];
    return page ? decorate(page[0], page[1], path).transform(html) : html;
  }
  const catalog = await fetchCatalog(new Request(new URL('/api/products/' + match[1], url)));
  if (catalog.status === 404) return new Response(html.body, { status: 404, headers: html.headers });
  if (!catalog.ok) return html;
  const { product } = await catalog.json<{ product: Product }>();
  const path = productPath(product.slug);
  const image = selectedProductImage(product)?.url;
  const description = product.description || product.tagline;
  const markup = image && {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: absolute(image),
    description,
    sku: product.articleNumber,
    brand: { '@type': 'Brand', name: 'Formlabb' },
    offers: productOffer(product),
  };
  return decorate(product.name + ' | Formlabb', description, path, image, markup || undefined).transform(html);
}

function decorate(
  title: string, description: string, path: string, image?: string, schema?: object,
) {
  const canonical = escapeMarkup(absolute(path));
  return new HTMLRewriter()
    .on('title', { element(element) { element.setInnerContent(title); } })
    .on('meta[name="description"]', { element(element) { element.setAttribute('content', description); } })
    .on('head', { element(element) {
      element.append(
        '<link rel="canonical" href="' + canonical + '">' +
        '<meta property="og:url" content="' + canonical + '">' +
        '<meta property="og:title" content="' + escapeMarkup(title) + '">' +
        '<meta property="og:description" content="' + escapeMarkup(description) + '">' +
        (image ? '<meta property="og:image" content="' + escapeMarkup(absolute(image)) + '">' : '') +
        (schema ? '<script type="application/ld+json">' + JSON.stringify(schema).replace(/</g, '\\u003c') + '</script>' : ''),
        { html: true },
      );
    } });
}
