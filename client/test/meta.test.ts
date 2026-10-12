import { describe, expect, it } from 'vitest';
import { productJsonLd, withAggregateRating } from '../src/lib/meta';

const product = {
  id: 'p-001',
  slug: 'terra-vaxtkruka',
  name: 'Terra växtkruka',
  description: 'En fasetterad kruka med inbyggt vattenfat.',
  price: 349,
  material: 'petg',
  stock: 12,
};

describe('productJsonLd', () => {
  it('beskriver produkten enligt schema.org', () => {
    const data = productJsonLd(product);
    expect(data['@type']).toBe('Product');
    expect(data.name).toBe('Terra växtkruka');
    expect(data.sku).toBe('p-001');
    expect(data.material).toBe('PETG');
  });

  it('sätter pris och valuta i erbjudandet', () => {
    const offers = productJsonLd(product).offers as Record<string, unknown>;
    expect(offers.price).toBe(349);
    expect(offers.priceCurrency).toBe('SEK');
    expect(offers.availability).toBe('https://schema.org/InStock');
    expect(String(offers.url)).toContain('/produkter/terra-vaxtkruka');
  });

  it('säger att en slutsåld produkt är slutsåld', () => {
    const offers = productJsonLd({ ...product, stock: 0 }).offers as Record<string, unknown>;
    expect(offers.availability).toBe('https://schema.org/OutOfStock');
  });

  it('tar med bilden som absolut adress när det finns en', () => {
    const data = productJsonLd({ ...product, image: { url: '/api/uploads/abc' } });
    expect(String(data.image)).toBe(`${window.location.origin}/api/uploads/abc`);
  });

  it('utelämnar bilden när produkten ritas som illustration', () => {
    expect('image' in productJsonLd(product)).toBe(false);
  });
});

describe('withAggregateRating', () => {
  it('lägger till betyget när det finns riktiga omdömen', () => {
    const data = withAggregateRating(productJsonLd(product), { average: 4.3, count: 7 });
    const rating = data.aggregateRating as Record<string, unknown>;
    expect(rating.ratingValue).toBe(4.3);
    expect(rating.reviewCount).toBe(7);
    expect(rating.bestRating).toBe(5);
  });

  it('påstår inget om betyget när ingen lämnat omdöme', () => {
    // Katalogens eget betyg får inte gå ut som strukturerad data – det vore att
    // säga åt sökmotorerna att kunder satt ett omdöme som ingen satt.
    expect('aggregateRating' in withAggregateRating(productJsonLd(product), null)).toBe(false);
    expect(
      'aggregateRating' in withAggregateRating(productJsonLd(product), { average: 0, count: 0 }),
    ).toBe(false);
  });

  it('rör inte resten av uppgifterna', () => {
    const base = productJsonLd(product);
    const data = withAggregateRating(base, { average: 5, count: 1 });
    expect(data.name).toBe(base.name);
    expect(data.sku).toBe(base.sku);
  });
});
