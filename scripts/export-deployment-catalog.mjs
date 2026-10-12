import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Export shop content, never accounts, orders or customer uploads.
const root = resolve(import.meta.dirname, '..');
const catalogue = JSON.parse(await readFile(join(root, 'server/data/catalog.json'), 'utf8'));
const images = join(root, 'client/public/images/catalog-seed');
await mkdir(images, { recursive: true });
const copied = new Map();
async function rewrite(value) {
  if (typeof value === 'string') {
    const match = /^\/api\/uploads\/([a-f0-9]{32})$/.exec(value);
    if (!match) return value;
    const id = match[1];
    const meta = JSON.parse(await readFile(join(root, `server/uploads/${id}.json`), 'utf8'));
    if (meta.kind !== 'image' || !/^\.(jpg|jpeg|png|webp|avif)$/.test(meta.extension)) throw new Error(`Not a public product image: ${id}`);
    if (!copied.has(id)) copied.set(id, copyFile(join(root, `server/uploads/${id}${meta.extension}`), join(images, `${id}${meta.extension}`)));
    await copied.get(id);
    return `/images/catalog-seed/${id}${meta.extension}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map(rewrite));
  if (value && typeof value === 'object') {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await rewrite(item)])));
  }
  return value;
}
const seed = await rewrite(catalogue);
await mkdir(join(root, 'server/seed'), { recursive: true });
await writeFile(join(root, 'server/seed/catalog.json'), JSON.stringify(seed, null, 2) + '\n');
console.log(`Exported ${seed.products.length} products and their public images.`);
