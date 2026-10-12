import { readFile } from 'node:fs/promises';
const env = await readFile(new URL('../server/.env', import.meta.url), 'utf8');
const token = process.env.ADMIN_TOKEN || env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
const base = 'http://localhost:4000/api';
const { product } = await (await fetch(base + '/products/julkula-med-namn')).json();
const variantImages = [...product.variantImages];
for (const key of ['med-artal', 'utan-artal']) {
  const fileName = `julkula-med-namn-${key}-kit`;
  const bytes = await readFile(new URL(`../client/public/images/christmas/${fileName}.webp`, import.meta.url));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/webp' }), `${fileName}-visualisering.webp`);
  const r = await fetch(base + '/uploads/images', { method: 'POST', body: form });
  const data = await r.json(); if (!r.ok) throw new Error(JSON.stringify(data));
  for (const variant of variantImages) if (variant.size === `${key}-med-malarpaket`) variant.image = data.image;
}
const saved = await fetch(base + `/admin/products/${product.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ variantImages }) });
if (!saved.ok) throw new Error(await saved.text());
console.log('Båda årtalsvalen visar hela målarpaketet när tillvalet är valt.');
