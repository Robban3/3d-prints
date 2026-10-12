/**
 * Sitemap och robots.txt, byggda ur katalogen.
 *
 * Utan de här filerna måste en sökmotor hitta varje produkt genom att klicka
 * sig fram, och eftersom butiken är en React-app med klientnavigering är det
 * inte självklart att den gör det. Sidor som bara rör en pågående beställning –
 * varukorgen, kassan, en enskild order och panelen – hör inte i något index.
 */

/** Sidor som alltid finns, med hur högt de väger inbördes. */
export const STATIC_PAGES: Array<{ path: string; priority: number; changefreq: string }> = [
  { path: '/', priority: 1, changefreq: 'weekly' },
  { path: '/produkter', priority: 0.9, changefreq: 'daily' },
  { path: '/egen-print', priority: 0.9, changefreq: 'monthly' },
  { path: '/material', priority: 0.7, changefreq: 'monthly' },
  { path: '/sa-funkar-det', priority: 0.6, changefreq: 'monthly' },
  { path: '/om-oss', priority: 0.5, changefreq: 'yearly' },
  { path: '/kontakt', priority: 0.5, changefreq: 'yearly' },
];

/** Sidor som aldrig ska indexeras. */
export const PRIVATE_PATHS = [
  '/api/',
  '/verkstad',
  '/kassa',
  '/varukorg',
  '/order/',
  '/spara-order',
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface SitemapProduct {
  slug: string;
  published?: boolean;
}

/**
 * Bygger sitemapen. Opublicerade produkter utesluts – de finns inte för någon
 * annan än panelen, och en länk till en 404 är sämre än ingen länk.
 */
export function sitemapXml(base: string, products: SitemapProduct[]): string {
  const root = base.replace(/\/+$/, '');
  const entries = [
    ...STATIC_PAGES.map((page) => ({
      loc: `${root}${page.path}`,
      priority: page.priority,
      changefreq: page.changefreq,
    })),
    ...products
      .filter((product) => product.published !== false)
      .map((product) => ({
        loc: `${root}/produkter/${product.slug}`,
        priority: 0.8,
        changefreq: 'weekly',
      })),
  ];

  const urls = entries
    .map((entry) =>
      [
        '  <url>',
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority.toFixed(1)}</priority>`,
        '  </url>',
      ].join('\n'),
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function robotsTxt(base: string): string {
  const root = base.replace(/\/+$/, '');
  return [
    'User-agent: *',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    'Allow: /',
    '',
    `Sitemap: ${root}/sitemap.xml`,
    '',
  ].join('\n');
}
