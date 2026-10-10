import { Router } from 'express';
import { allProducts } from './catalog.ts';
import { shopUrl } from './http.ts';
import { robotsTxt, sitemapXml } from './seo.ts';

/**
 * Monteras i roten, inte under /api, eftersom sökmotorer läser filerna på
 * sina bestämda adresser.
 */
export const seo = Router();

seo.get('/sitemap.xml', async (_req, res) => {
  res.type('application/xml');
  // En timme i cachen räcker; katalogen ändras inte oftare än så.
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(sitemapXml(shopUrl(), await allProducts()));
});

seo.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(robotsTxt(shopUrl()));
});
