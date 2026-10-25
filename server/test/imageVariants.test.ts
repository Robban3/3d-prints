import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { imageVariant } from '../src/imageVariants.ts';

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
