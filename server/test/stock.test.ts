import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutOfStockError, release, reserve, resetStockCache, stockFor } from '../src/stock.ts';
import { products } from '../src/data/products.ts';
import type { OrderLine } from '../src/types.ts';

let dir: string;
const product = products[0]!;

function line(quantity: number, productId = product.id): OrderLine {
  return { productId, name: 'Testprodukt', quantity, unitPrice: 100, color: 'Grafit' };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-stock-'));
  process.env.STOCK_STORE = join(dir, 'stock.json');
  resetStockCache();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.STOCK_STORE;
  resetStockCache();
});

describe('lagersaldo', () => {
  it('utgår från produktens angivna lager', async () => {
    assert.equal(await stockFor(product.id), product.stock);
  });

  it('drar av vid reservation', async () => {
    await reserve([line(3)]);
    assert.equal(await stockFor(product.id), product.stock - 3);
  });

  it('summerar flera rader av samma produkt', async () => {
    await reserve([line(2), line(3)]);
    assert.equal(await stockFor(product.id), product.stock - 5);
  });

  it('lämnar tillbaka saldot vid återkallande', async () => {
    await reserve([line(4)]);
    await release([line(4)]);
    assert.equal(await stockFor(product.id), product.stock);
  });
});

describe('otillräckligt saldo', () => {
  it('avvisar en beställning som är större än lagret', async () => {
    await assert.rejects(() => reserve([line(product.stock + 1)]), OutOfStockError);
  });

  it('rör inte saldot alls när en rad inte räcker till', async () => {
    const other = products[1]!;
    await assert.rejects(
      () => reserve([line(1), line(other.stock + 5, other.id)]),
      OutOfStockError,
    );
    // Den första raden får inte ha dragits av trots att den ensam hade räckt.
    assert.equal(await stockFor(product.id), product.stock);
    assert.equal(await stockFor(other.id), other.stock);
  });

  it('berättar hur många som finns kvar', async () => {
    await reserve([line(product.stock - 2)]);
    try {
      await reserve([line(5)]);
      assert.fail('förväntade OutOfStockError');
    } catch (error) {
      assert.ok(error instanceof OutOfStockError);
      assert.match(error.fields[`stock.${product.id}`]!, /bara 2 st/);
    }
  });

  it('säger att varan är slut när saldot är noll', async () => {
    await reserve([line(product.stock)]);
    try {
      await reserve([line(1)]);
      assert.fail('förväntade OutOfStockError');
    } catch (error) {
      assert.ok(error instanceof OutOfStockError);
      assert.match(error.fields[`stock.${product.id}`]!, /slut i lager/);
    }
  });
});

describe('samtidiga köp', () => {
  it('låter inte två beställningar dela på samma sista exemplar', async () => {
    await reserve([line(product.stock - 1)]);
    // Båda försöken startar innan någon hunnit skriva – bara ett får lyckas.
    const results = await Promise.allSettled([reserve([line(1)]), reserve([line(1)])]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    assert.equal(ok, 1, 'exakt en av beställningarna ska gå igenom');
    assert.equal(await stockFor(product.id), 0);
  });

  it('håller ihop saldot när många köp sker samtidigt', async () => {
    const attempts = Array.from({ length: 12 }, () => reserve([line(2)]));
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    assert.equal(await stockFor(product.id), product.stock - ok * 2);
    assert.ok(await stockFor(product.id) >= 0, 'saldot får aldrig bli negativt');
  });
});
