import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import {
  createSession,
  isConfigured,
  klarnaConfig,
  payloadForCustomOrder,
  payloadForOrder,
  placeOrder,
  taxOf,
  toMinorUnits,
} from '../src/klarna.ts';
import { calculateQuote } from '../src/pricing.ts';
import type { OrderLine } from '../src/types.ts';

const config = { purchaseCountry: 'SE', purchaseCurrency: 'SEK', locale: 'sv-SE' };

const lines: OrderLine[] = [
  { productId: 'p-001', name: 'Terra växtkruka', quantity: 2, unitPrice: 349, color: 'Grafit' },
  { productId: 'p-005', name: 'Luna månlampa', quantity: 1, unitPrice: 599, color: 'Naturvit' },
];

afterEach(() => {
  delete process.env.KLARNA_USERNAME;
  delete process.env.KLARNA_PASSWORD;
});

describe('belopp', () => {
  it('räknar om kronor till ören', () => {
    assert.equal(toMinorUnits(349), 34900);
    assert.equal(toMinorUnits(0), 0);
    assert.equal(toMinorUnits(1.5), 150);
  });

  it('räknar momsen enligt Klarnas formel för bruttopris', () => {
    // 125 kr inkl. 25 % moms innehåller 25 kr moms.
    assert.equal(taxOf(12500), 2500);
    assert.equal(taxOf(0), 0);
    // Formeln ska ge ett heltal även när summan inte går jämnt ut.
    const tax = taxOf(34900);
    assert.equal(tax, 6980);
    assert.ok(Number.isInteger(tax));
  });
});

describe('payloadForOrder', () => {
  it('bygger rader i ören med moms per rad', () => {
    const payload = payloadForOrder({ lines, shipping: 0, total: 1297 }, config);
    assert.equal(payload.order_lines.length, 2);
    const [first] = payload.order_lines;
    assert.equal(first!.unit_price, 34900);
    assert.equal(first!.quantity, 2);
    assert.equal(first!.total_amount, 69800);
    assert.equal(first!.tax_rate, 2500);
    assert.equal(first!.total_tax_amount, taxOf(69800));
    assert.equal(first!.type, 'physical');
  });

  it('summerar ordern till samma belopp som raderna', () => {
    const payload = payloadForOrder({ lines, shipping: 0, total: 1297 }, config);
    const sum = payload.order_lines.reduce((total, line) => total + line.total_amount, 0);
    assert.equal(payload.order_amount, sum);
    assert.equal(payload.order_amount, toMinorUnits(349 * 2 + 599));
    const taxSum = payload.order_lines.reduce((total, line) => total + line.total_tax_amount, 0);
    assert.equal(payload.order_tax_amount, taxSum);
  });

  it('lägger frakten som en egen rad när den kostar något', () => {
    const withShipping = payloadForOrder({ lines, shipping: 59, total: 1356 }, config);
    const shipping = withShipping.order_lines.at(-1);
    assert.equal(shipping?.type, 'shipping_fee');
    assert.equal(shipping?.total_amount, 5900);
    assert.equal(withShipping.order_amount, toMinorUnits(349 * 2 + 599 + 59));
  });

  it('utelämnar fraktraden vid fri frakt', () => {
    const free = payloadForOrder({ lines, shipping: 0, total: 1297 }, config);
    assert.ok(free.order_lines.every((line) => line.type !== 'shipping_fee'));
  });

  it('skriver ut variant i radnamnet så kunden känner igen sig', () => {
    const payload = payloadForOrder(
      {
        lines: [{ ...lines[0]!, size: 'stor' }],
        shipping: 0,
        total: 698,
      },
      config,
    );
    assert.equal(payload.order_lines[0]!.name, 'Terra växtkruka (Grafit · stor)');
  });

  it('tar med ordernumret som referens när det finns', () => {
    const payload = payloadForOrder({ lines, shipping: 0, total: 1297, id: 'S2026-ABC123' }, config);
    assert.equal(payload.merchant_reference1, 'S2026-ABC123');
  });
});

describe('payloadForCustomOrder', () => {
  const request = {
    material: 'petg' as const,
    quality: 'fin' as const,
    volumeCm3: 120,
    infill: 25,
    quantity: 10,
    rush: false,
    postProcessing: true,
  };

  it('skickar hela jobbet som en rad med samma summa som offerten', () => {
    const quote = calculateQuote(request);
    const payload = payloadForCustomOrder({ projectName: 'Kamerafäste', request, quote }, config);
    assert.equal(payload.order_lines.length, 1);
    assert.equal(payload.order_amount, toMinorUnits(quote.total));
    assert.equal(payload.order_lines[0]!.total_amount, toMinorUnits(quote.total));
    assert.equal(payload.order_tax_amount, taxOf(toMinorUnits(quote.total)));
  });

  it('beskriver jobbet i radnamnet', () => {
    const quote = calculateQuote(request);
    const payload = payloadForCustomOrder({ projectName: 'Kamerafäste', request, quote }, config);
    assert.equal(payload.order_lines[0]!.name, 'Kamerafäste (10 st, PETG)');
  });
});

describe('konfiguration', () => {
  it('räknas som okonfigurerad utan nycklar', () => {
    assert.equal(isConfigured(), false);
    assert.equal(klarnaConfig(), undefined);
  });

  it('använder playground som standard och produktion när det begärs', () => {
    process.env.KLARNA_USERNAME = 'test';
    process.env.KLARNA_PASSWORD = 'hemlis';
    assert.equal(klarnaConfig()?.apiBase, 'https://api.playground.klarna.com');
    process.env.KLARNA_ENV = 'production';
    assert.equal(klarnaConfig()?.apiBase, 'https://api.klarna.com');
    delete process.env.KLARNA_ENV;
  });
});

describe('testläge utan nycklar', () => {
  it('ger en session som är märkt som test', async () => {
    const session = await createSession(payloadForOrder({ lines, shipping: 0, total: 1297 }, config));
    assert.equal(session.mock, true);
    assert.ok(session.clientToken.length > 0);
  });

  it('lägger en order som är märkt som test', async () => {
    const placed = await placeOrder(
      'token-som-inte-anvands',
      payloadForOrder({ lines, shipping: 0, total: 1297 }, config),
    );
    assert.equal(placed.mock, true);
    assert.equal(placed.fraudStatus, 'ACCEPTED');
  });
});
