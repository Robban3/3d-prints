import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { planImport } from '../server/src/catalogTransfer.ts';

const catalog = JSON.parse(await readFile(new URL('../tmp/catalog-spec-audit-backup.json', import.meta.url), 'utf8'));
const measurements = JSON.parse(await readFile(new URL('../tmp/catalog-model-measurements.json', import.meta.url), 'utf8'));
const bySlug = new Map(catalog.products.map(p => [p.slug, p]));
const sources = new Map();
const change = (slug, patch, source) => { Object.assign(bySlug.get(slug), patch); sources.set(slug, source); };
const dims = (width, depth, height) => ({ width, depth, height });
const figure = name => {
  const m = measurements.find(row => row.name === name);
  return dims(...m.dimensions_mm.map(Math.round));
};

change('mala-din-jul', { dimensions: dims(80, 80, 95), dimensionsNote: 'Mått per kula, inklusive upphängningsögla och relief. Setet innehåller fyra kulor.' }, 'models/jul-blender-v2/validation.json');
for (const size of bySlug.get('mala-din-jul').sizes) size.dimensions = dims(80, 80, 95);
change('servettring-noel', { dimensionsNote: 'Planerade yttermått per ring: 55 × 35 × 55 mm. Rund öppning Ø35 mm. Sex guldfärgade stjärnor per ring. Priset, vikten och printtiden gäller fyra ringar.' }, 'User-approved dimensions and models/jul-blender-v3/andringar.json; final envelope requires prototype check');
change('presentask-gomma', { dimensions: dims(83, 83, 78), dimensionsNote: 'Monterade yttermått inklusive lock, fyra band och rosett. Öppning Ø65 mm; invändigt djup cirka 30 mm, med rundad avsmalnande insida.' }, 'models/presentask-original-v3/validation.json');
change('fold-telefonstall', { material: 'petg', dimensions: dims(78, 120, 105), dimensionsNote: 'Mekanisk modell uppfälld cirka 78 × 120 × 105 mm; ihopfälld cirka 78 × 122 × 30 mm. PETG är planerat material för de styva delarna; gångjärnen använder M3-skruvar.' }, 'models/fold-fusion-v1/validation.json and LAS-MIG.md; planned PETG replaces flexible TPU design');
change('tomten-och-rudolf', { dimensions: dims(239, 43, 75), dimensionsNote: 'Mått för hela ekipaget inklusive släde och fem renar, i den färgförberedda modellens skala. Bredden avser ekipagets totala längd.' }, 'models/jul-printberedning/slade-farger.json');
change('luciataget', { dimensions: dims(73, 37, 100), dimensionsNote: 'För hela tåget visas största bredd och djup per figur, inte uppställningens totalbredd. Alla figurer är 100 mm höga inklusive huvudbonad. Vid val av lös figur visas den figurens mått; vikt och printtid gäller valt utförande.' }, 'tmp/catalog-model-measurements.json; read-only measurements of four native Blender models');
const figureNames = { lucia: 'Lucia', 'tarna-blont-har': 'Tarna', 'tarna-brunt-har': 'Tarna', stjarngosse: 'Stjarngosse', pepparkaksgubbe: 'Pepparkaksgubbe' };
for (const size of bySlug.get('luciataget').sizes) size.dimensions = figureNames[size.id] ? figure(figureNames[size.id]) : dims(73, 37, 100);
change('tomtar-3-pack', { dimensions: dims(105, 86, 120), dimensionsEstimated: true, dimensionsNote: 'Största bredd och djup per figur vid planerad höjd 120 mm. Vikt och printtid gäller alla tre tomtarna tillsammans. De befintliga Meshy-filerna är 50 mm höga och måste skalas till 120 mm före utskrift.' }, 'models/jul-printberedning/repair-report.json; 50 mm source dimensions scaled proportionally by 2.4 to existing catalog height');
change('pepparkakshus', { dimensionsEstimated: true, dimensionsNote: 'Monterat yttermått inklusive den senaste, bredare och lägre skorstenen. Åtta byggdelar. Vikt och printtid gäller hela huset.' }, 'models/pepparkakshus-blender-v3/skorsten-justering.json: 280 × 240 × 279.07 mm');
change('gravbiblioteket', { dimensionsNote: 'Mått per bokstöd. Vänster och höger har samma yttermått, 90 × 120 × 200 mm. Vikt och printtid gäller paret tillsammans.' }, 'models/gravbiblioteket-blender-v2/validation.json');
change('haxans-gomma', { dimensionsNote: 'Yttermått för hela modellen inklusive hatt och skål. Skålen följer brättets framkant och har högre kant mot hatten.' }, 'models/haxans-gomma-blender-v6/design.json');
change('brew-kaffedripp', { dimensionsNote: 'Mått för ställningen med löstagbart galler; separat tratt, kopp och filter ingår inte. Ringens öppning Ø78 mm. Vikt och printtid gäller ställning och galler.' }, 'models/brew-fusion-v1/validation.json; existing product is stand only');

