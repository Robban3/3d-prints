import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import type { Server } from 'node:http';
import type { AnyOrder, CustomOrder } from '../src/types.ts';

it('isolates order access, personal data exports, image writes and 90-day file retention', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'formlabb-privacy-'));
  process.env.ORDER_STORE = join(directory, 'orders.json');
  process.env.UPLOAD_DIR = join(directory, 'uploads');
  process.env.ADMIN_ACCOUNT_STORE = join(directory, 'admin.json');
  process.env.ADMIN_TOKEN = 'privacy-test-only-key-0123456789';
  process.env.MAIL_OUTBOX = join(directory, 'outbox');
  process.env.CATALOG_STORE = join(directory, 'catalog.json');
  process.env.SMTP_HOST = '';
  process.env.KLARNA_USERNAME = '';
  process.env.KLARNA_PASSWORD = '';
  await mkdir(process.env.UPLOAD_DIR);
  const { api } = await import('../src/routes.ts');
  const { admin } = await import('../src/adminRoutes.ts');
  const { uploads } = await import('../src/uploadRoutes.ts');
  const { orderAccessToken, orderTrackingUrl } = await import('../src/orderAccess.ts');
  const { saveOrder, findOrder } = await import('../src/store.ts');
  const { writeMeta, readMeta, filePathFor } = await import('../src/uploads.ts');
  const { sweepCustomerFiles } = await import('../src/privacyRetention.ts');
  const order: CustomOrder = {
    id: 'C2026-ABCDEF', type: 'custom', createdAt: '2026-01-01T00:00:00Z', status: 'levererad',
    customer: { name: 'Test Person', email: 'customer@example.invalid', address: 'Testgatan 1', postalCode: '12345', city: 'Teststad' },
    request: { material: 'pla', quality: 'standard', volumeCm3: 120, infill: 20, quantity: 1, rush: false, postProcessing: false },
    projectName: 'Testmodell', description: 'Testbeskrivning', total: 275,
    quote: { materialCost: 0, machineCost: 180, setupFee: 95, postProcessingCost: 0, rushSurcharge: 0, volumeDiscount: 0, unitPrice: 180, total: 275, estimatedPrintHours: 3.6, estimatedDeliveryDays: 4 },
    history: [{ status: 'levererad', at: '2026-01-02T00:00:00Z' }],
    fileId: 'a'.repeat(32), fileName: 'kund.stl', fileUrl: '/api/uploads/' + 'a'.repeat(32), fileSize: 4,
  };
  await saveOrder(order);
  const second: AnyOrder = { ...order, id: 'C2026-FEDCBA', customer: { ...order.customer, email: 'other@example.invalid' }, fileId: undefined, fileName: undefined };
  await saveOrder(second);
  const meta = await writeMeta({ id: order.fileId!, originalName: 'kund.stl', extension: '.stl', size: 4, createdAt: order.createdAt, claimedBy: order.id });
  await writeFile(filePathFor(meta), 'test');
  const own = await writeMeta({ ...meta, id: 'b'.repeat(32), kind: 'library', claimedBy: null });
  await writeFile(filePathFor(own), 'test');
  const image = await writeMeta({ ...meta, id: 'c'.repeat(32), kind: 'image', extension: '.jpg', claimedBy: null });
  await writeFile(filePathFor(image), 'test');
  let server: Server | undefined;
  try {
    const app = express(); app.use(express.json()); app.use('/api', uploads); app.use('/api', admin); app.use('/api', api);
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const address = server!.address(); assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}/api`;
    const createdResponse = await fetch(`${base}/custom-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: { ...order.customer, email: 'new@example.invalid' }, request: order.request, projectName: 'Testprojekt', description: 'Beskrivning för testprojektet' }) });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.match(created.accessToken, /^[a-f0-9]{64}$/);
    assert.equal(created.accessToken, orderAccessToken(created.order));
    const get = (id: string, token?: string) => fetch(`${base}/orders/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal((await get(order.id)).status, 404);
    assert.equal((await get(order.id, '0'.repeat(64))).status, 404);
    assert.equal((await get(second.id, orderAccessToken(order))).status, 404);
    const authorized = await get(order.id, orderAccessToken(order));
    assert.equal(authorized.status, 200); assert.match(authorized.headers.get('cache-control')!, /no-store/);
    assert.equal((await authorized.json()).order.customer.email, order.customer.email);
    const tracking = new URL(orderTrackingUrl(order)); assert.equal(tracking.searchParams.has('access'), false); assert.match(tracking.hash, /^#access=[a-f0-9]{64}$/);
    assert.equal((await fetch(`${base}/uploads/images`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/admin/uploads/images`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/admin/uploads/images`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` } })).status, 400);
    assert.equal((await fetch(`${base}/uploads/${image.id}`, { method: 'DELETE' })).status, 409);
    assert.match((await fetch(`${base}/uploads/${meta.id}`)).headers.get('cache-control')!, /no-store/);
    const exportInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: order.customer.email }) };
    assert.equal((await fetch(`${base}/admin/privacy/export`, exportInit)).status, 401);
    const exported = await fetch(`${base}/admin/privacy/export`, { ...exportInit, headers: { ...exportInit.headers, Authorization: `Bearer ${process.env.ADMIN_TOKEN}` } });
    assert.equal(exported.status, 200);
    const data = await exported.json(); assert.equal(data.orders.length, 1); assert.equal(data.files.length, 1); assert.ok(!JSON.stringify(data).includes(orderAccessToken(order)));
    const cutoff = Date.parse('2026-01-02T00:00:00Z') + 90 * 86400000;
    assert.equal(await sweepCustomerFiles(cutoff - 1), 0);
    assert.equal(await sweepCustomerFiles(cutoff), 1);
    assert.equal(await readMeta(meta.id), undefined);
    assert.ok(await readMeta(own.id)); assert.ok(await readMeta(image.id));
    const retained = await findOrder(order.id); assert.ok(retained?.type === 'custom'); assert.equal(retained.fileId, undefined); assert.equal(retained.fileName, undefined); assert.equal(retained.total, 275);
    assert.equal((await fetch(`${base}/admin/privacy/minimize`, exportInit)).status, 401);
    assert.equal((await fetch(`${base}/admin/privacy/minimize`, { ...exportInit, headers: { ...exportInit.headers, Authorization: `Bearer ${process.env.ADMIN_TOKEN}` } })).status, 400);
    const minimized = await fetch(`${base}/admin/privacy/minimize`, { ...exportInit, headers: { ...exportInit.headers, Authorization: `Bearer ${process.env.ADMIN_TOKEN}` }, body: JSON.stringify({ email: second.customer.email, confirmed: true }) });
    assert.equal(minimized.status, 200); assert.equal((await minimized.json()).minimized, 1);
    const redacted = await findOrder(second.id); assert.ok(redacted?.type === 'custom'); assert.equal(redacted.description, ''); assert.equal(redacted.customer.address, second.customer.address); assert.equal(redacted.total, second.total);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
    for (const key of ['ORDER_STORE','UPLOAD_DIR','ADMIN_ACCOUNT_STORE','ADMIN_TOKEN','MAIL_OUTBOX','CATALOG_STORE','SMTP_HOST','KLARNA_USERNAME','KLARNA_PASSWORD']) delete process.env[key];
  }
});
