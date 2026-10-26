import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const root = new URL('../', import.meta.url);
const manifestPath = new URL('client/src/lib/responsive-images.json', root);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const known = new Set(Object.keys(manifest).flatMap(path => {
  const id = path.match(/^\/images\/catalog-(?:seed|live)\/([a-f0-9]{32})\./)?.[1];
  return id ? [id] : [];
}));
const audit = JSON.parse(await readFile(new URL('tmp/image-audit/live-report.json', root), 'utf8'));
const localMatches = {
  '51b5ff898474948d4b4f9b006fab12db': 'exports/skalbilder/admin/01-vinterby.webp',
  '2d51b42c1ec168d2acdea8740e230066': 'exports/skalbilder/admin/03-pepparkaksby.webp',
  '4a88130e6b376cfc74b025080284a69d': 'exports/skalbilder/admin/06-tomtens-slade.webp',
  '399ff821e1c39e58582e2021da57de4d': 'client/public/images/new-products/renlycka-servettring.webp',
  '537a1aeb0599299e64adf8275b40a3ae': 'client/public/images/new-products/vinterglod-ljuslandskap.webp',
  'bdd7a3906b38165b370a7a8cab051598': 'client/public/images/new-products/adventsro-ledljushallare.webp',
};
const images = new Map();
for (const failure of audit.failures) {
  const id = failure.url.match(/^\/api\/uploads\/([a-f0-9]{32})\//)?.[1];
  if (id && !known.has(id)) images.set(id, { url: '/api/uploads/' + id });
}
await mkdir(new URL('client/public/images/catalog-live/', root), { recursive: true });
const results = [];
for (const [id, image] of images) {
  let original;
  if (localMatches[id]) original = await readFile(new URL(localMatches[id], root));
  else {
    const response = await fetch('https://formlabb.se' + image.url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
    original = Buffer.from(await response.arrayBuffer());
  }
  const source = await sharp(original).rotate().resize({ width: 1536, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  const sourcePath = `/images/catalog-live/${id}.webp`;
  await writeFile(new URL('client/public' + sourcePath, root), source);
  const info = await sharp(source).metadata();
  const digest = createHash('sha256').update('webp-alpha-v2').update(source).digest('hex').slice(0, 20);
  const widths = [...new Set([128, 320, 640, 960, 1536].map(w => Math.min(w, info.width)))].sort((a,b) => a-b);
  const candidates = [];
  for (const width of widths) {
    const path = `/images/responsive/${digest}-${width}.webp`;
    await sharp(source).resize({ width }).webp({ quality: 78, effort: 4 }).toFile(new URL('client/public' + path, root).pathname.replace(/^\/(\w:)/, '$1'));
    candidates.push(`${path} ${width}w`);
  }
  manifest[sourcePath] = { src: candidates.at(-1).split(' ')[0], srcSet: candidates.join(', '), width: info.width, height: info.height };
  results.push({ id, originalBytes: original.length, webBytes: source.length });
  console.log(id, original.length, '->', source.length);
}
await writeFile(manifestPath, JSON.stringify(manifest));
await writeFile(new URL('tmp/image-audit/cached-public-photos.json', root), JSON.stringify(results, null, 2));
console.log(`Prepared ${results.length} public uploaded photos for static delivery.`);
