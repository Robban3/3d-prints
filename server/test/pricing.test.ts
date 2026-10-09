import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { calculateQuote, volumeDiscountRate } from '../src/pricing.ts';
import { materials, qualities } from '../src/data/materials.ts';
import type { CustomQuoteRequest, Material, QualityLevel } from '../src/types.ts';

const materialFor = (id: string): Material =>
  materials.find((material) => material.id === id) ?? materials[0]!;
const qualityFor = (id: string): QualityLevel =>
  qualities.find((quality) => quality.id === id) ?? qualities[1]!;

/** Slår upp material och kvalitet ur förfrågan, som quoteFor gör i drift. */
const priceOf = (request: CustomQuoteRequest) =>
  calculateQuote(request, materialFor(request.material), qualityFor(request.quality));

const base: CustomQuoteRequest = {
  material: 'pla',
  quality: 'standard',
  volumeCm3: 120,
  infill: 20,
  quantity: 1,
  rush: false,
  postProcessing: false,
};

describe('calculateQuote', () => {
  it('ger ett pris över minimibeloppet för ett normalt jobb', () => {
    const quote = priceOf(base);
    assert.ok(quote.total >= 149, `förväntade minst 149 kr, fick ${quote.total}`);
    assert.equal(quote.setupFee, 95);
    assert.ok(quote.estimatedPrintHours > 0);
  });

  it('tar aldrig mindre än minimibeloppet', () => {
    const quote = priceOf({ ...base, volumeCm3: 1, infill: 5 });
    assert.equal(quote.total, 149);
  });

  it('gör dyrare material dyrare', () => {
    const pla = priceOf(base).total;
    const resin = priceOf({ ...base, material: 'resin' }).total;
    assert.ok(resin > pla, `resin (${resin}) borde kosta mer än PLA (${pla})`);
  });

  it('gör finare lagerhöjd dyrare och långsammare', () => {
    const standard = priceOf(base);
    const ultrafin = priceOf({ ...base, quality: 'ultrafin' });
    assert.ok(ultrafin.total > standard.total);
    assert.ok(ultrafin.estimatedPrintHours > standard.estimatedPrintHours);
  });

  it('höjer priset med fyllnadsgraden', () => {
    const low = priceOf({ ...base, infill: 10 }).total;
    const high = priceOf({ ...base, infill: 100 }).total;
    assert.ok(high > low);
  });

  it('ger lägre styckpris vid större volymer', () => {
    const single = priceOf(base);
    const bulk = priceOf({ ...base, quantity: 50 });
    assert.ok(bulk.unitPrice < single.unitPrice);
    assert.ok(bulk.volumeDiscount > 0);
  });

  it('lägger på expresstillägg och kortar leveranstiden', () => {
    const normal = priceOf(base);
    const rush = priceOf({ ...base, rush: true });
    assert.ok(rush.total > normal.total);
    assert.ok(rush.estimatedDeliveryDays < normal.estimatedDeliveryDays);
    assert.ok(rush.rushSurcharge > 0);
  });

  it('debiterar efterbearbetning per enhet', () => {
    const without = priceOf({ ...base, quantity: 2 });
    const withPost = priceOf({
      ...base,
      quantity: 2,
      postProcessing: true,
    });
    assert.equal(withPost.postProcessingCost, 85);
    assert.ok(withPost.total - without.total >= 170);
  });

  it('kastar fel för okänt material när det slås upp', async () => {
    const { quoteFor } = await import('../src/pricing.ts');
    await assert.rejects(() => quoteFor({ ...base, material: 'trä' }), /Okänt material/);
  });
});

describe('volumeDiscountRate', () => {
  it('trappar upp rabatten med antalet', () => {
    assert.equal(volumeDiscountRate(1), 0);
    assert.equal(volumeDiscountRate(5), 0.04);
    assert.equal(volumeDiscountRate(10), 0.08);
    assert.equal(volumeDiscountRate(20), 0.12);
    assert.equal(volumeDiscountRate(50), 0.18);
    assert.equal(volumeDiscountRate(250), 0.25);
  });
});
