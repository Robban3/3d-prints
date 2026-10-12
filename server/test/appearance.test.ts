import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { admin } from '../src/adminRoutes.ts';
import { api } from '../src/routes.ts';
import { readAppearance } from '../src/appearance.ts';

let directory: string;
let server: Server;
let base: string;
const key = 'theme-test-key-0123456789';

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'formlabb-themes-'));
  process.env.APPEARANCE_STORE = join(directory, 'appearance.json');
  process.env.AUDIT_STORE = join(directory, 'audit.json');
  process.env.ADMIN_TOKEN = key;
  const app = express();
  app.use(express.json());
  app.use('/api', admin, api);
  await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  base = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  // directory is the exact mkdtemp result owned by this test.
  await rm(directory, { recursive: true, force: true });
  delete process.env.APPEARANCE_STORE;
  delete process.env.AUDIT_STORE;
  delete process.env.ADMIN_TOKEN;
});

describe('butikens teman', () => {
  it('visar Nordisk jul som standard utan lagrad inställning', async () => {
    const response = await fetch(`${base}/appearance`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { appearance: { theme: 'nordic' } });
  });

  it('kräver adminnyckel för både läsning och aktivering i admin', async () => {
    for (const method of ['GET', 'PUT']) {
      const response = await fetch(`${base}/admin/appearance`, {
        method, headers: { 'Content-Type': 'application/json' },
        ...(method === 'PUT' ? { body: JSON.stringify({ theme: 'gallery' }) } : {}),
      });
      assert.equal(response.status, 401);
    }
    assert.deepEqual(await readAppearance(), { theme: 'nordic' });
  });

  it('avvisar okända teman utan att ändra det publicerade temat', async () => {
    const response = await fetch(`${base}/admin/appearance`, {
      method: 'PUT', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: '../../other' }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await readAppearance(), { theme: 'nordic' });
  });

  it('sparar alla fyra teman på disk och visar dem för en ny besökare', async () => {
    for (const theme of ['studio', 'gallery', 'workshop', 'nordic']) {
      const saved = await fetch(`${base}/admin/appearance`, {
        method: 'PUT', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), { appearance: { theme } });
      assert.deepEqual(JSON.parse(await readFile(join(directory, 'appearance.json'), 'utf8')), { theme });
      const visitor = await fetch(`${base}/appearance`);
      assert.deepEqual(await visitor.json(), { appearance: { theme } });
    }
    const audit = JSON.parse(await readFile(join(directory, 'audit.json'), 'utf8'));
    assert.equal(audit.length, 4);
    assert.equal(audit[0].entity, 'tema');
  });

  it('låter en inloggad admin arbeta utan att förbruka skyddet mot nyckelgissningar', async () => {
    for (let index = 0; index < 32; index += 1) {
      const response = await fetch(`${base}/admin/appearance`, { headers: { Authorization: `Bearer ${key}` } });
      assert.equal(response.status, 200);
    }
    let lastStatus = 0;
    for (let index = 0; index < 31; index += 1) {
      const response = await fetch(`${base}/admin/appearance`, { headers: { Authorization: 'Bearer wrong-key' } });
      lastStatus = response.status;
    }
    assert.equal(lastStatus, 429);
    const adminResponse = await fetch(`${base}/admin/appearance`, { headers: { Authorization: `Bearer ${key}` } });
    assert.equal(adminResponse.status, 200);
  });
});
