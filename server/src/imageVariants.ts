import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UploadMeta } from './uploads.ts';
import { uploadDir, filePathFor, storedFileName } from './uploads.ts';
import { storage } from './storage.ts';

export const IMAGE_WIDTHS = [128, 320, 640, 960, 1536] as const;
const pending = new Map<string, Promise<Buffer>>();
let running = 0;
const waiting: Array<() => void> = [];
async function acquire() {
  if (running >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else running++;
}
function release() {
  const next = waiting.shift();
  if (next) next(); else running--;
}
export async function imageVariant(meta: UploadMeta, width: number): Promise<Buffer> {
  const key = `web-images-v1/${meta.id}-${width}.webp`;
  const local = join(uploadDir(), key);
  const cached = await storage().get(key, local);
  if (cached) {
    const chunks: Buffer[] = [];
    for await (const chunk of cached.body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const task = (async () => {
    await acquire();
    try {
    const original = await storage().get(storedFileName(meta.id, meta.extension), filePathFor(meta));
    if (!original) throw new Error('Image original missing');
    const chunks: Buffer[] = [];
    for await (const chunk of original.body) chunks.push(Buffer.from(chunk));
    const result = await sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 })
      .rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
    await mkdir(join(uploadDir(), 'web-images-v1'), { recursive: true });
    await writeFile(local, result);
    await storage().put(key, local, 'image/webp');
    return result;
    } finally { release(); }
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
