import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile as readDisk, rm as removeDisk, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFile, writeFile, rename, rm, readdir } from './stateFiles.ts';
import { extensionOf, isAllowedFileName, generateUploadId, MAX_LIBRARY_UPLOAD_BYTES, uploadDir, storedFileName, writeMeta, readMeta } from './uploads.ts';
import { movePrintFile } from './fileFolders.ts';
import { ValidationError } from './validation.ts';

export const LIBRARY_CHUNK_BYTES = 8 * 1024 * 1024;
interface Session { id: string; name: string; size: number; createdAt: string; expiresAt: number; remoteId: string | null; parts: Array<{ PartNumber: number; ETag: string }>; }
const queues = new Map<string, Promise<unknown>>();
const directory = () => join(uploadDir(), 'library-sessions');
const path = (id: string) => join(directory(), `${id}.json`);
const objectKey = (s: Session) => (process.env.S3_PREFIX ?? 'uploads/') + storedFileName(s.id, extensionOf(s.name));
let client: S3Client | undefined;
const remote = () => {
  if (!process.env.S3_BUCKET) return undefined;
  client ??= new S3Client({ region: process.env.S3_REGION ?? 'auto', endpoint: process.env.S3_ENDPOINT, forcePathStyle: Boolean(process.env.S3_ENDPOINT), requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  return client;
};
function serial<T>(id: string, action: () => Promise<T>): Promise<T> {
  const run = (queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(action);
  queues.set(id, run);
  void run.finally(() => { if (queues.get(id) === run) queues.delete(id); }).catch(() => undefined);
  return run;
}
async function session(id: string, allowExpired = false): Promise<Session> {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new ValidationError({ upload: 'Uppladdningen finns inte.' });
  let s: Session;
  try { s = JSON.parse(await readFile(path(id), 'utf8')) as Session; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ValidationError({ upload: 'Uppladdningen har löpt ut. Försök igen.' }); throw error; }
  if (!allowExpired && Date.now() > s.expiresAt) throw new ValidationError({ upload: 'Uppladdningen har löpt ut. Försök igen.' });
  return s;
}
const save = async (s: Session) => {
  const temporary = `${path(s.id)}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(s), 'utf8');
  await rename(temporary, path(s.id));
};

export async function startLibraryUpload(name: unknown, size: unknown) {
  if (typeof name !== 'string' || !name || name.length > 200 || !isAllowedFileName(name)) throw new ValidationError({ file: 'Välj STL, OBJ, 3MF, STEP, STP eller F3D.' });
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > MAX_LIBRARY_UPLOAD_BYTES) throw new ValidationError({ file: 'Filen får vara högst 150 MB och får inte vara tom.' });
  await mkdir(directory(), { recursive: true });
  const s: Session = { id: generateUploadId(), name, size, createdAt: new Date().toISOString(), expiresAt: Date.now() + 4 * 60 * 60 * 1000, remoteId: null, parts: [] };
  const s3 = remote();
  if (s3) {
    const result = await s3.send(new CreateMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey(s), ContentType: 'application/octet-stream' }), { abortSignal: AbortSignal.timeout(60000) });
    if (!result.UploadId) throw new Error('Could not start private multipart upload');
    s.remoteId = result.UploadId;
  }
  try { await save(s); }
  catch (error) { if (s3 && s.remoteId) await s3.send(new AbortMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey(s), UploadId: s.remoteId })).catch(() => undefined); throw error; }
  return { id: s.id, chunkBytes: LIBRARY_CHUNK_BYTES };
}

export function saveLibraryPart(id: string, partNumber: number, localPath: string, size: number) {
  return serial(id, async () => {
    const s = await session(id);
    const count = Math.ceil(s.size / LIBRARY_CHUNK_BYTES);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > count) throw new ValidationError({ upload: 'Ogiltig fildel.' });
    const expected = Math.min(LIBRARY_CHUNK_BYTES, s.size - (partNumber - 1) * LIBRARY_CHUNK_BYTES);
    if (size !== expected) throw new ValidationError({ upload: 'Fildelen är ofullständig. Försök igen.' });
    if (s.parts.some(part => part.PartNumber === partNumber)) return { receivedBytes: Math.min(s.parts.length * LIBRARY_CHUNK_BYTES, s.size) };
    if (partNumber !== s.parts.length + 1) throw new ValidationError({ upload: 'Fildelarna måste skickas i ordning.' });
    let etag = 'disk';
    const s3 = remote();
    if (s3 && s.remoteId) {
      const result = await s3.send(new UploadPartCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey(s), UploadId: s.remoteId, PartNumber: partNumber, Body: createReadStream(localPath), ContentLength: size }), { abortSignal: AbortSignal.timeout(60000) });
      if (!result.ETag) throw new Error('Missing multipart receipt');
      etag = result.ETag;
    } else {
      const target = join(uploadDir(), storedFileName(s.id, extensionOf(s.name)));
      const file = await open(target, partNumber === 1 ? 'w+' : 'r+');
      try {
        const data = await readDisk(localPath); let written = 0;
        while (written < data.length) { const result = await file.write(data, written, data.length - written, (partNumber - 1) * LIBRARY_CHUNK_BYTES + written); if (!result.bytesWritten) throw new Error('Could not write upload part'); written += result.bytesWritten; }
      } finally { await file.close(); }
    }
    s.parts.push({ PartNumber: partNumber, ETag: etag }); s.expiresAt = Date.now() + 4 * 60 * 60 * 1000; await save(s);
    return { receivedBytes: Math.min(s.parts.length * LIBRARY_CHUNK_BYTES, s.size) };
  });
}

export function finishLibraryUpload(id: string, folderId: unknown) {
  return serial(id, async () => {
    let meta = await readMeta(id);
    if (!meta) {
      const s = await session(id);
      if (s.parts.length !== Math.ceil(s.size / LIBRARY_CHUNK_BYTES)) throw new ValidationError({ upload: 'Alla fildelar har inte kommit fram.' });
      const s3 = remote();
      if (s3 && s.remoteId) {
        try { await s3.send(new CompleteMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey(s), UploadId: s.remoteId, MultipartUpload: { Parts: s.parts } }), { abortSignal: AbortSignal.timeout(60000) }); }
        catch (error) {
          // Completion may have succeeded before a connection/state write failed.
          const object = await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey(s) }), { abortSignal: AbortSignal.timeout(30000) }).catch(() => null);
          if (object?.ContentLength !== s.size) throw error;
        }
      } else if ((await stat(join(uploadDir(), storedFileName(s.id, extensionOf(s.name))))).size !== s.size) throw new Error('Incomplete local upload');
      meta = await writeMeta({ id, kind: 'library', originalName: s.name, extension: extensionOf(s.name), size: s.size, createdAt: s.createdAt, claimedBy: null });
    }
    if (meta.kind !== 'library') throw new ValidationError({ upload: 'Ogiltig biblioteksfil.' });
    let warning: string | undefined;
    if (typeof folderId === 'string' && folderId) {
      try { await movePrintFile(id, folderId); }
      catch { warning = 'Filen är sparad men kunde inte flyttas till mappen. Den finns bland osorterade filer.'; }
    }
    await rm(path(id), { force: true });
    return { id: meta.id, warning };
  });
}

export function abortLibraryUpload(id: string, expiredOnly = false) {
  return serial(id, async () => {
    const s = await session(id, true);
    if (expiredOnly && s.expiresAt >= Date.now()) return;
    if (await readMeta(id)) { await rm(path(id), { force: true }); return; }
    const s3 = remote();
    if (s3 && s.remoteId) await s3.send(new AbortMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey(s), UploadId: s.remoteId }), { abortSignal: AbortSignal.timeout(30000) });
    else await removeDisk(join(uploadDir(), storedFileName(s.id, extensionOf(s.name))), { force: true });
    await rm(path(id), { force: true });
  });
}

export async function sweepLibraryUploads() {
  let names: string[];
  try { names = await readdir(directory()); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  for (const name of names.filter(name => /^[a-f0-9]{32}\.json$/.test(name))) {
    const s = JSON.parse(await readFile(join(directory(), name), 'utf8')) as Session;
    if (s.expiresAt < Date.now()) {
      await abortLibraryUpload(s.id, true);
    }
  }
}
