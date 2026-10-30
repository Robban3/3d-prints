import { mkdir } from 'node:fs/promises';
import { readFile, rename, writeFile } from './stateFiles.ts';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const themeIds = ['nordic', 'studio', 'gallery', 'workshop', 'halloween', 'forest', 'coastal'] as const;
export type ThemeId = (typeof themeIds)[number];
export interface Appearance { theme: ThemeId }
const settingsFile = () => resolve(process.env.APPEARANCE_STORE ?? 'data/appearance.json');
let queue: Promise<unknown> = Promise.resolve();
let cached: { file: string; value: Appearance } | undefined;
let reading: { file: string; promise: Promise<Appearance> } | undefined;
let revision = 0;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themeIds.includes(value as ThemeId);
}

export async function readAppearance(): Promise<Appearance> {
  const file = settingsFile();
  if (cached?.file === file) return { ...cached.value };
  if (reading?.file === file) return reading.promise;
  const version = revision;
  const promise = loadAppearance(file).then(value => {
    if (version === revision) cached = { file, value };
    return { ...value };
  }).finally(() => { if (reading?.promise === promise) reading = undefined; });
  reading = { file, promise };
  return promise;
}

async function loadAppearance(file: string): Promise<Appearance> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !('theme' in parsed) || !isThemeId(parsed.theme)) {
      throw new Error('Ogiltiga temainställningar i lagringen.');
    }
    return { theme: parsed.theme };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { theme: 'nordic' };
    throw error;
  }
}

export function saveAppearance(theme: ThemeId): Promise<Appearance> {
  const file = settingsFile();
  const run = queue.then(async () => {
    const appearance = { theme };
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(appearance, null, 2), 'utf8');
    await rename(temporary, file);
    // All writes go through this process: update immediately after persistence.
    revision++;
    cached = { file, value: appearance };
    return appearance;
  });
  queue = run.catch(() => undefined);
  return run;
}
