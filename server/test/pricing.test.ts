import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { calculateQuote } from '../src/pricing.ts';
import { materials, qualities } from '../src/data/materials.ts';
import type { CustomQuoteRequest } from '../src/types.ts';
const base: CustomQuoteRequest = { material: 'pla', quality: 'standard', volumeCm3: 120, infill: 20, quantity: 1, rush: false, postProcessing: false };
const priceOf = (request: CustomQuoteRequest) => calculateQuote(request, materials.find(m => m.id === request.material) ?? materials[0]!, qualities.find(q => q.id === request.quality) ?? qualities[1]!);
describe('calculateQuote', () => {
  it('räknar 50 kr per timme och 95 kr per order med material inkluderat', () => {
    const quote = priceOf(base);
    assert.equal(quote.estimatedPrintHours, 3.6);
    assert.equal(quote.machineCost, 180);
    assert.equal(quote.unitPrice, 180);
    assert.equal(quote.setupFee, 95);
    assert.equal(quote.total, 275);
    assert.equal(quote.materialCost, 0);
  });
  it('debiterar startavgiften en gång för flera exemplar utan volymrabatt', () => {
    const quote = priceOf({ ...base, quantity: 50 });
    assert.equal(quote.total, 50 * 180 + 95);
    assert.equal(quote.estimatedPrintHours, 50 * 3.6);
    assert.equal(quote.unitPrice, 180);
    assert.equal(quote.volumeDiscount, 0);
  });
  it('har ingen minimiavgift utöver startavgiften', () => {
    assert.equal(priceOf({ ...base, volumeCm3: 1, infill: 5 }).total, 96);
  });
  it('använder samma timpris för alla material och ignorerar gamla pristillval', () => {
    const quote = priceOf({ ...base, material: 'resin', rush: true, postProcessing: true });
    assert.equal(quote.total, priceOf(base).total);
    assert.equal(quote.postProcessingCost, 0);
    assert.equal(quote.rushSurcharge, 0);
  });
  it('räknar längre printtid för finare kvalitet och högre fyllnadsgrad', () => {
    const standard = priceOf(base);
    const fine = priceOf({ ...base, quality: 'ultrafin' });
    const solid = priceOf({ ...base, infill: 100 });
    assert.ok(fine.estimatedPrintHours > standard.estimatedPrintHours);
    assert.ok(solid.estimatedPrintHours > standard.estimatedPrintHours);
    assert.equal(fine.total, Math.round(fine.machineCost + 95));
  });
  it('avvisar okänt material', async () => {
    const { quoteFor } = await import('../src/pricing.ts');
    await assert.rejects(() => quoteFor({ ...base, material: 'trä' }), /Okänt material/);
  });
});
