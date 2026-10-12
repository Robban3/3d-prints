import { mkdir } from 'node:fs/promises';
import { readFile, rename, writeFile } from './stateFiles.ts';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const themeIds = ['nordic', 'studio', 'gallery', 'workshop'] as const;
export type ThemeId = (typeof themeIds)[number];
export interface Appearance { theme: ThemeId }
const settingsFile = () => resolve(process.env.APPEARANCE_STORE ?? 'data/appearance.json');
let queue: Promise<unknown> = Promise.resolve();

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themeIds.includes(value as ThemeId);
}

export async function readAppearance(): Promise<Appearance> {
  try {
    const parsed: unknown = JSON.parse(await readFile(settingsFile(), 'utf8'));
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
    return appearance;
  });
  queue = run.catch(() => undefined);
  return run;
}
