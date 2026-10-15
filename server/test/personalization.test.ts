import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProduct, findProduct, resetCatalogCache } from '../src/catalog.ts';
import { parseOrderLines, ValidationError } from '../src/validation.ts';
import { payloadForOrder } from '../src/klarna.ts';
import { orderConfirmation } from '../src/mailer.ts';
import type { Order } from '../src/types.ts';

it('kräver och sparar ornamentets namn genom validering, betalning och ordermejl', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'formlabb-personalization-'));
  process.env.CATALOG_STORE = join(dir, 'catalog.json'); resetCatalogCache();
  try {
    const seed = (await findProduct('p-001'))!;
    const ornament = await createProduct({ ...seed, slug: 'namnornament', name: 'Personligt namnornament', price: 149, sizes: undefined });
    const base = { productId: ornament.id, quantity: 1, color: ornament.colors[0], unitPrice: 1 };
    for (const personalization of [undefined, '', '123', '<img src=x>', 'Emma\u0000', 'x'.repeat(25), {}]) {
      await assert.rejects(() => parseOrderLines([{ ...base, personalization }]), (error: unknown) => error instanceof ValidationError && Boolean(error.fields['lines.0.personalization']));
    }
    const lines = await parseOrderLines([{ ...base, personalization: '  A\u030Asa   Marie  ' }, { ...base, personalization: 'Hugo' }]);
    assert.equal(lines[0]!.personalization, 'Åsa Marie'); assert.equal(lines[1]!.personalization, 'Hugo');
    assert.equal(lines[0]!.unitPrice, 149);
    const payment = payloadForOrder({ lines, shipping: 0, total: 298 }, { purchaseCountry: 'SE', purchaseCurrency: 'SEK', locale: 'sv-SE' });
    assert.match(payment.order_lines[0]!.name, /Namn: Åsa Marie/);
    const order: Order = { id: 'TEST', type: 'shop', createdAt: '2026-10-15T10:00:00Z', status: 'mottagen', history: [], customer: { name: 'Test Kund', email: 'test@example.com', address: 'Gatan 1', postalCode: '12345', city: 'Göteborg' }, lines, subtotal: 298, shipping: 0, total: 298 };
    const mail = orderConfirmation(order); assert.match(mail.text, /Namn: Åsa Marie/); assert.match(mail.text, /Namn: Hugo/);
    const regular = await parseOrderLines([{ productId: seed.id, quantity: 1, personalization: 'Ignorera' }]);
    assert.equal(regular[0]!.personalization, undefined);
    const christmas = await createProduct({ ...seed, slug: 'var-forsta-jul', name: 'Vår första jul', price: 149, sizes: undefined });
    const [defaultLine] = await parseOrderLines([{ productId: christmas.id, quantity: 1 }]);
    assert.equal(defaultLine!.personalization, 'Vår första / jul');
    const [greeting] = await parseOrderLines([{ productId: christmas.id, quantity: 1, personalization: 'Emma & Hugo / Jul 2026' }]);
    assert.equal(greeting!.personalization, 'Emma & Hugo / Jul 2026');
    for (const personalization of ['', 'bara en rad', '<script> / jul', 'Emma / ', 'x'.repeat(25) + ' / jul']) {
      await assert.rejects(() => parseOrderLines([{ productId: christmas.id, quantity: 1, personalization }]), ValidationError);
    }
  } finally {
    delete process.env.CATALOG_STORE; resetCatalogCache();
    await rm(dir, { recursive: true, force: true });
  }
});
