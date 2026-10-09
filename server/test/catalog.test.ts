import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CatalogError,
  allCategories,
  allProducts,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  findProduct,
  findProductBySlug,
  publishedProducts,
  resetCatalogCache,
  updateCategory,
  updateProduct,
} from '../src/catalog.ts';
import { ProductInputError, parseProductInput, slugify } from '../src/catalogValidation.ts';

let dir: string;

const categoryIds = ['inredning', 'kontor', 'kok', 'prylar', 'tillbehor'];
const materialIds = ['pla', 'petg', 'abs', 'tpu', 'resin'];
const options = { categoryIds, materialIds };

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Testprodukt',
    tagline: 'En kort rad om produkten',
    description: 'En beskrivning som är tillräckligt lång för att godkännas av valideringen.',
    category: 'inredning',
    price: 299,
    material: 'pla',
    finish: 'Matte',
    printTimeHours: 6,
    dimensions: { width: 100, depth: 100, height: 150 },
    weightGrams: 180,
    colors: ['Matt svart', 'Benvit'],
    highlights: ['Något bra'],
    stock: 10,
    art: { shape: 'planter', tone: 'benvit' },
    ...overrides,
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-katalog-'));
  process.env.CATALOG_STORE = join(dir, 'catalog.json');
  resetCatalogCache();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.CATALOG_STORE;
  resetCatalogCache();
});

describe('katalogen', () => {
  it('sås från det ursprungliga sortimentet', async () => {
    const products = await allProducts();
    assert.equal(products.length, 14);
    assert.equal((await allCategories()).length, 5);
  });

  it('rör inte konstanten när något ändras', async () => {
    const before = (await findProduct('p-001'))!.name;
    await updateProduct('p-001', { name: 'Nytt namn' });
    resetCatalogCache();
    // Läses om från disk – konstanten i koden ska vara orörd.
    const reloaded = await findProduct('p-001');
    assert.equal(reloaded?.name, 'Nytt namn');
    assert.notEqual(before, 'Nytt namn');
  });
});

describe('skapa produkt', () => {
  it('lägger till produkten och ger den ett id', async () => {
    const created = await createProduct(parseProductInput(validInput(), options));
    assert.match(created.id, /^p-\d{3}$/);
    assert.equal((await allProducts()).length, 15);
    assert.equal((await findProduct(created.id))?.name, 'Testprodukt');
  });

  it('härleder webbadressen ur namnet', async () => {
    const created = await createProduct(
      parseProductInput(validInput({ name: 'Snygg Växtkruka Å' }), options),
    );
    assert.equal(created.slug, 'snygg-vaxtkruka-a');
    assert.equal((await findProductBySlug('snygg-vaxtkruka-a'))?.id, created.id);
  });

  it('avvisar en webbadress som redan används', async () => {
    const input = parseProductInput(validInput({ slug: 'terra-vaxtkruka' }), options);
    await assert.rejects(() => createProduct(input), CatalogError);
  });

  it('överlever en omstart', async () => {
    const created = await createProduct(parseProductInput(validInput(), options));
    resetCatalogCache();
    assert.equal((await findProduct(created.id))?.name, 'Testprodukt');
  });
});

describe('ändra produkt', () => {
  it('ändrar fälten men behåller id:t', async () => {
    const updated = await updateProduct('p-001', { price: 999, name: 'Omdöpt' });
    assert.equal(updated.id, 'p-001');
    assert.equal(updated.price, 999);
    assert.equal(updated.name, 'Omdöpt');
  });

  it('låter inte id:t bytas ut', async () => {
    const updated = await updateProduct('p-001', { id: 'p-999' } as never);
    assert.equal(updated.id, 'p-001');
  });

  it('avvisar en webbadress som en annan produkt har', async () => {
    await assert.rejects(() => updateProduct('p-001', { slug: 'luna-manlampa' }), CatalogError);
  });

  it('tillåter att produkten behåller sin egen webbadress', async () => {
    const updated = await updateProduct('p-001', { slug: 'terra-vaxtkruka', price: 400 });
    assert.equal(updated.price, 400);
  });

  it('säger ifrån för en produkt som inte finns', async () => {
    await assert.rejects(() => updateProduct('p-999', { price: 1 }), CatalogError);
  });
});

describe('publicering', () => {
  it('döljer opublicerade produkter för kunderna men inte i admin', async () => {
    await updateProduct('p-001', { published: false });
    assert.equal((await publishedProducts()).length, 13);
    assert.equal((await allProducts()).length, 14);
  });

  it('räknar produkter utan flagga som publicerade', async () => {
    assert.equal((await publishedProducts()).length, 14);
  });
});

