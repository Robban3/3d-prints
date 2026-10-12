import { readFile, writeFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'));
const jobs = JSON.parse(await readFile(new URL('../tmp/variant-jobs.json', import.meta.url), 'utf8'));
const env = await readFile(new URL('../server/.env', import.meta.url), 'utf8');
const token = process.env.ADMIN_TOKEN || env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
const base = 'http://localhost:4000/api';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const catalog = await (await fetch(base + '/products')).json();
const patches = new Map();
for (const item of manifest) {
  const job = jobs.find(j => j.file === item.file);
  if (!job) throw new Error(`Saknar koppling: ${item.file}`);
  const product = catalog.products.find(p => p.slug === job.slug);
  const bytes = await readFile(new URL(`../client/public/images/variants/${item.file}-aligned.webp`, import.meta.url));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/webp' }), `${item.file}-aligned-visualisering.webp`);
  const uploaded = await fetch(base + '/uploads/images', { method: 'POST', body: form });
  const data = await uploaded.json(); if (!uploaded.ok) throw new Error(JSON.stringify(data));
  const variants = patches.get(product.id) ?? [...product.variantImages];
  const index = variants.findIndex(v => v.color === job.color && (v.size ?? '') === job.size);
  if (index < 0) throw new Error(`Saknar variant: ${item.file}`);
  variants[index] = { ...variants[index], image: data.image }; patches.set(product.id, variants);
}
for (const [id, variantImages] of patches) {
  const r = await fetch(base + `/admin/products/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ variantImages }) });
  if (!r.ok) throw new Error(await r.text());
}
await writeFile(new URL('../design-concepts/aligned-variant-prompts.json', import.meta.url), JSON.stringify(manifest, null, 2));
console.log(`${manifest.length} korrigerade bilder kopplade till ${patches.size} produkter.`);
