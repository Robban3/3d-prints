import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE, shippingFor } from '../src/shipping.ts';

it('ger fri frakt från 699 kr och fraktavgift under gränsen', () => {
  assert.equal(FREE_SHIPPING_THRESHOLD, 699);
  assert.equal(shippingFor(698.99), SHIPPING_FEE);
  assert.equal(shippingFor(699), 0);
  assert.equal(shippingFor(700), 0);
});
