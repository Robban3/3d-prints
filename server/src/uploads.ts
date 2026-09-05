import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

/** Format vi kan slica direkt eller konvertera i verkstaden. */
export const ALLOWED_EXTENSIONS = ['.stl', '.obj', '.3mf', '.step', '.stp', '.f3d'] as const;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Uppladdningar som aldrig kopplas till en order städas bort efter ett dygn. */
export const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ID_PATTERN = /^[0-9a-f]{32}$/;

export interface UploadMeta {
  id: string;
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

export function isAllowedExtension(extension: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
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
    return isAllowedExtension(parsed.extension) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function filePathFor(meta: UploadMeta): string {
  return pathsFor(meta.id, meta.extension).file;
}

/** Kopplar en uppladdning till en order så att den inte städas bort eller återanvänds. */
export async function claimUpload(id: string, orderId: string): Promise<UploadMeta | undefined> {
  const meta = await readMeta(id);
  if (!meta || meta.claimedBy) return undefined;
  return writeMeta({ ...meta, claimedBy: orderId });
}

export async function deleteUpload(id: string): Promise<boolean> {
  const meta = await readMeta(id);
  if (!meta) return false;
  const paths = pathsFor(meta.id, meta.extension);
  await rm(paths.file, { force: true });
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
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const meta = await readMeta(entry.slice(0, -'.json'.length));
    if (!meta || meta.claimedBy) continue;
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
