import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import type { Server } from 'node:http';
import { admin } from '../src/adminRoutes.ts';
import { findProduct, resetCatalogCache } from '../src/catalog.ts';
import { reserve, resetStockCache, setStock, stockFor } from '../src/stock.ts';

it('bildändringar behåller lager efter köp, medan en uttrycklig lagerändring uppdaterar saldot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'formlabb-image-patch-'));
  process.env.CATALOG_STORE = join(dir, 'catalog.json'); process.env.STOCK_STORE = join(dir, 'stock.json');
  process.env.ADMIN_ACCOUNT_STORE = join(dir, 'account.json'); process.env.AUDIT_STORE = join(dir, 'audit.json');
  process.env.ADMIN_TOKEN = 'image-patch-test-token-0123456789'; resetCatalogCache(); resetStockCache();
  let server: Server | undefined;
  try {
    const before = await findProduct('p-001'); assert.ok(before);
    await setStock(before.id, 9); await reserve([{ productId: before.id, quantity: 2, name: before.name, unitPrice: before.price, color: before.colors[0]! }]);
    const app = express(); app.use(express.json()); app.use('/api', admin);
    await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()); });
    const address = server!.address(); assert.ok(address && typeof address === 'object');
    const url = `http://127.0.0.1:${address.port}/api/admin/products/${before.id}`;
    const headers = { Authorization: `Bearer ${process.env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' };
    const result = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ image: { id: 'a'.repeat(32), fileName: 'terra-visualisering.webp' } }) });
    assert.equal(result.status, 200); assert.equal(await stockFor(before.id), 7);
    const after = await findProduct(before.id); assert.equal(after?.price, before.price); assert.equal(after?.name, before.name); assert.equal(after?.image?.fileName, 'terra-visualisering.webp');
    assert.equal((await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ stock: 11 }) })).status, 200);
    assert.equal(await stockFor(before.id), 11);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    // Exact mkdtemp directory owned by this test.
    await rm(dir, { recursive: true, force: true });
    for (const key of ['CATALOG_STORE', 'STOCK_STORE', 'ADMIN_ACCOUNT_STORE', 'AUDIT_STORE', 'ADMIN_TOKEN']) delete process.env[key];
    resetCatalogCache(); resetStockCache();
  }
});