describe('ta bort produkt', () => {
  it('plockar ut produkten ur katalogen', async () => {
    const removed = await deleteProduct('p-001');
    assert.equal(removed.id, 'p-001');
    assert.equal((await allProducts()).length, 13);
    assert.equal(await findProduct('p-001'), undefined);
  });

  it('säger ifrån för en produkt som inte finns', async () => {
    await assert.rejects(() => deleteProduct('p-999'), CatalogError);
  });
});

describe('kategorier', () => {
  it('skapar en ny kategori', async () => {
    const created = await createCategory({
      id: 'present',
      name: 'Presenter',
      description: 'Saker att ge bort',
    });
    assert.equal(created.id, 'present');
    assert.equal((await allCategories()).length, 6);
  });

  it('avvisar ett id som redan finns', async () => {
    await assert.rejects(
      () => createCategory({ id: 'kontor', name: 'Dubblett', description: 'Finns redan' }),
      CatalogError,
    );
  });

  it('ändrar namn och beskrivning', async () => {
    const updated = await updateCategory('kontor', { name: 'Skrivbord' });
    assert.equal(updated.name, 'Skrivbord');
    assert.equal(updated.id, 'kontor');
  });

  it('vägrar ta bort en kategori som har produkter i sig', async () => {
    try {
      await deleteCategory('inredning');
      assert.fail('förväntade CatalogError');
    } catch (error) {
      assert.ok(error instanceof CatalogError);
      assert.equal(error.status, 409);
      assert.match(error.fields.id!, /används av \d+ produkter/);
    }
  });

  it('tar bort en tom kategori', async () => {
    await createCategory({ id: 'tom', name: 'Tom', description: 'Inga produkter här' });
    await deleteCategory('tom');
    assert.equal((await allCategories()).length, 5);
  });
});

describe('validering av produktindata', () => {
  it('tar emot ett komplett formulär', () => {
    const parsed = parseProductInput(validInput(), options);
    assert.equal(parsed.name, 'Testprodukt');
    assert.equal(parsed.price, 299);
    assert.equal(parsed.published, true);
  });

  it('pekar ut varje fält som är fel', () => {
    try {
      parseProductInput(
        validInput({ name: '', price: -5, category: 'finns-inte', description: 'kort', colors: [] }),
        options,
      );
      assert.fail('förväntade ProductInputError');
    } catch (error) {
      assert.ok(error instanceof ProductInputError);
      for (const field of ['name', 'price', 'category', 'description', 'colors']) {
        assert.ok(error.fields[field], `saknar fel för ${field}`);
      }
    }
  });

  it('avvisar okänt material, form och yta', () => {
    for (const [patch, field] of [
      [{ material: 'guld' }, 'material'],
      [{ art: { shape: 'rymdskepp', tone: 'benvit' } }, 'art.shape'],
      [{ art: { shape: 'planter', tone: 'neon' } }, 'art.tone'],
    ] as const) {
      assert.throws(() => parseProductInput(validInput(patch), options), ProductInputError);
    }
  });

  it('rundar av priset och håller måtten inom rimliga gränser', () => {
    const parsed = parseProductInput(validInput({ price: 299.6 }), options);
    assert.equal(parsed.price, 300);
    assert.throws(
      () => parseProductInput(validInput({ dimensions: { width: 0, depth: 1, height: 1 } }), options),
      ProductInputError,
    );
  });

  it('tar emot storlekar och ger dem id ur namnet', () => {
    const parsed = parseProductInput(
      validInput({ sizes: [{ name: 'Liten', priceDelta: -50 }, { name: 'Stor', priceDelta: 120 }] }),
      options,
    );
    assert.deepEqual(parsed.sizes?.map((size) => size.id), ['liten', 'stor']);
    assert.equal(parsed.sizes?.[0]?.priceDelta, -50);
  });

  it('avvisar två storlekar med samma id', () => {
    assert.throws(
      () =>
        parseProductInput(
          validInput({ sizes: [{ id: 'a', name: 'En' }, { id: 'a', name: 'Två' }] }),
          options,
        ),
      ProductInputError,
    );
  });

  it('städar bort tomma färger och höjdpunkter', () => {
    const parsed = parseProductInput(
      validInput({ colors: ['Svart', '  ', ''], highlights: ['Bra', ''] }),
      options,
    );
    assert.deepEqual(parsed.colors, ['Svart']);
    assert.deepEqual(parsed.highlights, ['Bra']);
  });
});

describe('slugify', () => {
  it('översätter svenska tecken och skiljetecken', () => {
    assert.equal(slugify('Terra växtkruka'), 'terra-vaxtkruka');
    assert.equal(slugify('Åska & Öl!'), 'aska-ol');
    assert.equal(slugify('  flera   mellanslag  '), 'flera-mellanslag');
  });
});
