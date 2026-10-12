import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  DEFAULT_SHIPPING_ID,
  SHIPPING_OPTIONS,
  feeFor,
  findShippingOption,
  orderTotals,
  shippingFor,
  shippingOptionFor,
} from '../src/shipping.ts';

const ombud = SHIPPING_OPTIONS.find((option) => option.id === 'postombud')!;
const express = SHIPPING_OPTIONS.find((option) => option.id === 'express')!;

describe('fraktalternativ', () => {
  it('har ett standardalternativ som finns i listan', () => {
    assert.ok(SHIPPING_OPTIONS.some((option) => option.id === DEFAULT_SHIPPING_ID));
    assert.equal(shippingOptionFor(undefined).id, DEFAULT_SHIPPING_ID);
  });

  it('faller tillbaka på standarden för ett okänt val', () => {
    assert.equal(shippingOptionFor('helikopter').id, DEFAULT_SHIPPING_ID);
    assert.equal(shippingOptionFor(42).id, DEFAULT_SHIPPING_ID);
    assert.equal(findShippingOption('helikopter'), undefined);
  });

  it('väljer det alternativ kunden bett om', () => {
    assert.equal(shippingOptionFor('express').id, 'express');
  });

  it('ger fri frakt över gränsen', () => {
    assert.equal(feeFor(ombud, ombud.freeOver! - 1), ombud.fee);
    assert.equal(feeFor(ombud, ombud.freeOver!), 0);
  });

  it('ger aldrig fri frakt på express', () => {
    assert.equal(feeFor(express, 100000), express.fee);
  });

  it('behåller den tidigare fasta avgiften för standardalternativet', () => {
    assert.equal(shippingFor(100), 59);
    assert.equal(shippingFor(599), 0);
  });
});

describe('orderTotals', () => {
  it('summerar varor och frakt', () => {
    assert.deepEqual(orderTotals({ subtotal: 400, shippingOption: ombud }), {
      subtotal: 400,
      discount: 0,
      shipping: 59,
      total: 459,
    });
  });

  it('drar av rabatten på varorna', () => {
    const totals = orderTotals({
      subtotal: 400,
      shippingOption: ombud,
      discount: { amount: 100, freeShipping: false },
    });
    assert.equal(totals.discount, 100);
    assert.equal(totals.total, 359);
  });

  it('mäter fraktgränsen mot summan före rabatt', () => {
    // Kunden har handlat för 600 och kvalificerat sig för fri frakt. En
    // rabattkod ska inte ta tillbaka den.
    const totals = orderTotals({
      subtotal: 600,
      shippingOption: ombud,
      discount: { amount: 200, freeShipping: false },
    });
    assert.equal(totals.shipping, 0);
    assert.equal(totals.total, 400);
  });

  it('nollar frakten för en kod som ger fri frakt', () => {
    const totals = orderTotals({
      subtotal: 200,
      shippingOption: express,
      discount: { amount: 0, freeShipping: true },
    });
    assert.equal(totals.shipping, 0);
    assert.equal(totals.total, 200);
  });

  it('låter inte rabatten bli större än varorna', () => {
    const totals = orderTotals({
      subtotal: 100,
      shippingOption: ombud,
      discount: { amount: 500, freeShipping: false },
    });
    assert.equal(totals.discount, 100);
    // Frakten ska fortfarande betalas.
    assert.equal(totals.total, 59);
  });

  it('ger aldrig en negativ total', () => {
    const totals = orderTotals({
      subtotal: 700,
      shippingOption: ombud,
      discount: { amount: 10000, freeShipping: true },
    });
    assert.equal(totals.total, 0);
  });

  it('räknar i hela kronor', () => {
    const totals = orderTotals({
      subtotal: 349.6,
      shippingOption: ombud,
      discount: { amount: 34.96, freeShipping: false },
    });
    assert.equal(Number.isInteger(totals.subtotal), true);
    assert.equal(Number.isInteger(totals.discount), true);
    assert.equal(Number.isInteger(totals.total), true);
  });
});
