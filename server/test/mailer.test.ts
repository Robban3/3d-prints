import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderConfirmation, orderConfirmationExample } from '../src/mailer.ts';
import type { Order } from '../src/types.ts';

const order: Order = { id: 'TEST-123', type: 'shop', createdAt: '2026-10-17T10:00:00Z', status: 'mottagen', customer: { name: '<Kund>', email: 'example@example.com', address: 'Gatan 1', postalCode: '12345', city: 'Göteborg' }, lines: [{ productId: '1', name: '<script>alert(1)</script>', quantity: 2, unitPrice: 89, color: 'Guld' }], subtotal: 178, shipping: 59, total: 237, history: [] };
test('order mail escapes customer data and includes totals, reply address and private tracking', () => {
  const mail = orderConfirmation(order);
  assert.equal(mail.replyTo, 'Formlabb.se <support@formlabb.se>');
  assert.ok(mail.html?.includes('&lt;script&gt;'));
  assert.ok(!mail.html?.includes('<script>'));
  assert.match(mail.html!, /237/);
  assert.match(mail.html!, /spara-order\?id=TEST-123#access=/);
  assert.match(mail.text, /Frakt:/);
  const numbered = orderConfirmation({ ...order, lines: order.lines.map(line => ({ ...line, articleNumber:'FL-P-0001-001' })) });
  assert.match(numbered.html!, /FL-P-0001-001/);
  assert.match(numbered.text, /FL-P-0001-001/);
  assert.ok(!mail.text.includes('du får en separat betalningslänk'));
});
test('example is marked as an example and never links to a nonexistent order', () => {
  const mail = orderConfirmationExample('rvdv1122@gmail.com');
  assert.equal(mail.to, 'rvdv1122@gmail.com');
  assert.match(mail.subject, /EXEMPEL/);
  assert.match(mail.html!, /ingen beställning eller betalning har skapats/);
  assert.ok(!mail.html!.includes('/spara-order?'));
  assert.ok(!mail.text.includes('#access='));
});
