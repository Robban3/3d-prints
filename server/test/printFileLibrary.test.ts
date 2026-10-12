import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import type { Server } from 'node:http';
import { claimUpload, filePathFor, generateUploadId, readMeta, sweepOrphans, writeMeta } from '../src/uploads.ts';

it('admin can upload/list/download own models, which stay private and survive orphan cleanup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'formlabb-library-'));
  const keys = ['UPLOAD_DIR', 'ADMIN_TOKEN', 'ADMIN_ACCOUNT_STORE', 'ORDER_STORE'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.UPLOAD_DIR = join(dir, 'uploads');
  process.env.ADMIN_TOKEN = 'library-test-key-0123456789';
  process.env.ADMIN_ACCOUNT_STORE = join(dir, 'account.json');
  process.env.ORDER_STORE = join(dir, 'orders.json');
  await writeFile(process.env.ORDER_STORE, '[]');
  let server: Server | undefined;
  try {
    const { admin } = await import('../src/adminRoutes.ts');
    const { uploads } = await import('../src/uploadRoutes.ts');
    const app = express(); app.use('/api', uploads); app.use('/api', admin);
    await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()); });
    const address = server!.address(); assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}/api`;
    const headers = { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` };
    assert.equal((await fetch(`${base}/admin/files`)).status, 401);
    assert.equal((await fetch(`${base}/admin/files`, { method: 'POST' })).status, 401);
    const body = new FormData(); body.append('file', new Blob(['solid model\nendsolid model']), 'egen-modell.stl');
    const uploaded = await fetch(`${base}/admin/files`, { method: 'POST', headers, body });
    assert.equal(uploaded.status, 201);
    const { id } = await uploaded.json() as { id: string };
    const meta = await readMeta(id); assert.ok(meta); assert.equal(meta.kind, 'library');
    assert.equal((await fetch(`${base}/uploads/${id}`)).status, 404);
    assert.equal((await fetch(`${base}/uploads/${id}`, { method: 'DELETE' })).status, 409);
    assert.equal((await fetch(`${base}/admin/files/${id}/download`)).status, 401);
    assert.equal(await claimUpload(id, 'C-test'), undefined);
    const customer = await writeMeta({ id: generateUploadId(), originalName: 'kund.stl', extension: '.stl', size: 4,
      createdAt: new Date().toISOString(), claimedBy: 'C2026-TEST' });
    await writeFile(filePathFor(customer), 'test');
    const files = await (await fetch(`${base}/admin/files`, { headers })).json() as { files: Array<{ id: string; source: string; orderId: string | null }> };
    assert.equal(files.files.find(file => file.id === id)?.source, 'own');
    assert.equal(files.files.find(file => file.id === customer.id)?.orderId, 'C2026-TEST');
    const downloaded = await fetch(`${base}/admin/files/${id}/download`, { headers });
    assert.equal(downloaded.status, 200); assert.equal(await downloaded.text(), 'solid model\nendsolid model');
    assert.match(downloaded.headers.get('content-disposition') ?? '', /attachment/);
    assert.equal(await sweepOrphans(1, Date.now() + 10000), 0);
    assert.ok(await readMeta(id));
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
