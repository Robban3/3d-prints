import * as disk from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// One named container owns the shop. Its JSON state lives in private R2 storage,
// while local development continues to use files. Never fall back to disk when
// remote storage is unavailable: that would silently lose orders on restart.
let client: S3Client | undefined;
function remote() {
  const bucket = process.env.STATE_BUCKET;
  if (!bucket) return undefined;
  client ??= new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return { client, bucket };
}

function key(path: string): string {
  const name = relative(resolve(process.env.STATE_ROOT ?? '.'), resolve(path));
  if (name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name)) {
    throw new Error('State path must be within STATE_ROOT');
  }
  return (process.env.STATE_PREFIX ?? 'state/') + name.split(sep).join('/');
}

function missing(path: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`State file not found: ${path}`), { code: 'ENOENT' });
}

export async function readFile(path: string, encoding: 'utf8'): Promise<string> {
  const store = remote();
  if (!store) return disk.readFile(path, encoding);
  try {
    const object = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key(path) }));
    if (!object.Body) throw missing(path);
    return await object.Body.transformToString();
  } catch (error) {
    const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (value.name === 'NoSuchKey' || value.$metadata?.httpStatusCode === 404) throw missing(path);
    throw error;
  }
}

export async function writeFile(path: string, data: string, options?: 'utf8' | { mode: number }): Promise<void> {
  const store = remote();
  if (!store) { await disk.writeFile(path, data, options); return; }
  await store.client.send(new PutObjectCommand({
    Bucket: store.bucket, Key: key(path), Body: data,
    ContentType: path.endsWith('.eml') ? 'message/rfc822' : 'application/json',
  }));
}

export async function rm(path: string, options: { force: boolean }): Promise<void> {
  const store = remote();
  if (!store) return disk.rm(path, options);
  await store.client.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key(path) }));
}

export async function rename(from: string, to: string): Promise<void> {
  if (!remote()) return disk.rename(from, to);
  // R2 replaces each object atomically. Delete the temporary object only after
  // the final key has been successfully written.
  await writeFile(to, await readFile(from, 'utf8'));
  await rm(from, { force: true });
}

export async function readdir(path: string): Promise<string[]> {
  const store = remote();
  if (!store) return disk.readdir(path);
  const prefix = key(path).replace(/\/?$/, '/');
  const names: string[] = [];
  let continuation: string | undefined;
  do {
    const page = await store.client.send(new ListObjectsV2Command({
      Bucket: store.bucket, Prefix: prefix, ContinuationToken: continuation,
    }));
    for (const object of page.Contents ?? []) {
      const name = object.Key?.slice(prefix.length);
      if (name && !name.includes('/')) names.push(name);
    }
    continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuation);
  return names;
}

export function resetStateClient(): void { client?.destroy(); client = undefined; }
