import { readFile } from 'node:fs/promises';

// Idempotent import into the local admin API, preserving existing product edits.
const env = await readFile(new URL('../server/.env', import.meta.url), 'utf8');
const token = process.env.ADMIN_TOKEN || env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
if (!token) throw new Error('ADMIN_TOKEN saknas');
const base = process.env.LOCAL_API_URL || 'http://localhost:4000/api';
const headers = { authorization: `Bearer ${token}` };
async function request(path, init = {}) {
  const response = await fetch(base + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}
const { products } = await request('/admin/products', { headers });
const entries = [
  ['vas-signe', 'Vas Signe', 349, 'signe', 'Benvit', 'spiralVase', 'En skulptural spiralvas med mjuka, böljande former.', ['För torkade blommor och dekorativa grenar', 'Spiralformad silhuett']],
  ['julgran-2-pack', 'Julgran – 2-pack', 199, 'julgran', 'Skogsgrön', 'planter', 'Två gröna granar med veckad form för julens små stilleben.', ['Två granar i ett set', 'Skogsgrön, matt yta']],
  ['stjarna', 'Stjärna', 149, 'stjarna', 'Vinröd', 'gearFidget', 'En vinröd stjärna med geometriska veck som fångar ljuset.', ['För julgranen eller ett dekorativt stilleben', 'Vinröd, matt yta']],
  ['kruka-elise', 'Kruka Elise', 279, 'elise', 'Benvit', 'planter', 'En dekorativ kruka med fasetterad form för hemmets gröna favoriter.', ['Skulptural, fasetterad silhuett', 'Använd med innerkruka']],
];
for (const [slug, name, price, asset, color, shape, tagline, highlights] of entries) {
  if (products.some(product => product.slug === slug)) { console.log(`${name}: finns redan`); continue; }
  const file = await readFile(new URL(`../client/public/images/campaign/${asset}.webp`, import.meta.url));
  const form = new FormData();
  form.append('file', new Blob([file], { type: 'image/webp' }), `${asset}.webp`);
  const { image } = await request('/uploads/images', { method: 'POST', body: form });
  const draft = {
    slug, name, price, tagline,
    description: `${tagline} Formgiven för Formlabbs julkollektion och tillverkad i PLA med matt finish. Bilden är en visualisering av designen; produktionsmått fastställs inför tillverkning. Blommor, växter och övrig dekoration ingår inte.`,
    category: 'inredning', material: 'pla', finish: 'matt', colors: [color],
    printTimeHours: 0, dimensions: { width: 0, depth: 0, height: 0 }, weightGrams: 0,
    specificationsPending: true, stock: 0, rating: 0, reviewCount: 0,
    featured: true, published: true, highlights, art: { shape, tone: 'benvit' }, image,
  };
  await request('/admin/products', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(draft) });
  console.log(`${name}: tillagd, ${price} kr`);
}
