import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { storage } from './storage.ts';
import type { ModelAnalysis } from './modelAnalysis.ts';

/** Format vi kan slica direkt eller konvertera i verkstaden. */
export const ALLOWED_EXTENSIONS = ['.stl', '.obj', '.3mf', '.step', '.stp', '.f3d'] as const;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Produktbilder laddas upp separat och har egna gränser. */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'] as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Video till startsidans hero. Bara format som alla webbläsare spelar – en
 * .mov från en telefon går inte att visa utan omkodning, och vi kodar inte om.
 */
export const VIDEO_EXTENSIONS = ['.mp4', '.webm'] as const;
/**
 * En hero-video laddas av varje besökare innan sidan känns klar, så gränsen är
 * satt lågt med flit. Det här är redan mycket för en kort loop.
 */
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

const MEDIA_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export function isImageExtension(extension: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

export function isVideoExtension(extension: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

/** Bild eller video – det som får visas öppet i butiken. */
export function isMediaExtension(extension: string): boolean {
  return isImageExtension(extension) || isVideoExtension(extension);
}

export function isAllowedImageName(fileName: string): boolean {
  return isImageExtension(extensionOf(fileName));
}

export function isAllowedMediaName(fileName: string): boolean {
  return isMediaExtension(extensionOf(fileName));
}

/** Innehållstypen för en bild eller video vi lagrar. */
export function mediaContentType(extension: string): string {
  return MEDIA_CONTENT_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

/** Behålls under sitt gamla namn; bilder och video delar tabell. */
export const imageContentType = mediaContentType;
/** Uppladdningar som aldrig kopplas till en order städas bort efter ett dygn. */
export const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ID_PATTERN = /^[0-9a-f]{32}$/;

export interface UploadMeta {
  id: string;
  /** Bilder och video visas öppet; modellfiler är knutna till en order. */
  kind?: 'model' | 'image' | 'video';
  /** Filnamnet kunden laddade upp – används bara som etikett, aldrig som sökväg. */
  originalName: string;
  extension: string;
  size: number;
  createdAt: string;
  /** Ordernumret som filen hör till, eller null så länge den är oanvänd. */
  claimedBy: string | null;
  /**
   * Skydd mot städningen fram till den här tidpunkten. En sparad offert
   * refererar till en fil som ingen order ännu äger, och den får inte
   * försvinna medan offerten fortfarande gäller.
   */
  heldUntil?: string;
  /** Uppmätt geometri, när formatet gick att läsa. Styr priset på kundunika jobb. */
  analysis?: ModelAnalysis;
  /** Varför uppmätningen inte gick att göra, när den misslyckades. */
  analysisError?: string;
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
 * Format vi över huvud taget lagrar – modellfiler, bilder eller video. Används
 * när metadata läses tillbaka, och är avsiktligt bredare än den som avgör vad
 * en kund får skicka in som modellfil.
 */
export function isStorableExtension(extension: string): boolean {
  return isAllowedExtension(extension) || isMediaExtension(extension);
}

/**
 * True för filer som hör till butikens innehåll i stället för till en order.
 * De städas aldrig bort som föräldralösa – de har ingen order att knytas till.
 */
export function isCatalogAsset(meta: UploadMeta): boolean {
  return meta.kind === 'image' || meta.kind === 'video';
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
  } catch {
    return undefined;
  }
}

export function filePathFor(meta: UploadMeta): string {
  return pathsFor(meta.id, meta.extension).file;
}

/**
 * Skjuter upp städningen av en fil som ingen order äger än. Används av sparade
 * offerter, som ska gå att beställa så länge de gäller.
 */
export async function holdUpload(id: string, until: Date): Promise<UploadMeta | undefined> {
  const meta = await readMeta(id);
  if (!meta) return undefined;
  const stamp = until.toISOString();
  // Ett längre skydd får aldrig kortas av ett senare, kortare.
  if (meta.heldUntil && meta.heldUntil >= stamp) return meta;
  return writeMeta({ ...meta, heldUntil: stamp });
}

/**
 * Kopierar en uppladdning till ett nytt id, så att samma modell kan beställas
 * igen. Originalet hör till sin order och lämnas i fred – en fil äger en order
 * och bara en, annars går det inte att se vilken beställning en fil tillhör.
 */
export async function cloneUpload(id: string): Promise<UploadMeta | undefined> {
  const source = await readMeta(id);
  if (!source) return undefined;

  const copyId = generateUploadId();
  const paths = pathsFor(copyId, source.extension);
  const object = await storage().get(
    storedFileName(source.id, source.extension),
    filePathFor(source),
  );
  if (!object) return undefined;

  await ensureUploadDir();
  await pipeline(object.body, createWriteStream(paths.file));
  await storage().put(
    storedFileName(copyId, source.extension),
    paths.file,
    'application/octet-stream',
  );

  // Kopian är ny och oanvänd: inget skydd och ingen order. Uppmätningen följer
  // med, eftersom det är samma fil och alltså samma siffror.
  const { heldUntil: _held, ...rest } = source;
  return writeMeta({
    ...rest,
    id: copyId,
    claimedBy: null,
    createdAt: new Date().toISOString(),
  });
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
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const meta = await readMeta(entry.slice(0, -'.json'.length));
    // Bilder och video hör till butikens innehåll och har ingen order att knytas till.
    if (!meta || meta.claimedBy || isCatalogAsset(meta)) continue;
    // En fil som en sparad offert pekar på får ligga kvar så länge offerten gäller.
    if (meta.heldUntil && new Date(meta.heldUntil).getTime() > now) continue;
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
