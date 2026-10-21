import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderConfirmation, orderConfirmationExample, newOrderNotifications, statusUpdate, customerMessage, passwordResetMail } from '../src/mailer.ts';
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
test('internal notifications go separately to both owners without exposing customer tracking access', () => {
  const messages = newOrderNotifications(order);
  assert.deepEqual(messages.map(mail => mail.to), ['nygren.cn@gmail.com', 'rvdv1122@gmail.com']);
  for (const mail of messages) {
    assert.match(mail.subject, /Ny order TEST-123/);
    assert.match(mail.text, /verkstad\?vy=ordrar/);
    assert.ok(!mail.text.includes('#access='));
    assert.ok(!mail.text.includes(order.customer.email));
  }
  assert.equal(orderConfirmation(order).to, order.customer.email);
  assert.match(newOrderNotifications({ ...order, payment:{provider:'klarna',status:'obetald',test:true} })[0]!.subject, /\[TEST\]/);
});

test('example is marked as an example and never links to a nonexistent order', () => {
  const mail = orderConfirmationExample('rvdv1122@gmail.com');
  assert.equal(mail.to, 'rvdv1122@gmail.com');
  assert.match(mail.subject, /EXEMPEL/);
  assert.match(mail.html!, /ingen beställning eller betalning har skapats/);
  assert.ok(!mail.html!.includes('/spara-order?'));
  assert.ok(!mail.text.includes('#access='));
});

test('all operational mails share the branded HTML layout and retain text fallbacks', () => {
  const mails=[...newOrderNotifications(order),...(['i_produktion','skickad','levererad','avbruten'] as const).map(status=>statusUpdate({...order,status})!),passwordResetMail('admin@example.invalid','https://formlabb.se/verkstad#aterstall=EXAMPLE'),customerMessage(order,{kind:'komplettering',message:'Skicka en ny modellfil.'}),customerMessage(order,{kind:'forsening',message:'Vi återkommer på fredag.'})];
  for(const mail of mails) {
    assert.match(mail.html!,/FORMLABB/);
    assert.match(mail.html!,/#183d2d/);
    assert.match(mail.html!,/support@formlabb.se/);
    assert.ok(mail.text.length>30);
  }
  assert.ok(!statusUpdate({...order,status:'skickad'})!.text.includes('PostNord'));
  assert.match(statusUpdate({...order,status:'avbruten'})!.text,/bekräftar inte någon återbetalning/);
});

test('customer messages escape content and require verified refunds without changing the order', () => {
  const original=JSON.stringify(order);
  const mail=customerMessage(order,{kind:'komplettering',message:'<script>bad</script>'});
  assert.ok(!mail.html!.includes('<script>'));
  assert.match(mail.html!,/&lt;script&gt;/);
  assert.throws(()=>customerMessage(order,{kind:'offert',message:'Pris',amount:100}));
  assert.throws(()=>customerMessage(order,{kind:'aterbetalning',message:'Retur',amount:100,reference:'r1'}));
  assert.throws(()=>customerMessage({...order,payment:{provider:'klarna',status:'obetald',test:true}},{kind:'aterbetalning',message:'Retur',amount:100,reference:'r1',confirmed:true}));
  assert.throws(()=>customerMessage(order,{kind:'aterbetalning',message:'Retur',amount:order.total+1,reference:'r1',confirmed:true}));
  const refund=customerMessage(order,{kind:'aterbetalning',message:'Överenskommen retur',amount:100,reference:'REF-123',confirmed:true});
  assert.match(refund.html!,/REF-123/);
  assert.match(refund.text,/100/);
  assert.equal(JSON.stringify(order),original);
});