// Editorial planning estimates approved by the owner, not slicer outputs.
// Rounded grams/hours deliberately avoid false measurement precision.
// Object mass excludes supports, purge, paint, accessories and packaging.
// Each row is the whole sales unit unless a variant overrides it below.
const planning = {
  'vas-signe': [180, 9], 'julgran-2-pack': [150, 8], stjarna: [100, 5],
  'kruka-elise': [180, 8], 'kula-virvel': [45, 3], 'kula-diamant': [45, 3],
  'gran-frost': [230, 13], 'stjarna-polaris': [145, 7], namnornament: [25, 2],
  'mala-din-jul': [180, 14], 'julkula-med-namn': [55, 5], 'var-forsta-jul': [25, 2],
  'snoflinga-3-pack': [45, 3], 'angel-alma': [120, 9], 'ren-vilgot': [100, 7],
  julby: [210, 14], 'servettring-noel': [60, 6], namnskyltar: [30, 2],
  paketetiketter: [45, 3], 'presentask-gomma': [75, 7], julpyssel: [50, 4],
  'vas-nexo': [230, 13], portalpumpan: [330, 24], spokduon: [220, 14],
  'korpens-vas': [250, 14], manskugga: [160, 12], 'haxans-gomma': [400, 24],
  gravbiblioteket: [500, 32], skuggkatten: [220, 14], pumpatornet: [250, 18],
  spokporten: [350, 28], midnattsgomman: [260, 15], runolyktan: [220, 16],
  ritualbrickan: [160, 7], 'ribbad-pumpa': [140, 9], 'spoket-boo': [55, 4],
  'fladdermus-3-pack': [65, 5], dodskallekruka: [170, 11], 'spindelnat-4-pack': [60, 4],
  luciataget: [200, 27], 'tomten-och-rudolf': [115, 18],
  'tomtar-3-pack': [240, 24], pepparkakshus: [850, 48], 'fold-telefonstall': [90, 6],
  'brew-kaffedripp': [200, 12],
};
const productionNote = 'Gäller valt utförande utan emballage. Vikt avser printade delar, utan stöd och färgbytesavfall. Printtid avser aktiv maskintid och är inte en A2L- eller X2D-slicerberäkning; färgbyten, stöd, lagerhöjd och placering kan ge stora avvikelser.';
for (const p of catalog.products) {
  if (planning[p.slug]) [p.weightGrams, p.printTimeHours] = planning[p.slug];
  if (!(p.weightGrams > 0 && p.printTimeHours > 0)) throw new Error('Missing planning row: ' + p.slug);
  p.productionEstimated = true;
  p.productionNote = productionNote;
  p.dimensionsEstimated ??= true;
  p.specificationsPending = false;
  if (p.sizes?.length) {
    for (const s of p.sizes) {
      s.dimensions ??= { ...p.dimensions };
      let mass = p.weightGrams, time = p.printTimeHours;
      if (p.slug === 'terra-vaxtkruka') { [mass, time] = { liten: [210,9], mellan: [310,13], stor: [480,20] }[s.id]; }
      if (p.slug === 'grid-skrivbordsorganiserare') { const factor = { '3-moduler': 1, '5-moduler': 5/3, '8-moduler': 8/3 }[s.id]; mass *= factor; time *= factor; }
      if (p.slug === 'flexi-drake') { [mass, time] = { mini: [95,6], standard: [210,12], jatte: [520,30] }[s.id]; }
      if (p.slug === 'luna-manlampa') { [mass, time] = { '12cm': [320,16], '15cm': [450,23], '20cm': [700,36] }[s.id]; }
      if (p.slug === 'wave-vaggkrokar' && s.id === '6-pack') { mass *= 2; time *= 2; }
      if (p.slug === 'vas-nexo' && s.id === 'l32') { mass = 400; time = 22; }
      if (p.slug === 'luciataget') { [mass, time] = { 'hela-taget': [200,27], lucia: [35,5], 'tarna-blont-har': [35,5], 'tarna-brunt-har': [35,5], stjarngosse: [25,3.5], pepparkaksgubbe: [45,5] }[s.id]; }
      s.weightGrams = Math.round(mass / 5) * 5;
      s.printTimeHours = Math.round(time * 2) / 2;
    }
  }
}

