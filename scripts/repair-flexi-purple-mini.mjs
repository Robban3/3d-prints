import { readFile } from 'node:fs/promises';
const env = await readFile(new URL('../server/.env', import.meta.url), 'utf8');
const token = process.env.ADMIN_TOKEN || env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
const base = 'http://localhost:4000/api';
const response = await fetch(base + '/products/flexi-drake');
const { product } = await response.json();
const bytes = await readFile(new URL('../client/public/images/variants/flexi-drake-c1-s0.webp', import.meta.url));
if (!bytes.length) throw new Error('Originalbilden är tom');
const form = new FormData();
form.append('file', new Blob([bytes], { type: 'image/webp' }), 'flexi-drake-silk-lila-mini-visualisering.webp');
const upload = await fetch(base + '/uploads/images', { method: 'POST', body: form });
const data = await upload.json();
if (!upload.ok) throw new Error(JSON.stringify(data));
const variantImages = product.variantImages.map(v => v.color === 'Silk lila' && v.size === 'mini' ? { ...v, image: data.image } : v);
const saved = await fetch(base + `/admin/products/${product.id}`, {
  method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ variantImages }),
});
if (!saved.ok) throw new Error(await saved.text());
const check = await fetch(base.replace('/api', '') + data.image.url);
const downloaded = new Uint8Array(await check.arrayBuffer());
if (!check.ok || downloaded.length !== bytes.length || downloaded.some((byte, index) => byte !== bytes[index])) throw new Error('Bildkontrollen misslyckades');
console.log(`Silk lila / Mini: återställd och verifierad (${downloaded.length} byte).`);
