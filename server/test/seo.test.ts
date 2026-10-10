import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { PRIVATE_PATHS, STATIC_PAGES, robotsTxt, sitemapXml } from '../src/seo.ts';

const products = [
  { slug: 'terra-vaxtkruka' },
  { slug: 'luna-manlampa' },
  { slug: 'hemligt-utkast', published: false },
];

describe('sitemapXml', () => {
  it('börjar med en giltig XML-deklaration och ett urlset', () => {
    const xml = sitemapXml('https://formlabb.se', products);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset /);
    assert.match(xml, /<\/urlset>\n$/);
  });

  it('tar med varje statisk sida och varje publicerad produkt', () => {
    const xml = sitemapXml('https://formlabb.se', products);
    const count = xml.match(/<url>/g)?.length ?? 0;
    assert.equal(count, STATIC_PAGES.length + 2);
    assert.ok(xml.includes('<loc>https://formlabb.se/produkter/terra-vaxtkruka</loc>'));
    assert.ok(xml.includes('<loc>https://formlabb.se/produkter/luna-manlampa</loc>'));
  });

  it('utesluter opublicerade produkter', () => {
    const xml = sitemapXml('https://formlabb.se', products);
    assert.equal(xml.includes('hemligt-utkast'), false);
  });

  it('tar inte med varukorg, kassa eller panelen', () => {
    const xml = sitemapXml('https://formlabb.se', products);
    for (const path of ['/varukorg', '/kassa', '/verkstad', '/spara-order']) {
      assert.equal(xml.includes(`<loc>https://formlabb.se${path}</loc>`), false, path);
    }
  });

  it('tål ett avslutande snedstreck i adressen', () => {
    const xml = sitemapXml('https://formlabb.se///', products);
    assert.ok(xml.includes('<loc>https://formlabb.se/</loc>'));
    assert.equal(xml.includes('formlabb.se//produkter'), false);
  });

  it('kodar tecken som skulle bryta XML:en', () => {
    const xml = sitemapXml('https://formlabb.se', [{ slug: 'ko&ko' }]);
    assert.ok(xml.includes('ko&amp;ko'));
    assert.equal(xml.includes('ko&ko'), false);
  });

  it('skriver prioritet med en decimal, som formatet kräver', () => {
    const xml = sitemapXml('https://formlabb.se', products);
    assert.ok(xml.includes('<priority>1.0</priority>'));
    assert.ok(xml.includes('<priority>0.8</priority>'));
    assert.equal(/<priority>\d+<\/priority>/.test(xml), false);
  });

  it('klarar en katalog utan produkter', () => {
    const xml = sitemapXml('https://formlabb.se', []);
    assert.equal(xml.match(/<url>/g)?.length, STATIC_PAGES.length);
  });
});

describe('robotsTxt', () => {
  it('pekar ut sitemapen', () => {
    assert.ok(
      robotsTxt('https://formlabb.se').includes('Sitemap: https://formlabb.se/sitemap.xml'),
    );
  });

  it('stänger ute sidor som inte hör i ett index', () => {
    const robots = robotsTxt('https://formlabb.se');
    for (const path of PRIVATE_PATHS) {
      assert.ok(robots.includes(`Disallow: ${path}`), path);
    }
    assert.ok(robots.includes('Disallow: /verkstad'));
    assert.ok(robots.includes('Disallow: /api/'));
  });

  it('släpper in resten', () => {
    assert.ok(robotsTxt('https://formlabb.se').includes('Allow: /'));
  });

  it('tål ett avslutande snedstreck i adressen', () => {
    assert.ok(
      robotsTxt('https://formlabb.se/').includes('Sitemap: https://formlabb.se/sitemap.xml'),
    );
  });
});
