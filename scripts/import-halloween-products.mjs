import { readFile, writeFile, mkdir } from 'node:fs/promises';
const env = await readFile(new URL('../server/.env', import.meta.url), 'utf8');
const token = process.env.ADMIN_TOKEN || env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
if (!token) throw new Error('ADMIN_TOKEN saknas');
const base = 'http://localhost:4000/api';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
async function request(path, body, method = 'POST') {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); if (!response.ok) throw new Error(JSON.stringify(data)); return data;
}
const { products } = await request('/admin/products');
const { categories } = await request('/admin/categories');
await mkdir(new URL('../server/data/backups/', import.meta.url), { recursive: true });
await writeFile(new URL(`../server/data/backups/catalog-before-halloween-${Date.now()}.json`, import.meta.url), JSON.stringify({ products, categories }, null, 2));
if (!categories.some(c => c.id === 'halloween')) await request('/admin/categories', { id: 'halloween', name: 'Halloween', description: '3D-printade pumpor, spöken och skulpturala detaljer för en personlig höst.' });
const entries = JSON.parse(await readFile(new URL('./halloween-products.json', import.meta.url), 'utf8'));
for (const product of entries) {
  if (products.some(p => p.slug === product.slug)) { console.log(`${product.name}: finns redan`); continue; }
  const bytes = await readFile(new URL(`../client/public/images/halloween/${product.slug}.webp`, import.meta.url));
  const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/webp' }), `${product.slug}-visualisering.webp`);
  const uploaded = await fetch(base + '/uploads/images', { method: 'POST', body: form });
  const data = await uploaded.json(); if (!uploaded.ok) throw new Error(JSON.stringify(data));
  await request('/admin/products', { ...product, image: data.image });
  console.log(`${product.name}: ${product.price} kr, en storlek`);
}
