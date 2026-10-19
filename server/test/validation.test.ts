import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ValidationError,
  parseCustomer,
  parseOrderLines,
  parseQuoteRequest,
} from '../src/validation.ts';
import { products } from '../src/data/products.ts';
import { findProduct, resetCatalogCache } from '../src/catalog.ts';

let testDirectory: string;
const previousCatalog = process.env.CATALOG_STORE;
before(async () => {
  testDirectory = await mkdtemp(join(tmpdir(), 'formlabb-validation-'));
  process.env.CATALOG_STORE = join(testDirectory, 'catalog.json');
  resetCatalogCache();
});
after(async () => {
  if (previousCatalog === undefined) delete process.env.CATALOG_STORE;
  else process.env.CATALOG_STORE = previousCatalog;
  resetCatalogCache();
  await rm(testDirectory, { recursive: true, force: true });
});

const validCustomer = {
  name: 'Anna Andersson',
  email: 'anna@example.com',
  address: 'Storgatan 1',
  postalCode: '112 34',
  city: 'Stockholm',
};

describe('parseCustomer', () => {
  it('normaliserar postnummer och behåller uppgifterna', () => {
    const customer = parseCustomer(validCustomer);
    assert.equal(customer.postalCode, '11234');
    assert.equal(customer.name, 'Anna Andersson');
  });

  it('pekar ut felaktiga fält', () => {
    try {
      parseCustomer({
        ...validCustomer,
        email: 'inte-en-mejl',
        postalCode: '12',
      });
      assert.fail('förväntade ValidationError');
    } catch (error) {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.fields['customer.email']);
      assert.ok(error.fields['customer.postalCode']);
    }
  });
});

describe('parseOrderLines', () => {
  const product = products[0]!;

  it('hämtar priset från katalogen och ignorerar klientens pris', async () => {
    const current = (await findProduct(product.id))!;
    const lines = await parseOrderLines([
      {
        productId: product.id,
        quantity: 2,
        color: product.colors[0],
        unitPrice: 1,
      },
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.unitPrice, current.price + current.sizes![0]!.priceDelta);
  });

  it('lägger till storlekstillägg', async () => {
    const current = (await findProduct(product.id))!;
    const large = current.sizes!.at(-1)!;
    const lines = await parseOrderLines([
      {
        productId: product.id,
        quantity: 1,
        color: product.colors[0],
        size: large.id,
      },
    ]);
    assert.equal(lines[0]!.unitPrice, current.price + large.priceDelta);
  });

  it('avvisar tom varukorg', async () => {
    await assert.rejects(() => parseOrderLines([]), ValidationError);
  });
  it('avvisar okända storlekar och antal som inte är hela tal', async () => {
    await assert.rejects(() => parseOrderLines([{ productId: product.id, quantity: 1, size: 'saknas' }]), ValidationError);
    for (const quantity of [1.5, '2st', true]) {
      await assert.rejects(() => parseOrderLines([{ productId: product.id, quantity }]), ValidationError);
    }
  });

  it('avvisar okänd produkt och ogiltig färg', async () => {
    await assert.rejects(
      () => parseOrderLines([{ productId: 'saknas', quantity: 1 }]),
      ValidationError,
    );
    await assert.rejects(
      () => parseOrderLines([{ productId: product.id, quantity: 1, color: 'Neonrosa' }]),
      ValidationError,
    );
  });

  it('avvisar orimliga antal', async () => {
    await assert.rejects(
      () => parseOrderLines([{ productId: product.id, quantity: 0 }]),
      ValidationError,
    );
    await assert.rejects(
      () => parseOrderLines([{ productId: product.id, quantity: 500 }]),
      ValidationError,
    );
  });
});

describe('parseQuoteRequest', () => {
  const valid = {
    material: 'petg',
    quality: 'fin',
    volumeCm3: 80,
    infill: 30,
    quantity: 3,
    rush: false,
    postProcessing: true,
  };

  it('tar emot en giltig förfrågan', async () => {
    const request = await parseQuoteRequest(valid);
    assert.equal(request.material, 'petg');
    assert.equal(request.postProcessing, true);
  });

  it('avvisar värden utanför gränserna', async () => {
    await assert.rejects(() => parseQuoteRequest({ ...valid, quantity: 1.5 }), ValidationError);
    await assert.rejects(() => parseQuoteRequest({ ...valid, volumeCm3: '80cm3' }), ValidationError);
    await assert.rejects(() => parseQuoteRequest({ ...valid, volumeCm3: 99999 }), ValidationError);
    await assert.rejects(() => parseQuoteRequest({ ...valid, infill: 300 }), ValidationError);
    await assert.rejects(() => parseQuoteRequest({ ...valid, material: 'guld' }), ValidationError);
  });
});
