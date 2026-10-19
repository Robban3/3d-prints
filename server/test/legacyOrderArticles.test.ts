import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

it('backfills legacy identities without changing historical prices or guessing renamed products', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'formlabb-legacy-articles-'));
  process.env.ORDER_STORE = join(directory, 'orders.json');
  process.env.ARTICLE_STORE = join(directory, 'articles.json');
  const { migrateOrderArticles } = await import('../src/store.ts');
  const original = [
    { id:'old-custom', type:'custom', total:123 },
    { id:'old-shop', type:'shop', lines:[
      { productId:1, name:'Original', color:'Grön', price:89 },
      { productId:1, name:'Annan gammal produkt', color:'Grön', price:50 },
      { productId:1, name:'Original', color:'Grön', price:70, articleNumber:'FL-P-0099-001' },
    ] },
  ];
  try {
    await writeFile(process.env.ORDER_STORE, JSON.stringify(original));
    const products = [{id:1,name:'Original',articleKey:'legacy:1',articles:[{color:'Grön',articleNumber:'FL-P-0001-001'}]}];
    await migrateOrderArticles(products as any);
    const result = JSON.parse(await readFile(process.env.ORDER_STORE, 'utf8'));
    assert.match(result[0].articleNumber, /^FL-K-\d{4,}$/);
    assert.equal(result[0].total,123);
    assert.equal(result[1].lines[0].articleNumber,'FL-P-0001-001');
    assert.equal(result[1].lines[0].price,89);
    assert.equal(result[1].lines[1].articleNumber,undefined);
    assert.equal(result[1].lines[2].articleNumber,'FL-P-0099-001');
    assert.deepEqual(JSON.parse(await readFile(`${process.env.ORDER_STORE}.before-articles.json`,'utf8')),original);
    await migrateOrderArticles(products as any);
    assert.deepEqual(JSON.parse(await readFile(process.env.ORDER_STORE,'utf8')),result);
  } finally {
    delete process.env.ORDER_STORE; delete process.env.ARTICLE_STORE;
    await rm(directory,{recursive:true,force:true});
  }
});
