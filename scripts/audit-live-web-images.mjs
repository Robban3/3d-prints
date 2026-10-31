import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import sharp from 'sharp';
const root = new URL('../', import.meta.url);
const base = 'https://formlabb.se';
const manifest = JSON.parse(await readFile(new URL('client/src/lib/responsive-images.json', root), 'utf8'));
const seed = Object.fromEntries(Object.entries(manifest).flatMap(([path, value]) => {
  const id = path.match(/^\/images\/catalog-(?:seed|live)\/([a-f0-9]{32})\./)?.[1];
  return id ? [[id, value]] : [];
}));
const catalogFile = process.argv[2];
const catalog = catalogFile ? JSON.parse(await readFile(catalogFile, 'utf8'))
  : await (await fetch(base + '/api/products', { signal: AbortSignal.timeout(20000) })).json();
const targets = new Map();
const aliases = [], references = [];
function add(url, owner, width) {
  const target = targets.get(url) ?? { url, owners: [], width };
  if (!target.owners.includes(owner)) target.owners.push(owner);
  targets.set(url, target);
}
function responsive(value, owner) {
  for (const candidate of value.srcSet.split(', ')) {
    const [url, width] = candidate.split(' ');
    add(url, owner, Number.parseInt(width));
  }
}
for (const [path, value] of Object.entries(manifest)) responsive(value, path);
for (const product of catalog.products ?? []) {
  for (const image of [product.image, ...(product.variantImages ?? []).map(v => v.image)].filter(Boolean)) {
    references.push({ product: product.name, id: image.id, url: image.url });
    const upload = image.url.match(/^\/api\/uploads\/([a-f0-9]{32})$/);
    const resolved = manifest[image.url] ?? (upload ? seed[upload[1]] : undefined);
    if (resolved) {
      responsive(resolved, product.name);
      if (upload) aliases.push({ product: product.name, original: image.url, resolved: resolved.src });
    } else if (upload) {
      for (const width of [128, 320, 640, 960, 1536]) add(`${image.url}/image/${width}`, product.name);
    } else add(image.url, product.name);
  }
}
// Logos/masks intentionally keep their original transparency and are not in
// the responsive manifest. Check those public images too.
for (const file of await readdir(new URL('client/public/images/brand/', root))) {
  if (/\.(png|jpe?g|webp|avif|svg)$/i.test(file)) add('/images/brand/' + file, 'Brand');
}
const results = [];
const queue = [...targets.values()];
let next = 0;
async function check(target) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const start = performance.now();
    try {
      const url = new URL(target.url, base);
      if (url.origin !== base) throw new Error('External image URL requires separate review');
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`HTTP ${response.status}: ${response.headers.get('content-type')}`);
      const info = await sharp(bytes).metadata();
      await sharp(bytes).resize(1, 1).raw().toBuffer(); // Force full pixel decode.
      if (target.width && info.width !== target.width) throw new Error(`Width ${info.width}, expected ${target.width}`);
      return { ...target, ok: true, bytes: bytes.length, width: info.width, height: info.height,
        alpha: info.hasAlpha, ms: Math.round(performance.now() - start) };
    } catch (error) { last = { ...target, ok: false, error: error.message }; }
  }
  return last;
}
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < queue.length) {
    const target = queue[next++];
    results.push(await check(target));
    if (results.length % 100 === 0) console.log(`Checked ${results.length}/${queue.length}`);
  }
}));
const failures = results.filter(r => !r.ok);
const report = { checkedAt: new Date().toISOString(), scope: catalogFile ? 'complete exported admin catalog' : 'published catalog',
  products: catalog.products?.length, catalogImageReferences: references.length, catalogImageIds: new Set(references.map(r => r.id)).size,
  staticImagePaths: Object.keys(manifest).length, testedImageFiles: results.length, failures,
  knownSeedAliases: aliases.length, totalBytes: results.reduce((n, r) => n + (r.bytes ?? 0), 0), results };
await mkdir(new URL('tmp/image-audit/', root), { recursive: true });
await writeFile(new URL('tmp/image-audit/live-report.json', root), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, results: undefined }));
if (failures.length) process.exitCode = 1;
