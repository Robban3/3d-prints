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
for (const [slug, price, contents, highlight] of [
  ['mala-din-jul', 249, 'fyra julkulor: en grön, en röd, en vit och en svart', '4 kulor: grön, röd, vit och svart'],
  ['julpyssel', 129, 'sex vita dekorationer: två granar, två hjärtan och två stjärnor', '6 dekorationer: 2 granar, 2 hjärtan och 2 stjärnor'],
]) {
  const p = products.find(entry => entry.slug === slug);
  if (!p) throw new Error(`Saknar ${slug}`);
  const withPaint = p.variantImages?.find(v => v.size === 'med-farg-penslar')?.image ?? p.image;
  let withoutPaint = p.variantImages?.find(v => v.size === 'utan-farg-penslar')?.image;
  if (!withoutPaint) {
    const bytes = await readFile(new URL(`../client/public/images/christmas/${slug}.webp`, import.meta.url));
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'image/webp' }), `${slug}-utan-farg-penslar-visualisering.webp`);
    const r = await fetch(base + '/uploads/images', { method: 'POST', body: form });
    const data = await r.json(); if (!r.ok) throw new Error(JSON.stringify(data)); withoutPaint = data.image;
  }
  await request(`/admin/products/${p.id}`, {
    price, optionLabel: 'Paket',
    tagline: 'Måla själv – välj med eller utan färg och penslar.',
    description: `Ett kreativt set med ${contents}. Välj enbart dekorationerna om du redan har eget målarmaterial, eller komplett paket med fem färger – grön, röd, guld, svart och silver – samt två penslar, en fin och en mellan. Komplett paket kostar 100 kr extra. Planerat färginnehåll är 10 ml per kulör. Färg och penslar ingår endast när du väljer det kompletta paketet. Upphängningsband ingår inte.`,
    highlights: [highlight, 'Välj med eller utan färg och penslar', 'Komplett paket: 5 färger och 2 penslar (+100 kr)'],
    sizes: [
      { id: 'utan-farg-penslar', name: 'Utan färg och penslar', priceDelta: 0, dimensions: p.dimensions },
      { id: 'med-farg-penslar', name: 'Med färg och penslar', priceDelta: 100, dimensions: p.dimensions },
    ],
    image: withoutPaint,
    variantImages: p.colors.flatMap(color => [
      { color, size: 'utan-farg-penslar', image: withoutPaint },
      { color, size: 'med-farg-penslar', image: withPaint },
    ]),
  });
  console.log(`${p.name}: utan ${price} kr / komplett ${price + 100} kr`);
}
