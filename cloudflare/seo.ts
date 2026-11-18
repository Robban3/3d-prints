import type { Product } from '../client/src/types';
import { selectedProductImage } from '../client/src/lib/productImage';
import { productPrice } from '../client/src/lib/productPrice';
import {
  christmasCategory, christmasDescription, christmasImage, christmasIntro, christmasPath, christmasTitle,
} from '../client/src/lib/christmas';

const origin = 'https://formlabb.se';
const productPath = (slug: string) => '/produkter/' + encodeURIComponent(slug);
const absolute = (path: string) => new URL(path, origin).href;
const escapeMarkup = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

type FetchCatalog = (request: Request) => Promise<Response>;

export async function storefrontSeo(
  request: Request, assets: Fetcher, fetchCatalog: FetchCatalog,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /verkstad\nSitemap: ' +
      absolute('/sitemap.xml') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  if (pathname === '/sitemap.xml') {
    const catalog = await fetchCatalog(new Request(new URL('/api/products', url)));
    if (!catalog.ok) return new Response(null, { status: 503 });
    const { products } = await catalog.json<{ products: Product[] }>();
    const paths = ['/', '/produkter', christmasPath, '/egen-print', '/litofan', '/om-oss',
      ...products.map(product => productPath(product.slug))];
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      [...new Set(paths)].map(path => '<url><loc>' + escapeMarkup(absolute(path)) + '</loc></url>').join('') +
      '</urlset>', { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }

  if (pathname === '/produkter' && url.searchParams.get('kategori') === christmasCategory) {
    url.pathname = christmasPath;
    url.searchParams.delete('kategori');
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
  if (!match || match[1] === 'spiral-vas') return html;
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
    offers: {
      '@type': 'Offer',
      url: absolute(path),
      priceCurrency: 'SEK',
      price: productPrice(product, product.sizes?.[0]?.priceDelta ?? 0).price,
      availability: 'https://schema.org/' + (product.stock > 0 ? 'InStock' : 'OutOfStock'),
    },
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