const folder = new URL('../exports/produktspecifikationer-2026-10-16/', import.meta.url);
await mkdir(folder, { recursive: true });
const report = catalog.products.map(p => ({ slug: p.slug, name: p.name, published: p.published !== false,
  material: `${p.material.toUpperCase()} ${p.finish}`, dimensions: p.dimensions, dimensionsNote: p.dimensionsNote,
  dimensionsSource: sources.get(p.slug) ?? 'Existing catalog design dimensions; not independently measured',
  weightGrams: p.weightGrams, printTimeHours: p.printTimeHours,
  productionSource: planning[p.slug] ? 'Owner-approved editorial planning estimate by product type, scale and sales-unit count; not sliced' : 'Existing catalog value retained as an unverified planning estimate',
  productionEstimated: true, sizes: p.sizes ?? [] }));
await writeFile(new URL('genomgang.json', folder), JSON.stringify(report, null, 2));
const lines = ['# Produktgenomgång 16 oktober 2026', '',
  'Alla 57 produkter, inklusive ett opublicerat utkast. Ägaren har godkänt preliminära uppskattningar.',
  'Vikt och tid är redaktionella grovuppskattningar för planering, inte uppmätta värden eller Bambu Studio-resultat. Ingen bestämd felmarginal kan garanteras. Specifika maskinprofiler, färgbyten, stöd och infill är inte beräknade.',
  'Produktvikten avser printade delar i försäljningsenheten och utesluter färgbytesavfall, stöd, färg/penslar och emballage. Total maskintid kan skilja sig mellan A2L och X2D samt mellan separat och samtidig utskrift.', '',
  '| Produkt | B×D×H mm | Ca vikt g | Ca printtid h |', '|---|---|---:|---:|',
  ...report.map(p => `| ${p.name} | ${Object.values(p.dimensions).join(' × ')} | ${p.weightGrams} | ${p.printTimeHours} |`), '',
  'Måttens underlag och värden per utförande finns i genomgang.json. Måtten på koncept utan modell är befintliga preliminära designmått.'] ;
await writeFile(new URL('LAS-MIG.md', folder), lines.join('\n'));

// Do not rewrite seed/upload image URLs. updateProduct merges absent image fields.
const incoming = catalog.products.map(({ image, variantImages, ...p }) => p);
const plan = planImport({ products: incoming }, catalog.products, { categoryIds: catalog.categories.map(c => c.id), materialIds: catalog.materials.map(m => m.id) });
if (plan.failed || plan.ok !== 57 || plan.products.some(row => !row.existingId)) throw new Error(JSON.stringify(plan.rows.filter(r => r.status === 'fel')));
await writeFile(new URL('produkter-uppdatera.json', folder), JSON.stringify({ version: 1, products: incoming }, null, 2));
console.log(JSON.stringify({ products: report.length, variants: report.reduce((n,p) => n+p.sizes.length, 0), validated: plan.ok, measurementSources: sources.size, folder: folder.pathname }));
