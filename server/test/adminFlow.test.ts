import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  allProducts,
  createProduct,
  deleteProduct,
  publishedProducts,
  resetCatalogCache,
  updateProduct,
} from '../src/catalog.ts';
import { parseProductInput } from '../src/catalogValidation.ts';
import { removeStock, reserve, resetStockCache, setStock, stockFor } from '../src/stock.ts';
import { parseOrderLines } from '../src/validation.ts';

let dir: string;
const categoryIds = ['inredning', 'kontor', 'kok', 'prylar', 'tillbehor'];
const materialIds = ['pla', 'petg', 'abs', 'tpu', 'resin'];
const options = { categoryIds, materialIds };

const input = {
  name: 'Fönsterhylla',
  tagline: 'Smal hylla för fönsterkarmen',
  description: 'En smal hylla som klämmer fast i fönsterkarmen utan att skruvas fast.',
  category: 'inredning',
  price: 449,
  material: 'petg',
  finish: 'Matte',
  printTimeHours: 8,
  dimensions: { width: 300, depth: 90, height: 60 },
  weightGrams: 240,
  colors: ['Benvit', 'Grafit'],
  highlights: ['Kläms fast utan skruv'],
  stock: 7,
  art: { shape: 'spiceShelf', tone: 'benvit' },
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-admin-'));
  process.env.CATALOG_STORE = join(dir, 'catalog.json');
  process.env.STOCK_STORE = join(dir, 'stock.json');
  resetCatalogCache();
  resetStockCache();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.CATALOG_STORE;
  delete process.env.STOCK_STORE;
  resetCatalogCache();
  resetStockCache();
});

/** Samma steg som POST /api/admin/products tar. */
async function addProduct(overrides: Record<string, unknown> = {}) {
  const parsed = parseProductInput({ ...input, ...overrides }, options);
  const product = await createProduct(parsed);
  await setStock(product.id, parsed.stock);
  return product;
}

describe('lägga till en produkt', () => {
  it('gör den köpbar i butiken direkt', async () => {
    const product = await addProduct();

    // Den syns för kunderna …
    const visible = await publishedProducts();
    assert.ok(visible.some((entry) => entry.id === product.id));

    // … den går att lägga i en order till rätt pris …
    const lines = await parseOrderLines([{ productId: product.id, quantity: 2, color: 'Benvit' }]);
    assert.equal(lines[0]?.unitPrice, 449);
    assert.equal(lines[0]?.name, 'Fönsterhylla');

    // … och lagersaldot är det som angavs i formuläret.
    assert.equal(await stockFor(product.id), 7);
  });

  it('respekterar lagersaldot som sattes vid skapandet', async () => {
    const product = await addProduct({ stock: 2 });
    await reserve([
      { productId: product.id, name: 'Fönsterhylla', quantity: 2, unitPrice: 449, color: 'Benvit' },
    ]);
    assert.equal(await stockFor(product.id), 0);
    await assert.rejects(() =>
      reserve([
        {
          productId: product.id,
          name: 'Fönsterhylla',
          quantity: 1,
          unitPrice: 449,
          color: 'Benvit',
        },
      ]),
    );
  });

  it('håller ett utkast borta från butiken men går att beställa först när det publiceras', async () => {
    const product = await addProduct({ published: false });
    const visible = await publishedProducts();
    assert.equal(
      visible.some((entry) => entry.id === product.id),
      false,
    );

    // Ett utkast ska inte gå att lägga i en order.
    await assert.rejects(() =>
      parseOrderLines([{ productId: product.id, quantity: 1, color: 'Benvit' }]),
    );

    await updateProduct(product.id, { published: true });
    const lines = await parseOrderLines([{ productId: product.id, quantity: 1, color: 'Benvit' }]);
    assert.equal(lines.length, 1);
  });
});

describe('ändra en produkt', () => {
  it('slår igenom på priset i nya ordrar', async () => {
    const product = await addProduct();
    await updateProduct(product.id, { price: 529 });
    const lines = await parseOrderLines([{ productId: product.id, quantity: 1, color: 'Benvit' }]);
    assert.equal(lines[0]?.unitPrice, 529);
  });

  it('slår igenom på färgvalen', async () => {
    const product = await addProduct();
    await updateProduct(product.id, { colors: ['Tegel'] });
    await assert.rejects(() =>
      parseOrderLines([{ productId: product.id, quantity: 1, color: 'Benvit' }]),
    );
    const lines = await parseOrderLines([{ productId: product.id, quantity: 1, color: 'Tegel' }]);
    assert.equal(lines[0]?.color, 'Tegel');
  });

  it('lägger till storlekar som går att beställa', async () => {
    const product = await addProduct();
    await updateProduct(product.id, {
      sizes: [
        { id: 'kort', name: 'Kort', priceDelta: 0 },
        { id: 'lang', name: 'Lång', priceDelta: 150 },
      ],
    });
    const lines = await parseOrderLines([
      { productId: product.id, quantity: 1, color: 'Benvit', size: 'lang' },
    ]);
    assert.equal(lines[0]?.unitPrice, 449 + 150);
  });
});

describe('ta bort en produkt', () => {
  it('plockar bort den ur butiken och lagret', async () => {
    const product = await addProduct();
    await deleteProduct(product.id);
    await removeStock(product.id);

    assert.equal(
      (await allProducts()).some((entry) => entry.id === product.id),
      false,
    );
    assert.equal(await stockFor(product.id), 0);
    await assert.rejects(() =>
      parseOrderLines([{ productId: product.id, quantity: 1, color: 'Benvit' }]),
    );
  });

  it('rör inte det ursprungliga sortimentet', async () => {
    const before = (await allProducts()).length;
    const product = await addProduct();
    await deleteProduct(product.id);
    assert.equal((await allProducts()).length, before);
  });
});
