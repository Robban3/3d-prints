import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, it } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { allProducts, createProduct, deleteProduct, resetCatalogCache, updateProduct } from '../src/catalog.ts';
import { customArticle, customModelIdentity } from '../src/articles.ts';
import { parseOrderLines } from '../src/validation.ts';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'formlabb-articles-'));
  process.env.CATALOG_STORE = join(directory, 'catalog.json');
  process.env.ARTICLE_STORE = join(directory, 'articles.json');
  resetCatalogCache();
});
afterEach(async () => {
  resetCatalogCache(); delete process.env.CATALOG_STORE; delete process.env.ARTICLE_STORE;
  await rm(directory, { recursive: true, force: true });
});

it('migrates all products and variants once, backs up the catalog, and survives restart', async () => {
  const products = await Promise.all([allProducts(), allProducts(), allProducts()]);
  assert.deepEqual(products[0], products[1]);
  const numbers = products[0]!.flatMap(product => [product.articleNumber!, ...product.articles!.map(article => article.articleNumber)]);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.ok(numbers.every(number => /^FL-P-\d{4,}(?:-\d{3,})?$/.test(number)));
  const before = await readFile(`${process.env.CATALOG_STORE}.before-articles.json`, 'utf8');
  assert.ok(!JSON.parse(before).products[0].articleNumber);
  resetCatalogCache();
  assert.deepEqual(await allProducts(), products[0]);
});

it('keeps variant numbers when reordered or renamed, ignores injected numbers and never reuses deleted family numbers', async () => {
  const sample = (await allProducts())[0]!;
  const created = await createProduct({ ...sample, slug: 'article-test', name: 'Artikeltest' });
  const updated = await updateProduct(created.id, { name: 'Nytt namn', colors: [...created.colors].reverse(), articleNumber: 'FL-P-9999', articles: [], articleKey: 'forged' });
  assert.equal(updated.articleNumber, created.articleNumber);
  assert.deepEqual([...updated.articles!].sort((a,b) => a.articleNumber.localeCompare(b.articleNumber)), [...created.articles!].sort((a,b) => a.articleNumber.localeCompare(b.articleNumber)));
  await deleteProduct(created.id);
  const replacement = await createProduct({ ...sample, slug: 'article-replacement' });
  assert.equal(replacement.id, created.id);
  assert.notEqual(replacement.articleNumber, created.articleNumber);
});

it('keeps retired variants reserved and restores the same number if a color comes back', async () => {
  const sample = (await allProducts())[0]!;
  const created = await createProduct({ ...sample, slug: 'colors-test', colors: ['A', 'B'] });
  const b = created.articles!.find(article => article.color === 'B')!.articleNumber;
  await updateProduct(created.id, { colors: ['A'] });
  const restored = await updateProduct(created.id, { colors: ['A', 'C', 'B'] });
  assert.equal(restored.articles!.find(article => article.color === 'B')!.articleNumber, b);
  assert.notEqual(restored.articles!.find(article => article.color === 'C')!.articleNumber, b);
});

it('allocates concurrent customer jobs uniquely and reuses exact customer/model/settings identities', async () => {
  const numbers = await Promise.all(Array.from({length:30}, (_,i) => customArticle(`job:${i}`)));
  assert.equal(new Set(numbers).size, 30);
  assert.match(numbers[0]!, /^FL-K-\d{4,}$/);
  assert.equal(await customArticle('job:0'), numbers[0]);
  const request = { material:'pla', quality:'standard', infill:20, quantity:1, volumeCm3:10, rush:false, postProcessing:false };
  const identity = customModelIdentity('Customer@example.com', 'a'.repeat(64), request);
  assert.equal(identity, customModelIdentity(' customer@example.com ', 'a'.repeat(64), {...request,quantity:5}));
  assert.notEqual(identity, customModelIdentity('other@example.com', 'a'.repeat(64), request));
  assert.notEqual(identity, customModelIdentity('customer@example.com', 'b'.repeat(64), request));
  assert.notEqual(identity, customModelIdentity('customer@example.com', 'a'.repeat(64), {...request,material:'petg'}));
});

it('takes the article and production snapshot from the server, not from the buyer', async () => {
  const product = (await allProducts())[0]!;
  const [line] = await parseOrderLines([{productId:product.id,quantity:1,articleNumber:'FL-P-9999-999',productionSpecs:{weightGrams:1}}]);
  assert.equal(line!.articleNumber, product.articles![0]!.articleNumber);
  assert.equal(line!.productionSpecs!.weightGrams, product.sizes?.[0]?.weightGrams ?? product.weightGrams);
  const snapshot = structuredClone(line);
  await updateProduct(product.id,{dimensions:{width:1,depth:1,height:1},price:999});
  assert.deepEqual(line, snapshot);
});

it('fails closed on a broken registry and does not return a half-migrated cached catalog', async () => {
  await writeFile(process.env.ARTICLE_STORE!, '{broken', 'utf8');
  await assert.rejects(() => allProducts());
  await assert.rejects(() => allProducts());
  await writeFile(process.env.ARTICLE_STORE!, JSON.stringify({version:1,entries:[]}), 'utf8');
  await assert.rejects(() => allProducts());
});
