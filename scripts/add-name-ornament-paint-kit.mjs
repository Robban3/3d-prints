import { readFile } from 'node:fs/promises';
const env = await readFile(new URL('../server/.env', import.meta.url), 'utf8');
const token = process.env.ADMIN_TOKEN || env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
const base = 'http://localhost:4000/api';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
async function request(path, body) {
  const r = await fetch(base + path, { method: body ? 'PATCH' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json(); if (!r.ok) throw new Error(JSON.stringify(data)); return data;
}
const { products } = await request('/admin/products');
const p = products.find(entry => entry.slug === 'julkula-med-namn');
const withoutYear = p.variantImages.find(v => v.size === 'utan-artal').image;
const withYear = p.variantImages.find(v => v.size === 'med-artal').image;
const sizes = [
  { id: 'utan-artal', name: 'Utan årtal · utan målarpaket', priceDelta: 0 },
  { id: 'med-artal', name: 'Med årtal (2026) · utan målarpaket', priceDelta: 0 },
  { id: 'utan-artal-med-malarpaket', name: 'Utan årtal · med målarpaket', priceDelta: 100 },
  { id: 'med-artal-med-malarpaket', name: 'Med årtal (2026) · med målarpaket', priceDelta: 100 },
].map(size => ({ ...size, dimensions: p.dimensions }));
await request(`/admin/products/${p.id}`, {
  price: 149, optionLabel: 'Årtal och målarpaket', sizes,
  description: 'En benvit julkula med ditt eget namn och luftig, ribbad form. Välj utan årtal för en tidlös dekoration eller med 2026 för att minnas just denna jul. Du kan också lägga till ett målarpaket med fem färger – grön, röd, guld, svart och silver – samt två penslar, en fin och en mellan, för 100 kr extra. Planerat färginnehåll är 10 ml per kulör. Kulan kostar 149 kr utan målarpaket och 249 kr med målarpaket, oavsett årtal. Namnet Elsa på bilden är ett exempel och önskat namn stäms av inför tillverkning. Upphängningsband ingår inte.',
  highlights: ['Personlig julkula med ett namn', 'Välj med eller utan årtal (2026)', 'Valfritt målarpaket: 5 färger och 2 penslar (+100 kr)'],
  variantImages: p.colors.flatMap(color => sizes.map(size => ({ color, size: size.id, image: size.id.startsWith('utan-artal') ? withoutYear : withYear }))),
});
console.log('Julkula med namn: fyra kombinationer, 149 kr utan målarpaket / 249 kr med.');
