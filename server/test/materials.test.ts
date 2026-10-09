import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CatalogError,
  allMaterials,
  allProducts,
  allQualities,
  createProduct,
  deleteProduct,
  deleteMaterial,
  deleteQuality,
  findMaterial,
  resetCatalogCache,
  saveMaterial,
  saveQuality,
} from '../src/catalog.ts';
import {
  ProductInputError,
  parseMaterialInput,
  parseProductInput,
  parseQualityInput,
} from '../src/catalogValidation.ts';
import { quoteFor } from '../src/pricing.ts';
import { parseQuoteRequest } from '../src/validation.ts';

let dir: string;

const request = {
  material: 'petg',
  quality: 'standard',
  volumeCm3: 120,
  infill: 25,
  quantity: 1,
  rush: false,
  postProcessing: false,
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-material-'));
  process.env.CATALOG_STORE = join(dir, 'catalog.json');
  resetCatalogCache();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.CATALOG_STORE;
  resetCatalogCache();
});

describe('material i katalogen', () => {
  it('sås från de ursprungliga fem', async () => {
    assert.deepEqual(
      (await allMaterials()).map((material) => material.id),
      ['pla', 'petg', 'abs', 'tpu', 'resin'],
    );
  });

  it('en ändrad prisfaktor slår igenom på offerten', async () => {
    const before = await quoteFor(request);
    await saveMaterial({ ...(await findMaterial('petg'))!, priceFactor: 3 });
    const after = await quoteFor(request);
    assert.ok(after.total > before.total, `${after.total} skulle vara mer än ${before.total}`);
    assert.ok(after.materialCost > before.materialCost);
  });

  it('ett nytt material går att prissätta direkt', async () => {
    await saveMaterial(
      parseMaterialInput({
        name: 'Kolfiber-PA',
        priceFactor: 4.5,
        description: 'Nylon med kolfiber för styva, tåliga detaljer.',
        traits: ['Mycket styv', 'Värmetålig'],
      }),
    );
    const parsed = await parseQuoteRequest({ ...request, material: 'kolfiber-pa' });
    const quote = await quoteFor(parsed);
    assert.ok(quote.total > 0);
    assert.equal((await findMaterial('kolfiber-pa'))?.priceFactor, 4.5);
  });

  it('avvisas i en offert innan det finns', async () => {
    await assert.rejects(() => parseQuoteRequest({ ...request, material: 'kolfiber-pa' }));
  });

  it('går inte att ta bort medan produkter använder det', async () => {
    try {
      await deleteMaterial('pla');
      assert.fail('förväntade CatalogError');
    } catch (error) {
      assert.ok(error instanceof CatalogError);
      assert.equal(error.status, 409);
      assert.match(error.fields.id!, /används av \d+ produkter/);
    }
  });

  it('går att ta bort när inget använder det', async () => {
    await saveMaterial(
      parseMaterialInput({
        name: 'Testmaterial',
        priceFactor: 1,
        description: 'Ett material som ingen produkt använder.',
      }),
    );
    await deleteMaterial('testmaterial');
    assert.equal((await allMaterials()).length, 5);
  });

  it('lämnar alltid minst ett material kvar', async () => {
    // Töm katalogen på produkter först, annars stoppas borttagningen redan av
    // regeln om material som används.
    for (const product of await allProducts()) await deleteProduct(product.id);
    for (const id of ['pla', 'petg', 'abs', 'tpu']) await deleteMaterial(id);
    assert.equal((await allMaterials()).length, 1);

    try {
      await deleteMaterial('resin');
      assert.fail('förväntade CatalogError');
    } catch (error) {
      assert.ok(error instanceof CatalogError);
      assert.match(error.fields.id!, /minst ett material/);
    }
  });
});

describe('kvalitetsnivåer', () => {
  it('en ändrad tidsfaktor slår igenom på printtiden', async () => {
    const before = await quoteFor(request);
    await saveQuality({
      id: 'standard',
      name: 'Standard',
      layerHeightMm: 0.2,
      timeFactor: 3,
      description: 'Långsammare än förut.',
    });
    const after = await quoteFor(request);
    assert.ok(after.estimatedPrintHours > before.estimatedPrintHours);
    assert.ok(after.machineCost > before.machineCost);
  });

  it('en ny nivå går att välja i en offert', async () => {
    await saveQuality(
      parseQualityInput({
        name: 'Extrem',
        layerHeightMm: 0.04,
        timeFactor: 4,
        description: 'För de allra finaste detaljerna.',
      }),
    );
    const parsed = await parseQuoteRequest({ ...request, quality: 'extrem' });
    assert.equal(parsed.quality, 'extrem');
    assert.ok((await quoteFor(parsed)).estimatedPrintHours > 0);
  });

  it('lämnar alltid minst en nivå kvar', async () => {
    for (const id of ['utkast', 'fin', 'ultrafin']) await deleteQuality(id);
    assert.equal((await allQualities()).length, 1);
    await assert.rejects(() => deleteQuality('standard'), CatalogError);
  });
});

describe('validering av material och kvalitet', () => {
  it('avvisar orimliga faktorer', () => {
    assert.throws(
      () => parseMaterialInput({ name: 'X', priceFactor: 0, description: 'För lågt värde här.' }),
      ProductInputError,
    );
    assert.throws(
      () =>
        parseQualityInput({
          name: 'X',
          layerHeightMm: 5,
          timeFactor: 1,
          description: 'För tjockt.',
        }),
      ProductInputError,
    );
  });

  it('härleder id ur namnet och behåller det vid ändring', () => {
    const created = parseMaterialInput({
      name: 'Kolfiber PA',
      priceFactor: 4,
      description: 'Beskrivning som räcker.',
    });
    assert.equal(created.id, 'kolfiber-pa');
    const edited = parseMaterialInput({ ...created, name: 'Nytt namn' }, 'kolfiber-pa');
    assert.equal(edited.id, 'kolfiber-pa');
  });
});

describe('produkt mot nytt material', () => {
  it('går att spara i ett material som just lagts till', async () => {
    await saveMaterial(
      parseMaterialInput({
        name: 'Trä-PLA',
        priceFactor: 1.4,
        description: 'PLA blandat med träfiber.',
      }),
    );
    const materialIds = (await allMaterials()).map((material) => material.id);
    const product = await createProduct(
      parseProductInput(
        {
          name: 'Trälåda',
          tagline: 'Låda i träkänsla',
          description: 'En låda som ser ut som trä men är printad i blandat filament.',
          category: 'inredning',
          price: 349,
          material: 'tra-pla',
          printTimeHours: 5,
          dimensions: { width: 120, depth: 90, height: 60 },
          weightGrams: 140,
          colors: ['Natur'],
          stock: 4,
          art: { shape: 'organizer', tone: 'benvit' },
        },
        { categoryIds: ['inredning'], materialIds },
      ),
    );
    assert.equal(product.material, 'tra-pla');
  });
});
