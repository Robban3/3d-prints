// Byter färgnamn, material och finish på produkterna enligt filamentmallen.
// Kartan ligger i filament-fargkarta.json och är genererad ur bladet Varianter.
//
// Kör utan flagga för att se vad som skulle ändras, med --apply för att spara.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const env = await readFile(new URL('../server/.env', import.meta.url), 'utf8').catch(() => '');
const token = process.env.ADMIN_TOKEN || env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
if (!token) throw new Error('ADMIN_TOKEN saknas');
const base = process.env.API_BASE || 'http://localhost:4000/api';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const apply = process.argv.includes('--apply');

async function request(path, body, method = 'POST') {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); if (!response.ok) throw new Error(`${path}: ${JSON.stringify(data)}`); return data;
}

const map = JSON.parse(await readFile(new URL('./filament-fargkarta.json', import.meta.url), 'utf8'));
const { products } = await request('/admin/products');

// Säkerhetskopia före varje körning som skriver, precis som importskripten.
if (apply) {
  await mkdir(new URL('../server/data/backups/', import.meta.url), { recursive: true });
  await writeFile(new URL(`../server/data/backups/catalog-before-filament-${Date.now()}.json`, import.meta.url), JSON.stringify({ products }, null, 2));
}

/** Byter namn på en färg, även när den är sammansatt av flera filament. */
function rename(colour, colours) {
  if (colours[colour]) return colours[colour];
  const parts = colour.split(/(,\s*|\s+och\s+)/);
  if (parts.length === 1) return colour;
  let touched = false;
  const out = parts.map(part => {
    const key = part.trim();
    const hit = Object.entries(colours).find(([from]) => from.toLowerCase() === key.toLowerCase())?.[1];
    if (!hit) return part;
    touched = true;
    return part.replace(key, hit);
  });
  return touched ? out.join('') : colour;
}

const missing = [];
let planned = 0, images = 0;
for (const entry of map.produkter) {
  const product = products.find(candidate => candidate.name === entry.name);
  if (!product) { missing.push(entry.name); continue; }

  const colours = Object.fromEntries(product.colors.map(colour => [colour, rename(colour, entry.colors)]));
  const next = {
    material: entry.material,
    finish: entry.finish ?? product.finish,
    colors: product.colors.map(colour => colours[colour]),
  };
  // Variantbilder slås upp på exakt färgnamn, och valideringen avvisar en bild
  // vars färg inte finns i listan. De måste därför följa med i samma sparning.
  if (product.variantImages?.length) {
    next.variantImages = product.variantImages.map(variant => ({ ...variant, color: colours[variant.color] ?? variant.color }));
    images += next.variantImages.filter((variant, index) => variant.color !== product.variantImages[index].color).length;
  }

  const unchanged = next.material === product.material && next.finish === product.finish
    && next.colors.every((colour, index) => colour === product.colors[index]);
  if (unchanged) continue;
  planned += 1;

  const changes = [];
  if (next.material !== product.material) changes.push(`material ${product.material} → ${next.material}`);
  if (next.finish !== product.finish) changes.push(`finish ${product.finish} → ${next.finish}`);
  const recoloured = product.colors.map((colour, index) => colour === next.colors[index] ? null : `${colour} → ${next.colors[index]}`).filter(Boolean);
  console.log(`${product.name}\n  ${[...changes, ...recoloured].join('\n  ')}`);

  if (apply) await request(`/admin/products/${product.id}`, next, 'PATCH');
}

if (missing.length) console.log(`\nHittades inte i katalogen: ${missing.join(', ')}`);
console.log(`\n${planned} produkter ${apply ? 'ändrade' : 'skulle ändras'}, ${images} variantbilder omnycklade.`);
console.log(apply ? 'Kör scripts/export-deployment-catalog.mjs för att uppdatera seeden.' : 'Kör med --apply för att spara.');
