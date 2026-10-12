// Run from server/: node --env-file-if-exists=.env ../scripts/replace-spiral-with-nexo.mjs
import { readFile } from 'node:fs/promises';
const base = 'http://localhost:4000/api';
const headers = { Authorization: `Bearer ${process.env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' };
async function request(path, body, method = 'POST') {
  const response = await fetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}
const data = await request('/admin/products', undefined, 'GET');
const products = Array.isArray(data) ? data : data.products;
const previous = products.find(p => p.slug === 'spiral-vas');
if (!products.some(p => p.slug === 'vas-nexo')) {
  const file = await readFile(new URL('../client/public/images/products/vas-nexo.webp', import.meta.url));
  const form = new FormData(); form.append('file', new Blob([file], { type: 'image/webp' }), 'vas-nexo-visualisering.webp');
  const response = await fetch(base + '/uploads/images', { method: 'POST', body: form });
  const uploaded = await response.json(); if (!response.ok) throw new Error(JSON.stringify(uploaded));
  await request('/admin/products', {
    slug: 'vas-nexo', name: 'Vas Nexo', tagline: 'Skulpturala band. Luft, glas och form.',
    description: 'Tre breda, mjukt formade band bygger en öppen skulptur runt en synlig glasinsats. Stora mellanrum låter ljuset falla igenom formen och ger blommorna en arkitektonisk inramning. Nexo är ett nytt designkoncept för Formlabb. Bilden är en visualisering; konstruktion, glasinsats och produktionsmått fastställs genom provprintning inför tillverkning. Blommor och annan dekoration ingår inte.',
    category: 'inredning', price: 299, material: 'pla', finish: 'Silk / matt efter färgval',
    printTimeHours: 0, dimensions: { width: 0, depth: 0, height: 0 }, weightGrams: 0, specificationsPending: true,
    colors: ['Silk pärlemor', 'Matt svart', 'Salvia', 'Terrakotta'],
    sizes: [{ id: 'l24', name: 'Höjd 24 cm', priceDelta: 0 }, { id: 'l32', name: 'Höjd 32 cm', priceDelta: 110 }],
    highlights: ['Öppen, skulptural form', 'Tre breda band runt en glasinsats', 'Nytt designkoncept från Formlabb'],
    stock: 0, rating: 0, reviewCount: 0, featured: false, published: true, art: { shape: 'nexoVase', tone: 'benvit' }, image: uploaded.image,
  });
  console.log('Vas Nexo skapad med ny produktbild.');
}
if (previous?.published !== false && previous) {
  await request(`/admin/products/${previous.id}`, { published: false }, 'PATCH');
  console.log('Spiral vas arkiverad från butiken; historik finns kvar i admin.');
}
