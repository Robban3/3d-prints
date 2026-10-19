import { randomBytes } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { readFile, readdir, rm, writeFile } from './stateFiles.ts';
import { extname, join, resolve } from 'node:path';
import { storage } from './storage.ts';

/** Format vi kan slica direkt eller konvertera i verkstaden. */
export const ALLOWED_EXTENSIONS = ['.stl', '.obj', '.3mf', '.step', '.stp', '.f3d'] as const;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_LIBRARY_UPLOAD_BYTES = 150 * 1024 * 1024;

/** Produktbilder laddas upp separat och har egna gränser. */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'] as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

export function isImageExtension(extension: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

export function isAllowedImageName(fileName: string): boolean {
  return isImageExtension(extensionOf(fileName));
}

export function imageContentType(extension: string): string {
  return IMAGE_CONTENT_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}
/** Uppladdningar som aldrig kopplas till en order städas bort efter ett dygn. */
export const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ID_PATTERN = /^[0-9a-f]{32}$/;

export interface UploadMeta {
  /** Fingerprint of customer model bytes; not returned by the public upload endpoint. */
  sha256?: string;
  id: string;
  /** Produktbilder visas öppet; modellfiler är knutna till en order. */
  kind?: 'model' | 'image' | 'library';
  /** Filnamnet kunden laddade upp – används bara som etikett, aldrig som sökväg. */
  originalName: string;
  extension: string;
  size: number;
  createdAt: string;
  /** Ordernumret som filen hör till, eller null så länge den är oanvänd. */
  claimedBy: string | null;
}

export function uploadDir(): string {
  return resolve(process.env.UPLOAD_DIR ?? 'uploads');
}

export function ensureUploadDir(): Promise<string | undefined> {
  return mkdir(uploadDir(), { recursive: true });
}

/** Slumpat namn på disk – kundens filnamn får aldrig styra var något skrivs. */
export function generateUploadId(): string {
  return randomBytes(16).toString('hex');
}

export function extensionOf(fileName: string): string {
  return extname(fileName).toLowerCase();
}

/** Format som duger som modellfil till ett printjobb. */
export function isAllowedExtension(extension: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

/**
 * Format vi över huvud taget lagrar – modellfiler eller produktbilder. Används
 * när metadata läses tillbaka, och är avsiktligt bredare än den som avgör vad
 * en kund får skicka in som modellfil.
 */
export function isStorableExtension(extension: string): boolean {
  return isAllowedExtension(extension) || isImageExtension(extension);
}

export function isAllowedFileName(fileName: string): boolean {
  return isAllowedExtension(extensionOf(fileName));
}

function pathsFor(id: string, extension: string) {
  const dir = uploadDir();
  return { file: join(dir, `${id}${extension}`), meta: join(dir, `${id}.json`) };
}

export function storedFileName(id: string, extension: string): string {
  return `${id}${extension}`;
}

export async function writeMeta(meta: UploadMeta): Promise<UploadMeta> {
  await ensureUploadDir();
  await writeFile(pathsFor(meta.id, meta.extension).meta, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

export async function readMeta(id: string): Promise<UploadMeta | undefined> {
  // Id:t kommer från en URL, så det får aldrig gå vidare till filsystemet ovalidat.
  if (!ID_PATTERN.test(id)) return undefined;
  try {
    const raw = await readFile(join(uploadDir(), `${id}.json`), 'utf8');
    const parsed = JSON.parse(raw) as UploadMeta;
    // Metadatan styr vilken fil vi öppnar, så ändelsen kontrolleras även här.
    return isStorableExtension(parsed.extension) ? parsed : undefined;
  } catch (error) {
    if (process.env.STATE_BUCKET && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
}

export function filePathFor(meta: UploadMeta): string {
  return pathsFor(meta.id, meta.extension).file;
}

export async function listModelFiles(): Promise<UploadMeta[]> {
  let entries: string[];
  try { entries = await readdir(uploadDir()); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const files = await Promise.all(entries.filter(name => /^[0-9a-f]{32}\.json$/.test(name)).map(name => readMeta(name.slice(0, -5))));
  return files.filter((meta): meta is UploadMeta => Boolean(meta && isAllowedExtension(meta.extension)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Kopplar en uppladdning till en order så att den inte städas bort eller återanvänds. */
let ownershipQueue: Promise<unknown> = Promise.resolve();
function serializeOwnership<T>(action: () => Promise<T>): Promise<T> {
  const result = ownershipQueue.then(action, action);
  ownershipQueue = result.catch(() => undefined);
  return result;
}
export function claimUpload(id: string, orderId: string): Promise<UploadMeta | undefined> {
  return serializeOwnership(async () => {
    const meta = await readMeta(id);
    if (!meta || meta.claimedBy || meta.kind === 'library' || meta.kind === 'image') return undefined;
    return writeMeta({ ...meta, claimedBy: orderId });
  });
}
export function releaseUpload(id: string, orderId: string): Promise<void> {
  return serializeOwnership(async () => {
    const meta = await readMeta(id);
    if (meta?.claimedBy === orderId && meta.kind !== 'image' && meta.kind !== 'library') {
      await writeMeta({ ...meta, claimedBy: null });
    }
  });
}

export async function deleteUpload(id: string): Promise<boolean> {
  const meta = await readMeta(id);
  if (!meta) return false;
  const paths = pathsFor(meta.id, meta.extension);
  await storage().remove(storedFileName(meta.id, meta.extension), paths.file);
  await rm(paths.meta, { force: true });
  return true;
}

/**
 * Tar bort filer som laddats upp men aldrig blev en order. Körs periodiskt så att
 * avbrutna beställningar inte fyller disken.
 */
export async function sweepOrphans(
  maxAgeMs = ORPHAN_MAX_AGE_MS,
  now = Date.now(),
): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(uploadDir());
  } catch (error) {
    if (process.env.STATE_BUCKET && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return 0;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const meta = await readMeta(entry.slice(0, -'.json'.length));
    // Bilder hör till katalogen och har ingen order att knytas till.
    if (!meta || meta.claimedBy || meta.kind === 'image' || meta.kind === 'library') continue;
    if (now - new Date(meta.createdAt).getTime() < maxAgeMs) continue;
    await deleteUpload(meta.id);
    removed += 1;
  }
  return removed;
}

export async function uploadExists(meta: UploadMeta): Promise<boolean> {
  try {
    const stats = await stat(filePathFor(meta));
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Enkel takgräns per IP. Uppladdningen kräver ingen inloggning, så utan en gräns
 * kan vem som helst fylla disken med 100 MB åt gången.
 */
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_FILES = 20;
const RATE_MAX_BYTES = 500 * 1024 * 1024;
const buckets = new Map<string, Array<{ at: number; bytes: number }>>();
const rateExpiryTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entries] of buckets) {
    const recent = entries.filter(entry => now - entry.at < RATE_WINDOW_MS);
    if (recent.length) buckets.set(key, recent); else buckets.delete(key);
  }
}, 60000);
rateExpiryTimer.unref();

export function rateLimitStatus(
  key: string,
  now = Date.now(),
): { allowed: boolean; reason?: string } {
  const recent = (buckets.get(key) ?? []).filter((entry) => now - entry.at < RATE_WINDOW_MS);
  buckets.set(key, recent);
  if (recent.length >= RATE_MAX_FILES) {
    return {
      allowed: false,
      reason: 'Du har laddat upp många filer den senaste timmen. Försök igen senare.',
    };
  }
  const bytes = recent.reduce((sum, entry) => sum + entry.bytes, 0);
  if (bytes >= RATE_MAX_BYTES) {
    return {
      allowed: false,
      reason:
        'Uppladdningsgränsen för den här timmen är nådd. Hör av dig så löser vi det manuellt.',
    };
  }
  return { allowed: true };
}

export function recordUpload(key: string, bytes: number, now = Date.now()): void {
  const recent = (buckets.get(key) ?? []).filter((entry) => now - entry.at < RATE_WINDOW_MS);
  recent.push({ at: now, bytes });
  buckets.set(key, recent);
}

export function resetRateLimits(): void {
  buckets.clear();
}
