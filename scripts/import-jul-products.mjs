import { readFile, access } from 'node:fs/promises';

const env = await readFile(new URL('../server/.env', import.meta.url), 'utf8');
const token = process.env.ADMIN_TOKEN || env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
if (!token) throw new Error('ADMIN_TOKEN saknas');
const base = process.env.LOCAL_API_URL || 'http://localhost:4000/api';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
async function request(path, body, method = 'POST') {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); if (!response.ok) throw new Error(JSON.stringify(data)); return data;
}
const { categories } = await request('/admin/categories');
if (!categories.some(category => category.id === 'julkollektionen')) await request('/admin/categories', { id: 'julkollektionen', name: 'Julkollektionen', description: '3D-printat julpynt, personliga presenter och kreativa julset.' });
const { products } = await request('/admin/products');
for (const product of products.filter(product => ['julgran-2-pack', 'stjarna'].includes(product.slug) && product.category !== 'julkollektionen')) await request(`/admin/products/${product.id}`, { category: 'julkollektionen' }, 'PATCH');
const entries = [
 ['kula-virvel', 'Julkula Virvel', 139, 'Skogsgrön', 'planter', 'En luftig julkula med öppet spiralmönster.'],
 ['kula-diamant', 'Julkula Diamant', 139, 'Vinröd', 'planter', 'En julkula med skulpturala diamantformade veck.'],
 ['gran-frost', 'Gran Frost – 2-pack', 229, 'Benvit', 'planter', 'Två benvita granar med fina veck och olika höjd.'],
 ['stjarna-polaris', 'Stjärna Polaris', 149, 'Benvit', 'gearFidget', 'En benvit, åttauddig stjärna med geometriska veck.'],
 ['namnornament', 'Personligt namnornament', 149, 'Benvit', 'gearFidget', 'Ett cirkelformat ornament med namn, små granar och vinrött band.'],
 ['mala-din-jul', 'Måla din jul – 4-pack', 199, 'Grön, röd, vit och svart', 'planter', 'Fyra julkulor med upphöjda mönster att måla själv.'],
 ['julkula-med-namn', 'Julkula med namn', 169, 'Benvit', 'planter', 'En personlig julkula med namn och årtal.'],
 ['var-forsta-jul', 'Vår första jul', 179, 'Benvit', 'gearFidget', 'Ett ornament som bevarar minnet av er första jul.'],
 ['snoflinga-3-pack', 'Snöflinga – 3-pack', 129, 'Benvit', 'gearFidget', 'Tre olika snöflingor med vinröda upphängningsband.'],
 ['angel-alma', 'Ängel Alma – 2-pack', 179, 'Benvit', 'planter', 'Två avskalade, veckade änglar i olika storlekar.'],
 ['ren-vilgot', 'Ren Vilgot', 199, 'Benvit', 'dragon', 'En skulptural ren för hyllan eller julbordet.'],
 ['julby', 'Julby – 3 små hus', 349, 'Benvit', 'moonLamp', 'Tre små dekorativa hus för batteridrivna LED-ljus.'],
 ['servettring-noel', 'Servettring Noel – 4-pack', 179, 'Skogsgrön', 'gearFidget', 'Fyra skulpturala servettringar med diskreta stjärndetaljer.'],
 ['namnskyltar', 'Namnskylt till julbordet', 129, 'Benvit', 'gearFidget', 'Ett personligt namn som gör dukningen till din egen.'],
 ['paketetiketter', 'Paketetiketter – 6-pack', 99, 'Benvit', 'gearFidget', 'Sex återanvändbara paketetiketter med upphängningsband.'],
 ['presentask-gomma', 'Presentask med gömma', 149, 'Skogsgrön', 'organizer', 'En öppningsbar presentask med skulpturalt vinrött band.'],
 ['julpyssel', 'Julpyssel – måla själv', 149, 'Vit', 'gearFidget', 'Sex dekorationer: två granar, två hjärtan och två stjärnor att måla.'],
];
async function uploadImage(slug, folder) {
  const file = new URL(`../client/public/images/${folder}/${slug}.webp`, import.meta.url);
  try { await access(file); } catch { return null; }
  const form = new FormData(); form.append('file', new Blob([await readFile(file)], { type: 'image/webp' }), `${slug}-visualisering.webp`);
  const response = await fetch(base + '/uploads/images', { method: 'POST', body: form });
  const data = await response.json(); if (!response.ok) throw new Error(JSON.stringify(data)); return data.image;
}
for (const [slug, name, price, color, shape, tagline] of entries) {
  if (products.some(product => product.slug === slug)) continue;
  const image = await uploadImage(slug, 'christmas');
  if (!image) { console.log(`${slug}: väntar på bild`); continue; }
  const personal = ['namnornament', 'julkula-med-namn', 'namnskyltar'].includes(slug);
  const description = `${tagline} Formgiven för Formlabbs julkollektion. Bilden är en designvisualisering och produktionsmått fastställs inför tillverkning.${personal ? ' Namnen i bilderna är exempel; önskat namn bestäms inför produktion.' : ''} Dekoration, färg och penslar ingår inte. ${slug === 'julby' ? 'Endast för batteridrivna LED-ljus; ljuskällor ingår inte.' : ''}`;
  await request('/admin/products', { slug, name, price, tagline, description, category: 'julkollektionen', material: 'pla', finish: 'matt', colors: [color], printTimeHours: 0, dimensions: { width: 0, depth: 0, height: 0 }, weightGrams: 0, specificationsPending: true, stock: 0, rating: 0, reviewCount: 0, featured: false, published: true, highlights: ['Formlabbs julkollektion', ...(personal ? ['Personlig design med ditt namn'] : []), ...(slug === 'mala-din-jul' ? ['En grön, en röd, en vit och en svart kula', 'Upphöjda detaljer att måla'] : [])], art: { shape, tone: 'benvit' }, image });
  console.log(`${name}: tillagd med bild`);
}
for (const product of products.filter(product => !product.image)) {
  const image = await uploadImage(product.slug, 'products'); if (!image) continue;
  await request(`/admin/products/${product.id}`, { image }, 'PATCH'); console.log(`${product.name}: produktbild kopplad`);
}
