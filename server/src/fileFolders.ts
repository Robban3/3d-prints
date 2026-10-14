import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readFile, rename, writeFile } from './stateFiles.ts';
import { readMeta } from './uploads.ts';
import { ValidationError } from './validation.ts';

export interface FileFolder { id: string; name: string }
interface FolderStore { folders: FileFolder[]; assignments: Record<string, string> }
const storePath = () => resolve(process.env.FILE_FOLDERS_STORE ?? 'data/file-folders.json');
let queue: Promise<unknown> = Promise.resolve();

export async function readFileFolders(): Promise<FolderStore> {
  try { return JSON.parse(await readFile(storePath(), 'utf8')) as FolderStore; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { folders: [], assignments: {} };
    throw error;
  }
}

function mutate<T>(action: (store: FolderStore) => Promise<T> | T): Promise<T> {
  const run = queue.then(async () => {
    const store = await readFileFolders();
    const result = await action(store);
    const path = storePath();
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(store), 'utf8');
    await rename(temporary, path);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function saveFileFolder(value: unknown, id?: string): Promise<FileFolder> {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw new ValidationError({ name: 'Ange ett mappnamn på 1–100 tecken.' });
  return mutate(store => {
    if (store.folders.some(folder => folder.id !== id && folder.name.toLocaleLowerCase('sv') === name.toLocaleLowerCase('sv'))) {
      throw new ValidationError({ name: 'Det finns redan en mapp med det namnet.' });
    }
    if (id) {
      const folder = store.folders.find(folder => folder.id === id);
      if (!folder) throw new ValidationError({ folderId: 'Mappen finns inte.' });
      folder.name = name;
      return folder;
    }
    const folder = { id: randomUUID(), name };
    store.folders.push(folder);
    return folder;
  });
}

export function movePrintFile(id: string, folderId: unknown): Promise<void> {
  if (folderId !== null && typeof folderId !== 'string') throw new ValidationError({ folderId: 'Välj en mapp eller osorterade filer.' });
  return mutate(async store => {
    if (folderId !== null && !store.folders.some(folder => folder.id === folderId)) throw new ValidationError({ folderId: 'Mappen finns inte.' });
    const meta = await readMeta(id);
    if (!meta || meta.kind === 'image') throw new ValidationError({ fileId: 'Printfilen finns inte.' });
    if (folderId === null) delete store.assignments[id];
    else store.assignments[id] = folderId;
    // Only organization changes: object keys, order links and retention rules stay intact.
  });
}
