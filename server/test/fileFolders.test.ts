import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import { admin } from '../src/adminRoutes.ts';
import { writeMeta, readMeta } from '../src/uploads.ts';
import { readFileFolders, saveFileFolder } from '../src/fileFolders.ts';
import { ValidationError } from '../src/validation.ts';

it('persists folders, serializes changes and preserves customer order links behind admin authentication', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'formlabb-file-folders-'));
  const variables = { FILE_FOLDERS_STORE: join(directory, 'folders.json'), UPLOAD_DIR: join(directory, 'uploads'), ORDER_STORE: join(directory, 'orders.json'), ADMIN_ACCOUNT_STORE: join(directory, 'account.json'), ADMIN_TOKEN: 'folder-test-only-key-0123456789' };
  Object.assign(process.env, variables);
  const own = await writeMeta({ id: 'a'.repeat(32), kind: 'library', originalName: 'del.stl', extension: '.stl', size: 4, createdAt: new Date().toISOString(), claimedBy: null });
  const customer = await writeMeta({ ...own, id: 'b'.repeat(32), kind: 'model', claimedBy: 'C-ORDER' });
  await writeMeta({ ...own, id: 'c'.repeat(32), kind: 'image', extension: '.png' });
  const app = express(); app.use(express.json()); app.use('/api', admin);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof ValidationError ? 400 : 500).json({ error: 'Invalid folder request' });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api`;
  const headers = { Authorization: `Bearer ${variables.ADMIN_TOKEN}`, 'Content-Type': 'application/json' };
  try {
    for (const [method, path] of [['POST', '/admin/file-folders'], ['PATCH', '/admin/file-folders/missing'], ['PATCH', `/admin/files/${own.id}/folder`], ['GET', '/admin/files']]) {
      assert.equal((await fetch(base + path, { method })).status, 401);
    }
    const created = await fetch(base + '/admin/file-folders', { method: 'POST', headers, body: JSON.stringify({ name: 'Julgranskula' }) });
    assert.equal(created.status, 201);
    const { folder } = await created.json() as { folder: { id: string; name: string } };
    const move = (id: string, folderId: string | null) => fetch(base + `/admin/files/${id}/folder`, { method: 'PATCH', headers, body: JSON.stringify({ folderId }) });
    const results = await Promise.all([move(own.id, folder.id), move(customer.id, folder.id)]);
    assert.deepEqual(results.map(result => result.status), [200, 200]);
    assert.equal((await readFileFolders()).assignments[customer.id], folder.id);
    assert.deepEqual(await readMeta(customer.id), customer);
    assert.equal((await move('c'.repeat(32), folder.id)).status, 400);
    assert.equal((await move(own.id, 'missing')).status, 400);
    const renamed = await fetch(base + `/admin/file-folders/${folder.id}`, { method: 'PATCH', headers, body: JSON.stringify({ name: 'Ny modell' }) });
    assert.equal(renamed.status, 200);
    assert.equal((await readFileFolders()).folders[0]?.name, 'Ny modell');
    await assert.rejects(async () => saveFileFolder('ny modell'), ValidationError);
    await assert.rejects(async () => saveFileFolder(''), ValidationError);
    assert.equal((await move(own.id, null)).status, 200);
    const listing = await (await fetch(base + '/admin/files', { headers })).json() as { files: {id: string; folderId: string | null}[] };
    assert.equal(listing.files.find(file => file.id === own.id)?.folderId, null);
    assert.equal(listing.files.find(file => file.id === customer.id)?.folderId, folder.id);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const name of Object.keys(variables)) delete process.env[name];
    await rm(directory, { recursive: true, force: true });
  }
});
