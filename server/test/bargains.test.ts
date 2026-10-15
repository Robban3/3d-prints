import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findProduct, updateProduct, resetCatalogCache } from '../src/catalog.ts';
import { parseProductInput, ProductInputError } from '../src/catalogValidation.ts';
import { parseOrderLines } from '../src/validation.ts';
import { productPrice } from '../src/productPrice.ts';
import { payloadForOrder } from '../src/klarna.ts';

it('validerar fynd, använder referenspriset och räknar rabatten även för storlekar', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'formlabb-bargains-'));
  process.env.CATALOG_STORE = join(dir, 'catalog.json'); resetCatalogCache();
  try {
    const base = (await findProduct('p-001'))!;
    const options = { categoryIds: [base.category], materialIds: [base.material] };
    const input = { ...base, price: 349, discountPercent: 20, saleReferencePrice: 299, sizes: [{ id: 'standard', name: 'Standard', priceDelta: 0 }, { id: 'stor', name: 'Stor', priceDelta: 100 }] };
    const parsed = parseProductInput(input, options);
    assert.equal(productPrice(parsed).price, 239);
    assert.equal(productPrice(parsed, 100).price, 319);
    for (const patch of [{ discountPercent: -5 }, { discountPercent: 100 }, { discountPercent: 2.5 }, { discountPercent: '20oops' }, { saleReferencePrice: undefined }, { saleReferencePrice: 500 }, { saleReferencePrice: 0 }, { sizes: [{ id: 'mini', name: 'Mini', priceDelta: -298 }] }]) {
      assert.throws(() => parseProductInput({ ...input, ...patch }, options), ProductInputError);
    }
    await updateProduct(base.id, parsed);
    const [line] = await parseOrderLines([{ productId: base.id, quantity: 2, size: 'stor', unitPrice: 1, discountPercent: 99 }]);
    assert.equal(line!.unitPrice, 319);
    const payload = payloadForOrder({ lines: [line!], total: 638, shipping: 0 }, { purchaseCountry: 'SE', purchaseCurrency: 'SEK', locale: 'sv-SE' });
    assert.equal(payload.order_amount, 63800);
    const cleared = parseProductInput({ ...input, discountPercent: 0 }, options);
    assert.equal(cleared.saleReferencePrice, undefined);
    await updateProduct(base.id, cleared);
    assert.equal((await parseOrderLines([{ productId: base.id, quantity: 1, size: 'stor' }]))[0]!.unitPrice, 449);
  } finally {
    delete process.env.CATALOG_STORE; resetCatalogCache(); await rm(dir, { recursive: true, force: true });
  }
});
