import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';

/**
 * Uppladdade modellfiler ligger på lokal disk som standard. I en driftmiljö där
 * disken är flyktig pekas de i stället mot objektlagring genom att sätta
 * S3_BUCKET – resten av koden går bara via funktionerna här.
 */
export interface StoredObject {
  body: Readable;
  size: number;
}

export interface Storage {
  readonly kind: 'disk' | 's3';
  put(key: string, localPath: string, contentType: string): Promise<void>;
  get(key: string, localPath: string): Promise<StoredObject | undefined>;
  remove(key: string, localPath: string): Promise<void>;
}

const diskStorage: Storage = {
  kind: 'disk',
  // Filen ligger redan på disk när multer skrivit den, så det finns inget att göra.
  async put() {},
  async get(_key, localPath) {
    try {
      const stats = await stat(localPath);
      if (!stats.isFile()) return undefined;
      return { body: createReadStream(localPath), size: stats.size };
    } catch {
      return undefined;
    }
  },
  async remove(_key, localPath) {
    await rm(localPath, { force: true });
  },
};

function s3Storage(bucket: string): Storage {
  // SDK:n laddas först när den behövs, så en butik på lokal disk slipper den.
  const client = import('@aws-sdk/client-s3').then(
    ({ S3Client }) =>
      new S3Client({
        region: process.env.S3_REGION ?? 'eu-north-1',
        ...(process.env.S3_ENDPOINT
          ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
          : {}),
      }),
  );
  const prefix = process.env.S3_PREFIX ?? 'uploads/';

  return {
    kind: 's3',
    async put(key, localPath, contentType) {
      const [{ PutObjectCommand }, s3] = await Promise.all([import('@aws-sdk/client-s3'), client]);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: prefix + key,
          Body: createReadStream(localPath),
          ContentType: contentType,
        }),
      );
      // Originalet behövs inte lokalt när det ligger i bucketen.
      await rm(localPath, { force: true });
    },
    async get(key) {
      const [{ GetObjectCommand }, s3] = await Promise.all([import('@aws-sdk/client-s3'), client]);
      try {
        const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: prefix + key }));
        if (!result.Body) return undefined;
        return { body: result.Body as Readable, size: Number(result.ContentLength ?? 0) };
      } catch {
        return undefined;
      }
    },
    async remove(key, localPath) {
      const [{ DeleteObjectCommand }, s3] = await Promise.all([
        import('@aws-sdk/client-s3'),
        client,
      ]);
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: prefix + key }));
      await rm(localPath, { force: true });
    },
  };
}

let current: Storage | undefined;

export function storage(): Storage {
  if (!current) {
    const bucket = process.env.S3_BUCKET;
    current = bucket ? s3Storage(bucket) : diskStorage;
  }
  return current;
}

/** Bara för tester. */
export function resetStorage(): void {
  current = undefined;
}
