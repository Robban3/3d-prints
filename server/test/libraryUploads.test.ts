import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import { createServer } from 'node:http';
import { uploads } from '../src/uploadRoutes.ts';
import { startLibraryUpload, saveLibraryPart, finishLibraryUpload, abortLibraryUpload, LIBRARY_CHUNK_BYTES } from '../src/libraryUploads.ts';
import { readMeta, filePathFor } from '../src/uploads.ts';
import { saveFileFolder, readFileFolders } from '../src/fileFolders.ts';
import { ValidationError } from '../src/validation.ts';

it('accepts 150 MB, persists ordered parts, rejects incomplete files and supports safe retries and cancellation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'formlabb-large-upload-'));
  process.env.UPLOAD_DIR = join(directory, 'uploads');
  process.env.FILE_FOLDERS_STORE = join(directory, 'folders.json');
  process.env.ADMIN_ACCOUNT_STORE = join(directory, 'account.json');
  process.env.ADMIN_TOKEN = 'multipart-test-only-key-0123456789';
  const app = express(); app.use(express.json()); app.use('/api', uploads);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api/admin/files/uploads`;
  try {
    for (const [method, suffix] of [['POST', ''], ['PUT', '/unknown/parts/1'], ['POST', '/unknown/complete'], ['DELETE', '/unknown']]) {
      assert.equal((await fetch(base + suffix, { method })).status, 401);
    }
    await assert.rejects(startLibraryUpload('large.stl', 150 * 1024 * 1024 + 1), ValidationError);
    const large = await startLibraryUpload('large.stl', 150 * 1024 * 1024);
    await abortLibraryUpload(large.id);
    assert.equal(await readMeta(large.id), undefined);
    const folder = await saveFileFolder('Modellens delar');
    const s = await startLibraryUpload('part.stl', LIBRARY_CHUNK_BYTES + 4);
    const chunk = join(directory, 'chunk.bin');
    const first = Buffer.alloc(LIBRARY_CHUNK_BYTES, 65);
    await writeFile(chunk, first);
    const wire = await startLibraryUpload('wire.stl', LIBRARY_CHUNK_BYTES);
    const form = new FormData(); form.append('file', new Blob([first]), 'chunk.bin');
    const wireResponse = await fetch(`${base}/${wire.id}/parts/1`, { method: 'PUT', headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` }, body: form });
    assert.equal(wireResponse.status, 200, await wireResponse.text());
    await finishLibraryUpload(wire.id, null);
    assert.equal((await readMeta(wire.id))?.size, LIBRARY_CHUNK_BYTES);
    await assert.rejects(saveLibraryPart(s.id, 2, chunk, first.length), ValidationError);
    await saveLibraryPart(s.id, 1, chunk, first.length);
    await saveLibraryPart(s.id, 1, chunk, first.length); // repeated acknowledgment never appends twice
    assert.equal(await readMeta(s.id), undefined);
    await assert.rejects(finishLibraryUpload(s.id, folder.id), ValidationError);
    await writeFile(chunk, 'TAIL');
    await saveLibraryPart(s.id, 2, chunk, 4);
    assert.deepEqual(await finishLibraryUpload(s.id, folder.id), { id: s.id, warning: undefined });
    await finishLibraryUpload(s.id, folder.id); // lost completion receipt is safe to retry
    const meta = await readMeta(s.id); assert.ok(meta);
    assert.equal(meta.size, LIBRARY_CHUNK_BYTES + 4);
    const body = await readFile(filePathFor(meta));
    assert.equal(body.length, LIBRARY_CHUNK_BYTES + 4);
    assert.equal(body.subarray(-4).toString(), 'TAIL');
    assert.equal((await readFileFolders()).assignments[s.id], folder.id);
    const cancel = await startLibraryUpload('cancel.stl', LIBRARY_CHUNK_BYTES + 4);
    await writeFile(chunk, first); await saveLibraryPart(cancel.id, 1, chunk, first.length);
    await abortLibraryUpload(cancel.id);
    assert.equal(await readMeta(cancel.id), undefined);
    await assert.rejects(access(join(process.env.UPLOAD_DIR!, `${cancel.id}.stl`)));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const name of ['UPLOAD_DIR','FILE_FOLDERS_STORE','ADMIN_ACCOUNT_STORE','ADMIN_TOKEN']) delete process.env[name];
    await rm(directory, { recursive: true, force: true });
  }
});

it('uses private S3 multipart requests, commits all bytes and aborts unfinished remote uploads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'formlabb-r2-multipart-'));
  const parts = new Map<number, Buffer>(); let complete = Buffer.alloc(0); let aborted = false;
  const fake = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (req.method === 'POST' && url.searchParams.has('uploads')) {
      res.setHeader('Content-Type', 'application/xml'); res.end('<InitiateMultipartUploadResult><Bucket>private-test</Bucket><Key>test</Key><UploadId>remote-test-id</UploadId></InitiateMultipartUploadResult>');
    } else if (req.method === 'PUT') {
      const number = Number(url.searchParams.get('partNumber')); parts.set(number, Buffer.concat(chunks));
      res.setHeader('ETag', `"part-${number}"`); res.end();
    } else if (req.method === 'POST') {
      complete = Buffer.concat([...parts.entries()].sort(([a], [b]) => a - b).map(([, value]) => value));
      res.setHeader('Content-Type', 'application/xml'); res.end('<CompleteMultipartUploadResult><Bucket>private-test</Bucket><Key>test</Key><ETag>"complete"</ETag></CompleteMultipartUploadResult>');
    } else if (req.method === 'DELETE') { aborted = true; res.writeHead(204); res.end(); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => fake.listen(0, '127.0.0.1', resolve));
  const address = fake.address(); assert.ok(address && typeof address === 'object');
  const variables = { UPLOAD_DIR: join(directory, 'uploads'), FILE_FOLDERS_STORE: join(directory, 'folders.json'), S3_BUCKET: 'private-test', S3_ENDPOINT: `http://127.0.0.1:${address.port}`, S3_REGION: 'auto', AWS_ACCESS_KEY_ID: 'test-only', AWS_SECRET_ACCESS_KEY: 'test-only' };
  Object.assign(process.env, variables);
  try {
    const s = await startLibraryUpload('remote.stl', LIBRARY_CHUNK_BYTES + 4);
    const chunk = join(directory, 'chunk.bin');
    await writeFile(chunk, Buffer.alloc(LIBRARY_CHUNK_BYTES, 66));
    await saveLibraryPart(s.id, 1, chunk, LIBRARY_CHUNK_BYTES);
    await writeFile(chunk, 'DONE'); await saveLibraryPart(s.id, 2, chunk, 4);
    await finishLibraryUpload(s.id, null);
    assert.equal(complete.length, LIBRARY_CHUNK_BYTES + 4);
    assert.equal(complete.subarray(-4).toString(), 'DONE');
    assert.equal((await readMeta(s.id))?.kind, 'library');
    const canceled = await startLibraryUpload('cancel.stl', 4); await abortLibraryUpload(canceled.id);
    assert.equal(aborted, true);
    assert.equal(await readMeta(canceled.id), undefined);
  } finally {
    await new Promise<void>(resolve => fake.close(() => resolve()));
    for (const name of Object.keys(variables)) delete process.env[name];
    await rm(directory, { recursive: true, force: true });
  }
});
