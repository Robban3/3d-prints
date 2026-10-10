import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildExport, planImport } from '../src/catalogTransfer.ts';
import { allProducts, resetCatalogCache } from '../src/catalog.ts';
import { categories as seedCategories } from '../src/data/products.ts';
import { materials as seedMaterials } from '../src/data/materials.ts';
import { changedFields, clearHistory, history, record } from '../src/auditLog.ts';

let dir: string;
// Hämtas ur sortimentet, så en ny kategori inte gör testerna till arbete.
const options = {
  categoryIds: seedCategories.map((category) => category.id),
  materialIds: seedMaterials.map((material) => material.id),
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-transfer-'));
  process.env.CATALOG_STORE = join(dir, 'catalog.json');
  process.env.AUDIT_STORE = join(dir, 'handelser.json');
  resetCatalogCache();
  await clearHistory();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.CATALOG_STORE;
  delete process.env.AUDIT_STORE;
  resetCatalogCache();
});

describe('export', () => {
  it('innehåller hela katalogen med versionsnummer', async () => {
    const products = await allProducts();
    const payload = buildExport({ products, categories: [], materials: [], qualities: [] });
    assert.equal(payload.version, 1);
    assert.equal(payload.products.length, products.length);
    assert.ok(payload.exportedAt);
  });
});

describe('import', () => {
  it('känner igen befintliga produkter på webbadressen och vill ändra dem', async () => {
    const products = await allProducts();
    const payload = buildExport({ products, categories: [], materials: [], qualities: [] });
    const plan = planImport(payload, products, options);
    assert.equal(plan.failed, 0);
    assert.equal(plan.ok, products.length);
    assert.ok(plan.rows.every((row) => row.status === 'ändrad'));
  });

  it('markerar okända webbadresser som nya', async () => {
    const products = await allProducts();
    const plan = planImport(
      {
        products: [
          {
            name: 'Helt ny sak',
            tagline: 'En rad om den',
            description: 'En beskrivning som är lång nog för att godkännas av valideringen.',
            category: 'inredning',
            price: 199,
            material: 'pla',
            printTimeHours: 3,
            dimensions: { width: 50, depth: 50, height: 50 },
            weightGrams: 60,
            colors: ['Svart'],
            stock: 3,
            art: { shape: 'planter', tone: 'benvit' },
          },
        ],
      },
      products,
      options,
    );
    assert.equal(plan.rows[0]?.status, 'skapad');
    assert.equal(plan.ok, 1);
  });

  it('pekar ut felen per rad utan att stoppa de övriga', async () => {
    const products = await allProducts();
    const good = {
      name: 'Bra rad',
      tagline: 'Fungerar',
      description: 'En beskrivning som är lång nog för att godkännas av valideringen.',
      category: 'inredning',
      price: 199,
      material: 'pla',
      printTimeHours: 3,
      dimensions: { width: 50, depth: 50, height: 50 },
      weightGrams: 60,
      colors: ['Svart'],
      stock: 3,
      art: { shape: 'planter', tone: 'benvit' },
    };
    const plan = planImport(
      { products: [good, { ...good, name: 'Trasig', price: -5, category: 'finns-inte' }] },
      products,
      options,
    );
    assert.equal(plan.ok, 1);
    assert.equal(plan.failed, 1);
    assert.equal(plan.rows[1]?.status, 'fel');
    assert.ok(plan.rows[1]?.errors?.price);
    assert.ok(plan.rows[1]?.errors?.category);
  });

  it('avvisar en fil med samma webbadress två gånger', async () => {
    const products = await allProducts();
    const row = {
      name: 'Dubblett',
      slug: 'dubblett',
      tagline: 'Två gånger',
      description: 'En beskrivning som är lång nog för att godkännas av valideringen.',
      category: 'inredning',
      price: 199,
      material: 'pla',
      printTimeHours: 3,
      dimensions: { width: 50, depth: 50, height: 50 },
      weightGrams: 60,
      colors: ['Svart'],
      stock: 3,
      art: { shape: 'planter', tone: 'benvit' },
    };
    const plan = planImport({ products: [row, row] }, products, options);
    assert.equal(plan.ok, 1);
    assert.equal(plan.failed, 1);
    assert.match(plan.rows[1]?.errors?.slug ?? '', /flera gånger/);
  });

  it('klarar en tom eller trasig fil utan att krascha', async () => {
    const products = await allProducts();
    for (const input of [null, {}, { products: 'inte en lista' }, { products: [] }]) {
      const plan = planImport(input, products, options);
      assert.equal(plan.ok, 0);
      assert.equal(plan.failed, 0);
    }
  });
});

describe('ändringslogg', () => {
  it('sparar händelser med senaste först', async () => {
    await record({ action: 'skapad', entity: 'produkt', entityId: 'p-900', summary: 'Först' });
    await record({ action: 'ändrad', entity: 'produkt', entityId: 'p-900', summary: 'Sedan' });
    const entries = await history();
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.summary, 'Sedan');
    assert.ok(entries[0]?.at);
  });

  it('håller loggen inom sin gräns', async () => {
    for (let i = 0; i < 520; i += 1) {
      await record({ action: 'ändrad', entity: 'produkt', entityId: `p-${i}`, summary: `${i}` });
    }
    const entries = await history(1000);
    assert.equal(entries.length, 500);
    // De äldsta ska ha fallit av, inte de nyaste.
    assert.equal(entries[0]?.summary, '519');
  });
});

describe('changedFields', () => {
  it('listar bara det som faktiskt skiljer sig', () => {
    assert.deepEqual(changedFields({ a: 1, b: 2 }, { a: 1, b: 3 }), ['b']);
    assert.deepEqual(changedFields({ a: 1 }, { a: 1 }), []);
  });

  it('jämför djupt så att orörda listor inte räknas som ändrade', () => {
    assert.deepEqual(changedFields({ colors: ['a', 'b'] }, { colors: ['a', 'b'] }), []);
    assert.deepEqual(changedFields({ colors: ['a'] }, { colors: ['a', 'b'] }), ['colors']);
  });

  it('bryr sig inte om id', () => {
    assert.deepEqual(changedFields({ id: 'p-1', name: 'A' }, { id: 'p-2', name: 'A' }), []);
  });
});
