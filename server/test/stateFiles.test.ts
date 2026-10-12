import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm as removeDirectory, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, rename, rm, readdir, resetStateClient } from '../src/stateFiles.ts';
import { stockFor, setStock, resetStockCache } from '../src/stock.ts';
import { resetCatalogCache } from '../src/catalog.ts';

test('remote state survives restart and never falls back to ephemeral disk', async (t) => {
  const files = new Map<string, string>();
  let unavailable = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const key = decodeURIComponent(url.pathname.replace(/^\/shop\//, ''));
    if (unavailable) { res.writeHead(403); res.end('<Error><Code>AccessDenied</Code></Error>'); return; }
    if (url.searchParams.has('list-type')) {
      const prefix = url.searchParams.get('prefix') ?? '';
      res.setHeader('Content-Type', 'application/xml');
      res.end(`<ListBucketResult><IsTruncated>false</IsTruncated>${[...files.keys()].filter(name => name.startsWith(prefix)).map(name => `<Contents><Key>${name}</Key></Contents>`).join('')}</ListBucketResult>`);
    } else if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      files.set(key, Buffer.concat(chunks).toString()); res.end();
    } else if (req.method === 'DELETE') {
      files.delete(key); res.writeHead(204); res.end();
    } else if (files.has(key)) res.end(files.get(key));
    else { res.writeHead(404); res.end('<Error><Code>NoSuchKey</Code></Error>'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const root = await mkdtemp(join(tmpdir(), 'shop-state-'));
  const names = ['STATE_BUCKET', 'STATE_ROOT', 'STATE_PREFIX', 'S3_ENDPOINT', 'S3_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'STOCK_STORE', 'CATALOG_STORE'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    STATE_BUCKET: 'shop', STATE_ROOT: root, STATE_PREFIX: 'state/',
    S3_ENDPOINT: `http://127.0.0.1:${address.port}`, S3_REGION: 'auto',
    AWS_ACCESS_KEY_ID: 'test-key', AWS_SECRET_ACCESS_KEY: 'test-secret',
    STOCK_STORE: join(root, 'stock.json'), CATALOG_STORE: join(root, 'catalog.json'),
  });
  resetStateClient();
  try {
    const path = join(root, 'orders.json');
    await t.test('acknowledged writes survive a new client without a local copy', async () => {
      await writeFile(path, '[{"id":"S1"}]', 'utf8');
      await assert.rejects(access(path)); resetStateClient();
      assert.equal(await readFile(path, 'utf8'), '[{"id":"S1"}]');
    });
    await t.test('account replacement and metadata listing', async () => {
      const temporary = join(root, 'account.tmp');
      await writeFile(temporary, '{"hash":"saved"}', { mode: 0o600 });
      await rename(temporary, join(root, 'account.json'));
      assert.equal(await readFile(join(root, 'account.json'), 'utf8'), '{"hash":"saved"}');
      assert.deepEqual((await readdir(root)).sort(), ['account.json', 'orders.json']);
    });
    await t.test('missing and deleted objects report ENOENT', async () => {
      await rm(path, { force: true });
      await assert.rejects(readFile(path, 'utf8'), { code: 'ENOENT' });
    });
    await t.test('storage outages propagate without writing to disk', async () => {
      unavailable = true;
      await assert.rejects(writeFile(path, '[]'));
      await assert.rejects(readFile(path, 'utf8'), error => (error as NodeJS.ErrnoException).code !== 'ENOENT');
      await assert.rejects(access(path)); unavailable = false;
    });
    await t.test('paths outside STATE_ROOT are rejected', async () => {
      await assert.rejects(writeFile(join(root, '..', 'outside.json'), '{}'), /within STATE_ROOT/);
    });
    await t.test('failed stock writes do not change the cached or persisted balance', async () => {
      resetCatalogCache(); resetStockCache();
      await setStock('p-001', 12);
      unavailable = true;
      await assert.rejects(setStock('p-001', 2));
      assert.equal(await stockFor('p-001'), 12);
      unavailable = false; resetStockCache();
      assert.equal(await stockFor('p-001'), 12);
    });
  } finally {
    resetStateClient();
    resetStockCache(); resetCatalogCache();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
    await removeDirectory(root, { recursive: true, force: true });
  }
});
