import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { imageVariant } from '../src/imageVariants.ts';
import express from 'express';
import { uploads } from '../src/uploadRoutes.ts';
import { writeMeta } from '../src/uploads.ts';

it('creates small WebP copies, preserves alpha and keeps the original unchanged', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'web-images-'));
  process.env.UPLOAD_DIR = dir;
  try {
    const id = '0123456789abcdef0123456789abcdef';
    const original = await sharp({ create: { width: 1200, height: 800, channels: 4, background: '#ff000080' } }).png().toBuffer();
    await writeFile(join(dir, id + '.png'), original);
    const meta = { id, kind: 'image' as const, originalName: 'foto.png', extension: '.png', size: original.length, createdAt: new Date().toISOString(), claimedBy: null };
    const result = await imageVariant(meta, 320);
    const info = await sharp(result).metadata();
    assert.equal(info.width, 320); assert.equal(info.height, 213);
    assert.equal(info.format, 'webp'); assert.equal(info.hasAlpha, true);
    assert.deepEqual(await imageVariant(meta, 320), result);
    const { readFile } = await import('node:fs/promises');
    assert.deepEqual(await readFile(join(dir, id + '.png')), original);
  } finally { delete process.env.UPLOAD_DIR; await rm(dir, { recursive: true, force: true }); }
});

it('serves only public product images and rejects customer/library files and arbitrary widths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'web-image-route-'));
  process.env.UPLOAD_DIR = dir;
  const app = express(); app.use('/api', uploads);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/uploads/`;
  try {
    for (const [index, kind] of ['image', 'model', 'library'].entries()) {
      const id = String(index + 1).repeat(32);
      const bytes = await sharp({ create: { width: 400, height: 300, channels: 3, background: 'white' } }).png().toBuffer();
      await writeFile(join(dir, id + '.png'), bytes);
      await writeMeta({ id, kind: kind as 'image' | 'model' | 'library', extension: '.png', originalName: 'image.png', size: bytes.length, createdAt: new Date().toISOString(), claimedBy: null });
      const response = await fetch(base + id + '/image/320');
      assert.equal(response.status, kind === 'image' ? 200 : 404);
      if (kind === 'image') {
        assert.match(response.headers.get('cache-control') ?? '', /immutable/);
        assert.equal(response.headers.get('content-type'), 'image/webp');
      }
      await response.arrayBuffer();
    }
    assert.equal((await fetch(base + '1'.repeat(32) + '/image/99999')).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    delete process.env.UPLOAD_DIR;
    await rm(dir, { recursive: true, force: true });
  }
});
