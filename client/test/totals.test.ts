import { describe, expect, it } from 'vitest';
import { cartTotals, feeFor, orderLines } from '../src/lib/totals';
import type { CartItem } from '../src/lib/cart';
import type { ShippingOption } from '../src/types';

/**
 * Siffrorna här är samma som i serverns shipping.test.ts. Glider de två
 * uträkningarna isär ska ett av testerna gå sönder – kunden får aldrig se ett
 * annat belopp än det ordern landar på.
 */

const ombud: ShippingOption = {
  id: 'postombud',
  name: 'Postombud',
  description: 'Hämtas hos ombud.',
  fee: 59,
  freeOver: 599,
  days: '2–4 arbetsdagar',
};

const express: ShippingOption = {
  id: 'express',
  name: 'Express',
  description: 'Går först.',
  fee: 179,
  days: '1–2 arbetsdagar',
};

describe('feeFor', () => {
  it('tar betalt under gränsen och inget över', () => {
    expect(feeFor(ombud, 598)).toBe(59);
    expect(feeFor(ombud, 599)).toBe(0);
  });

  it('tar alltid betalt när alternativet saknar gräns', () => {
    expect(feeFor(express, 100000)).toBe(179);
  });

  it('räknar noll när inget alternativ valts än', () => {
    expect(feeFor(undefined, 400)).toBe(0);
  });
});

describe('cartTotals', () => {
  it('summerar varor och frakt', () => {
    expect(cartTotals({ subtotal: 400, option: ombud })).toEqual({
      subtotal: 400,
      discount: 0,
      shipping: 59,
      total: 459,
    });
  });

  it('drar av rabatten på varorna', () => {
    const totals = cartTotals({
      subtotal: 400,
      option: ombud,
      discount: { code: 'HOST20', label: 'HOST20 · 20 %', amount: 100, freeShipping: false },
    });
    expect(totals.discount).toBe(100);
    expect(totals.total).toBe(359);
  });

  it('mäter fraktgränsen mot summan före rabatt', () => {
    const totals = cartTotals({
      subtotal: 600,
      option: ombud,
      discount: { code: 'H', label: 'H', amount: 200, freeShipping: false },
    });
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(400);
  });

  it('nollar frakten för en kod som ger fri frakt', () => {
    const totals = cartTotals({
      subtotal: 200,
      option: express,
      discount: { code: 'F', label: 'F', amount: 0, freeShipping: true },
    });
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(200);
  });

  it('låter inte rabatten bli större än varorna', () => {
    const totals = cartTotals({
      subtotal: 100,
      option: ombud,
      discount: { code: 'X', label: 'X', amount: 500, freeShipping: false },
    });
    expect(totals.discount).toBe(100);
    expect(totals.total).toBe(59);
  });

  it('ger aldrig en negativ total', () => {
    const totals = cartTotals({
      subtotal: 700,
      option: ombud,
      discount: { code: 'X', label: 'X', amount: 10000, freeShipping: true },
    });
    expect(totals.total).toBe(0);
  });

  it('räknar i hela kronor', () => {
    const totals = cartTotals({
      subtotal: 349.6,
      option: ombud,
      discount: { code: 'X', label: 'X', amount: 34.96, freeShipping: false },
    });
    expect(Number.isInteger(totals.subtotal)).toBe(true);
    expect(Number.isInteger(totals.discount)).toBe(true);
    expect(Number.isInteger(totals.total)).toBe(true);
  });

  it('klarar en varukorg utan fraktval', () => {
    expect(cartTotals({ subtotal: 400 }).total).toBe(400);
  });
});

describe('orderLines', () => {
  it('plockar ut bara det API:t behöver', () => {
    const items: CartItem[] = [
      {
        key: 'p-001|Grafit|mellan',
        productId: 'p-001',
        slug: 'terra-vaxtkruka',
        name: 'Terra växtkruka',
        unitPrice: 349,
        quantity: 2,
        color: 'Grafit',
        size: 'mellan',
        sizeName: 'Mellan',
        art: { shape: 'planter', tone: 'benvit' },
      },
    ];
    // Priset skickas aldrig med – servern hämtar det ur katalogen.
    expect(orderLines(items)).toEqual([
      { productId: 'p-001', quantity: 2, color: 'Grafit', size: 'mellan' },
    ]);
  });
});
