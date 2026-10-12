import { mkdir, writeFile } from 'node:fs/promises';
const base = 'http://localhost:4000';
const { products } = await (await fetch(base + '/api/products')).json();
const checks = [];
const images = new Map();
for (const p of products) {
  const sizes = p.sizes?.length ? p.sizes : [{ id: '', priceDelta: 0 }];
  for (const size of sizes) for (const color of p.colors) {
    const image = p.variantImages?.find(v => v.color === color && (v.size ?? '') === size.id)?.image
      ?? p.variantImages?.find(v => v.color === color && !v.size)?.image ?? p.image;
    const dimensions = size.dimensions ?? p.dimensions;
    checks.push({ slug: p.slug, name: p.name, color, size: size.id, price: p.price + size.priceDelta, dimensions, image });
    if (image) images.set(image.id, image);
  }
}
await mkdir(new URL('../tmp/catalog-image-audit/', import.meta.url), { recursive: true });
const failures = [];
await Promise.all([...images.values()].map(async image => {
  const r = await fetch(base + image.url); const bytes = new Uint8Array(await r.arrayBuffer());
  if (!r.ok || !bytes.length || !r.headers.get('content-type')?.startsWith('image/')) failures.push({ image, status: r.status, bytes: bytes.length });
  await writeFile(new URL(`../tmp/catalog-image-audit/${image.id}.webp`, import.meta.url), bytes);
}));
const report = { products: products.length, combinations: checks.length, images: images.size, failures, checks };
await writeFile(new URL('../tmp/catalog-image-audit.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ products: products.length, combinations: checks.length, images: images.size, failures }));
if (failures.length) process.exitCode = 1;
