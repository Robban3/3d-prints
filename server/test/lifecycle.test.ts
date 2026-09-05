import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canTransition, isOrderStatus, nextStatuses, shouldRestoreStock } from '../src/lifecycle.ts';
import { orderConfirmation, resetMailer, sendMail, statusUpdate } from '../src/mailer.ts';
import type { Order, OrderStatus } from '../src/types.ts';

const order: Order = {
  id: 'S2026-ABC123',
  type: 'shop',
  createdAt: '2026-09-05T10:00:00.000Z',
  status: 'mottagen',
  history: [{ status: 'mottagen', at: '2026-09-05T10:00:00.000Z' }],
  customer: {
    name: 'Anna Andersson',
    email: 'anna@example.com',
    address: 'Storgatan 1',
    postalCode: '11234',
    city: 'Stockholm',
  },
  lines: [
    { productId: 'p-001', name: 'Terra växtkruka', quantity: 2, unitPrice: 349, color: 'Grafit' },
  ],
  subtotal: 698,
  shipping: 0,
  total: 698,
};

describe('statusövergångar', () => {
  it('följer produktionens ordning', () => {
    assert.ok(canTransition('mottagen', 'i_produktion'));
    assert.ok(canTransition('i_produktion', 'skickad'));
    assert.ok(canTransition('skickad', 'levererad'));
  });

  it('tillåter inte hopp över steg', () => {
    assert.equal(canTransition('mottagen', 'skickad'), false);
    assert.equal(canTransition('mottagen', 'levererad'), false);
    assert.equal(canTransition('i_produktion', 'levererad'), false);
  });

  it('tillåter inte att gå bakåt', () => {
    assert.equal(canTransition('skickad', 'i_produktion'), false);
    assert.equal(canTransition('levererad', 'skickad'), false);
  });

  it('låser slutliga tillstånd', () => {
    assert.deepEqual(nextStatuses('levererad'), []);
    assert.deepEqual(nextStatuses('avbruten'), []);
  });

  it('kan avbryta fram tills ordern skickats', () => {
    assert.ok(canTransition('mottagen', 'avbruten'));
    assert.ok(canTransition('i_produktion', 'avbruten'));
    assert.equal(canTransition('skickad', 'avbruten'), false);
  });

  it('lämnar tillbaka lagret bara vid avbrott', () => {
    assert.ok(shouldRestoreStock('avbruten'));
    for (const status of ['i_produktion', 'skickad', 'levererad'] as OrderStatus[]) {
      assert.equal(shouldRestoreStock(status), false);
    }
  });

  it('känner igen giltiga statusvärden', () => {
    assert.ok(isOrderStatus('skickad'));
    assert.equal(isOrderStatus('påväg'), false);
    assert.equal(isOrderStatus(42), false);
  });
});

describe('brev', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'formlabb-mail-'));
    process.env.MAIL_OUTBOX = dir;
    delete process.env.SMTP_HOST;
    resetMailer();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.MAIL_OUTBOX;
    resetMailer();
  });

  it('bekräftelsen innehåller ordernummer, rader och summa', () => {
    const mail = orderConfirmation(order);
    assert.equal(mail.to, 'anna@example.com');
    assert.match(mail.subject, /S2026-ABC123/);
    assert.match(mail.text, /2 × Terra växtkruka/);
    assert.match(mail.text, /698/);
    assert.match(mail.text, /Storgatan 1/);
  });

  it('säger ifrån när ingen betalning har skett', () => {
    const mail = orderConfirmation({
      ...order,
      payment: { provider: 'klarna', status: 'avvaktar', test: true },
    });
    assert.match(mail.text, /ingen betalning har genomförts/);
  });

  it('skriver ut Klarnas referens för en riktig betalning', () => {
    const mail = orderConfirmation({
      ...order,
      payment: { provider: 'klarna', status: 'auktoriserad', reference: 'kl-123', test: false },
    });
    assert.match(mail.text, /referens kl-123/);
  });

  it('ger ett brev per statusbyte som kunden bryr sig om', () => {
    assert.match(statusUpdate({ ...order, status: 'skickad' })!.subject, /på väg/);
    assert.match(statusUpdate({ ...order, status: 'levererad' })!.subject, /levererad/);
    assert.match(statusUpdate({ ...order, status: 'i_produktion' })!.subject, /produktion/);
    // Mottagen täcks av bekräftelsen, och avbrott hanteras manuellt.
    assert.equal(statusUpdate({ ...order, status: 'mottagen' }), undefined);
    assert.equal(statusUpdate({ ...order, status: 'avbruten' }), undefined);
  });

  it('lägger brevet i utkorgen när SMTP saknas', async () => {
    const result = await sendMail(orderConfirmation(order));
    assert.equal(result.delivered, false);
    const files = await readdir(dir);
    assert.equal(files.length, 1);
    const content = await readFile(join(dir, files[0]!), 'utf8');
    assert.match(content, /To: anna@example.com/);
    assert.match(content, /S2026-ABC123/);
  });
});
