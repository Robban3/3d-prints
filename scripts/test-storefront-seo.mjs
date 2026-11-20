import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// Exercise the actual Workers HTMLRewriter, rather than a DOM mock.
const { outputFiles } = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import { storefrontSeo } from './cloudflare/seo.ts';
      const base = {
        id: 'vase-1', slug: 'vas', name: 'Vas <Signe> & skål',
        description: 'En vas & en skål', tagline: 'Vas', price: 200,
        stock: 5, colors: ['vit'], image: { url: '/images/vas.webp' },
      };
      const products = [base,
        { ...base, id: 'large', slug: 'stor', price: 699 },
        { ...base, id: 'sale', slug: 'rea', price: 800, saleReferencePrice: 800, discountPercent: 50 },
        { ...base, id: 'personal', slug: 'namnornament' },
        { ...base, id: 'empty', slug: 'slut', stock: 0 },
        { ...base, id: 'hidden', slug: 'dold', published: false },
        { ...base, id: 'no-image', slug: 'utan-bild', image: undefined },
      ];
      export default { fetch(request) {
        return storefrontSeo(request, { fetch: async () => new Response(
          '<html><head><title>Formlabb</title><meta name="description" content="Shop"></head><body><div id="root"></div></body></html>',
          { headers: { 'Content-Type': 'text/html' } }),
        }, async catalogRequest => {
          if (request.headers.get('x-catalog-down')) return new Response(null, { status: 503 });
          const path = new URL(catalogRequest.url).pathname;
          if (path === '/api/products') return Response.json({ products });
          const product = products.find(p => path === '/api/products/' + p.slug && p.published !== false);
          return product ? Response.json({ product }) : new Response(null, { status: 404 });
        });
      } };
    `,
  },
  bundle: true, write: false, format: 'esm', platform: 'browser',
});
const worker = new Miniflare({ workers: [{ config: {
  name: 'seo-test', compatibilityDate: '2026-10-12',
  manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: outputFiles[0].text } } },
} }] });
after(() => worker.dispose());
const get = (path, options) => worker.dispatchFetch('https://formlabb.se' + path, options);
const schema = async path => {
  const html = await (await get(path)).text();
  return JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
};

test('main pages have one canonical URL independent of tracking and trailing slash', async () => {
  for (const path of ['/', '/produkter', '/om-oss', '/kontakt', '/egen-print']) {
    const html = await (await get((path === '/' ? path : path + '/') + '?utm_source=google')).text();
    assert.ok(html.includes('<link rel="canonical" href="https://formlabb.se' + path + '">'));
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  }
});

test('legacy product URL redirects before returning duplicate HTML', async () => {
  const response = await get('/produkter/spiral-vas/?utm_source=google', { redirect: 'manual' });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://formlabb.se/produkter/vas-nexo?utm_source=google');
});

test('Christmas category redirects to its canonical landing page', async () => {
  const response = await get('/produkter/?kategori=julkollektionen', { redirect: 'manual' });
  assert.equal(response.status, 301);
  assert.equal(new URL(response.headers.get('location')).pathname, '/julkollektionen');
});

test('offers match checkout shipping, including discounts crossing the free-shipping threshold', async () => {
  for (const [slug, price, shipping] of [['vas', 200, 59], ['stor', 699, 0], ['rea', 400, 59]]) {
    const data = await schema('/produkter/' + slug);
    assert.equal(data.offers.price, price);
    assert.equal(data.offers.shippingDetails.shippingRate.value, shipping);
    assert.equal(data.offers.shippingDetails.shippingDestination.addressCountry, 'SE');
    assert.equal(data.offers.hasMerchantReturnPolicy.merchantReturnDays, 30);
    assert.equal(data.offers.hasMerchantReturnPolicy.returnFees, 'https://schema.org/FreeReturn');
    assert.equal(data.aggregateRating, undefined);
    assert.equal(data.review, undefined);
  }
});

test('personalized and unavailable products do not get unverified return promises', async () => {
  for (const slug of ['namnornament', 'slut']) {
    assert.equal((await schema('/produkter/' + slug)).offers.hasMerchantReturnPolicy, undefined);
  }
});

test('product canonical and JSON remain safe with markup characters', async () => {
  const response = await get('/produkter/vas/?utm_source=google');
  const html = await response.text();
  assert.ok(html.includes('href="https://formlabb.se/produkter/vas"'));
  assert.ok(html.includes('Vas &lt;Signe&gt; &amp; skål'));
  assert.equal((await schema('/produkter/vas')).name, 'Vas <Signe> & skål');
});

test('feed uses canonical links, escaped XML, matching prices and public images', async () => {
  const response = await get('/merchant-feed.xml');
  assert.match(response.headers.get('content-type'), /application\/xml/);
  const xml = await response.text();
  assert.ok(xml.includes('Vas &lt;Signe&gt; &amp; skål'));
  assert.ok(xml.includes('<g:link>https://formlabb.se/produkter/vas</g:link>'));
  assert.ok(xml.includes('<g:image_link>https://formlabb.se/images/vas.webp</g:image_link>'));
  assert.ok(xml.includes('<g:price>400.00 SEK</g:price>'));
  assert.ok(xml.includes('<g:availability>out_of_stock</g:availability>'));
  assert.ok(!xml.includes('<g:id>hidden</g:id>'));
  assert.ok(!xml.includes('<g:id>no-image</g:id>'));
});

test('unknown products are 404 and unavailable catalog feeds return 503', async () => {
  assert.equal((await get('/produkter/saknas')).status, 404);
  for (const path of ['/merchant-feed.xml', '/sitemap.xml']) {
    assert.equal((await get(path, { headers: { 'x-catalog-down': '1' } })).status, 503);
  }
});
