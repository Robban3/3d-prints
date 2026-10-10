import { useEffect } from 'react';

/**
 * Sätter sidans titel, beskrivning och delningsbilder.
 *
 * Butiken är en React-app med klientnavigering, så utan det här ärver varje
 * undersida titeln i index.html – samma rubrik för hela butiken i både
 * sökresultat och delade länkar.
 *
 * Strukturerad data läggs i ett eget script-element som tas bort när sidan
 * byts, så att en produkts uppgifter inte ligger kvar på nästa sida.
 */

const SITE_NAME = 'Formlabb';
const JSON_LD_ID = 'sid-strukturerad-data';

export interface PageMeta {
  /** Titeln utan butiksnamnet – det läggs på här. */
  title: string;
  description: string;
  /** Absolut bildadress för delning. */
  image?: string;
  type?: 'website' | 'product';
  /** Strukturerad data enligt schema.org. */
  jsonLd?: unknown;
  /** Sidor som hör till en pågående beställning ska inte indexeras. */
  noindex?: boolean;
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attribute}="${key}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

export function useDocumentMeta(meta: PageMeta): void {
  const { title, description, image, type, noindex, jsonLd } = meta;
  // Objektet är nytt vid varje rendering, så beroendena är de enskilda fälten.
  const serializedJsonLd = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const fullTitle = title === SITE_NAME ? title : `${title} · ${SITE_NAME}`;
    document.title = fullTitle;

    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow');
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', type ?? 'website');
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:url', window.location.href);
    upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    if (image) upsertMeta('property', 'og:image', image);
    // Canonical utan frågesträng: filter och sökord ska inte ge egna sidor.
    upsertLink('canonical', `${window.location.origin}${window.location.pathname}`);
  }, [title, description, image, type, noindex]);

  useEffect(() => {
    if (!serializedJsonLd) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = JSON_LD_ID;
    script.textContent = serializedJsonLd;
    document.head.appendChild(script);
    return () => script.remove();
  }, [serializedJsonLd]);
}

/** Strukturerad data för en produkt. */
export function productJsonLd(product: {
  name: string;
  description: string;
  id: string;
  price: number;
  slug: string;
  material: string;
  stock: number;
  image?: { url: string };
}): Record<string, unknown> {
  const url = `${window.location.origin}/produkter/${product.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    sku: product.id,
    material: product.material.toUpperCase(),
    brand: { '@type': 'Brand', name: SITE_NAME },
    ...(product.image ? { image: `${window.location.origin}${product.image.url}` } : {}),
    offers: {
      '@type': 'Offer',
      url,
      price: product.price,
      priceCurrency: 'SEK',
      availability:
        product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
}

/**
 * Betyget läggs bara till när det finns riktiga, publicerade omdömen. Att
 * skicka med katalogens eget betyg vore att påstå inför sökmotorerna att kunder
 * satt ett omdöme som ingen satt.
 */
export function withAggregateRating(
  jsonLd: Record<string, unknown>,
  summary: { average: number; count: number } | null,
): Record<string, unknown> {
  if (!summary || summary.count === 0) return jsonLd;
  return {
    ...jsonLd,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: summary.average,
      reviewCount: summary.count,
      bestRating: 5,
      worstRating: 1,
    },
  };
}

/** Strukturerad data om butiken, för startsidan. */
export function shopJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: SITE_NAME,
    description:
      'Svensk 3D-printverkstad. Färdiga produkter i egen design och kundunika printjobb från din egen fil.',
    url: window.location.origin,
    areaServed: 'SE',
    currenciesAccepted: 'SEK',
  };
}
