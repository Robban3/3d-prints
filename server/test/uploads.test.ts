import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ORPHAN_MAX_AGE_MS,
  claimUpload,
  cloneUpload,
  holdUpload,
  deleteUpload,
  extensionOf,
  filePathFor,
  generateUploadId,
  isAllowedFileName,
  rateLimitStatus,
  readMeta,
  recordUpload,
  resetRateLimits,
  storedFileName,
  sweepOrphans,
  uploadDir,
  uploadExists,
  writeMeta,
} from '../src/uploads.ts';
import type { UploadMeta } from '../src/uploads.ts';

let dir: string;
const previous = process.env.UPLOAD_DIR;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-uploads-'));
  process.env.UPLOAD_DIR = dir;
  resetRateLimits();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (previous === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previous;
});

async function seed(overrides: Partial<UploadMeta> = {}): Promise<UploadMeta> {
  const meta: UploadMeta = {
    id: generateUploadId(),
    originalName: 'fäste.stl',
    extension: '.stl',
    size: 2048,
    createdAt: new Date().toISOString(),
    claimedBy: null,
    ...overrides,
  };
  await writeMeta(meta);
  await writeFile(filePathFor(meta), 'solid test\nendsolid test\n', 'utf8');
  return meta;
}

describe('filnamn och format', () => {
  it('accepterar de format vi kan printa, oavsett skiftläge', () => {
    assert.ok(isAllowedFileName('modell.stl'));
    assert.ok(isAllowedFileName('MODELL.STL'));
    assert.ok(isAllowedFileName('del.3mf'));
    assert.ok(isAllowedFileName('ritning.step'));
  });

  it('avvisar format vi inte tar emot', () => {
    assert.equal(isAllowedFileName('skadlig.exe'), false);
    assert.equal(isAllowedFileName('bild.png'), false);
    assert.equal(isAllowedFileName('utan-ändelse'), false);
    assert.equal(isAllowedFileName('modell.stl.exe'), false);
  });

  it('ger varje uppladdning ett unikt slumpat id', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateUploadId()));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.match(id, /^[0-9a-f]{32}$/);
  });

  it('bygger filnamnet på disk av id:t, inte av kundens filnamn', () => {
    const id = generateUploadId();
    assert.equal(storedFileName(id, extensionOf('../../etc/passwd.stl')), `${id}.stl`);
  });
});

describe('metadata', () => {
  it('sparar och läser tillbaka en uppladdning', async () => {
    const meta = await seed();
    const loaded = await readMeta(meta.id);
    assert.equal(loaded?.originalName, 'fäste.stl');
    assert.equal(loaded?.claimedBy, null);
    assert.ok(await uploadExists(loaded!));
  });

  it('vägrar läsa id:n som inte är rena hexsträngar', async () => {
    await seed();
    assert.equal(await readMeta('../../../etc/passwd'), undefined);
    assert.equal(await readMeta('..%2F..%2Fpasswd'), undefined);
    assert.equal(await readMeta(''), undefined);
    assert.equal(await readMeta('ZZZZ'), undefined);
  });

  it('svarar med undefined för en uppladdning som inte finns', async () => {
    assert.equal(await readMeta(generateUploadId()), undefined);
  });
});

describe('claimUpload', () => {
  it('kopplar filen till ordern', async () => {
    const meta = await seed();
    const claimed = await claimUpload(meta.id, 'C2026-ABC123');
    assert.equal(claimed?.claimedBy, 'C2026-ABC123');
    assert.equal((await readMeta(meta.id))?.claimedBy, 'C2026-ABC123');
  });

  it('låter inte samma fil kopplas till två ordrar', async () => {
    const meta = await seed();
    await claimUpload(meta.id, 'C2026-FIRST1');
    assert.equal(await claimUpload(meta.id, 'C2026-SECOND'), undefined);
    assert.equal((await readMeta(meta.id))?.claimedBy, 'C2026-FIRST1');
  });
});

describe('deleteUpload', () => {
  it('tar bort både filen och metadatan', async () => {
    const meta = await seed();
    assert.equal(await deleteUpload(meta.id), true);
    assert.equal(existsSync(filePathFor(meta)), false);
    assert.equal(await readMeta(meta.id), undefined);
    assert.deepEqual(await readdir(uploadDir()), []);
  });

  it('svarar false för en fil som inte finns', async () => {
    assert.equal(await deleteUpload(generateUploadId()), false);
  });
});

describe('sweepOrphans', () => {
  it('städar bort gamla uppladdningar som aldrig blev en order', async () => {
    const gammal = await seed({
      createdAt: new Date(Date.now() - ORPHAN_MAX_AGE_MS - 1000).toISOString(),
    });
    const removed = await sweepOrphans();
    assert.equal(removed, 1);
    assert.equal(await readMeta(gammal.id), undefined);
  });

  it('rör inte filer som hör till en order', async () => {
    const bestalld = await seed({
      createdAt: new Date(Date.now() - ORPHAN_MAX_AGE_MS - 1000).toISOString(),
      claimedBy: 'C2026-ABC123',
    });
    assert.equal(await sweepOrphans(), 0);
    assert.ok(await readMeta(bestalld.id));
  });

  it('rör inte färska uppladdningar', async () => {
    const fresh = await seed();
    assert.equal(await sweepOrphans(), 0);
    assert.ok(await readMeta(fresh.id));
  });
});

describe('rateLimitStatus', () => {
  it('släpper igenom normal användning', () => {
    recordUpload('1.2.3.4', 1024);
    assert.equal(rateLimitStatus('1.2.3.4').allowed, true);
  });

  it('stoppar den som laddar upp för många filer på en timme', () => {
    for (let i = 0; i < 20; i += 1) recordUpload('1.2.3.4', 1024);
    assert.equal(rateLimitStatus('1.2.3.4').allowed, false);
    assert.equal(rateLimitStatus('5.6.7.8').allowed, true);
  });

  it('stoppar den som laddar upp för många byte på en timme', () => {
    for (let i = 0; i < 5; i += 1) recordUpload('1.2.3.4', 101 * 1024 * 1024);
    assert.equal(rateLimitStatus('1.2.3.4').allowed, false);
  });

  it('släpper igenom igen när timmen har passerat', () => {
    const now = Date.now();
    for (let i = 0; i < 20; i += 1) recordUpload('1.2.3.4', 1024, now - 2 * 60 * 60 * 1000);
    assert.equal(rateLimitStatus('1.2.3.4', now).allowed, true);
  });
});

describe('holdUpload', () => {
  it('skyddar filen från städningen så länge skyddet gäller', async () => {
    const meta = await seed({
      createdAt: new Date(Date.now() - ORPHAN_MAX_AGE_MS - 1000).toISOString(),
    });
    await holdUpload(meta.id, new Date(Date.now() + 60_000));

    assert.equal(await sweepOrphans(), 0);
    assert.ok(await readMeta(meta.id));
  });

  it('släpper filen när skyddet gått ut', async () => {
    const meta = await seed({
      createdAt: new Date(Date.now() - ORPHAN_MAX_AGE_MS - 1000).toISOString(),
    });
    await holdUpload(meta.id, new Date(Date.now() - 1000));

    assert.equal(await sweepOrphans(), 1);
    assert.equal(await readMeta(meta.id), undefined);
  });

  it('kortar inte ett längre skydd', async () => {
    const meta = await seed();
    const long = new Date(Date.now() + 600_000);
    await holdUpload(meta.id, long);
    await holdUpload(meta.id, new Date(Date.now() + 1000));
    assert.equal((await readMeta(meta.id))?.heldUntil, long.toISOString());
  });

  it('förlänger ett kortare skydd', async () => {
    const meta = await seed();
    await holdUpload(meta.id, new Date(Date.now() + 1000));
    const long = new Date(Date.now() + 600_000);
    await holdUpload(meta.id, long);
    assert.equal((await readMeta(meta.id))?.heldUntil, long.toISOString());
  });

  it('svarar undefined för en fil som inte finns', async () => {
    assert.equal(await holdUpload(generateUploadId(), new Date()), undefined);
  });
});

describe('cloneUpload', () => {
  it('kopierar filen till ett nytt id', async () => {
    const meta = await seed();
    const copy = await cloneUpload(meta.id);

    assert.ok(copy);
    assert.notEqual(copy!.id, meta.id);
    assert.equal(copy!.originalName, meta.originalName);
    assert.equal(copy!.extension, meta.extension);
    assert.ok(await uploadExists(copy!));
    // Originalet ska ligga kvar orört.
    assert.ok(await readMeta(meta.id));
  });

  it('ger kopian samma innehåll', async () => {
    const meta = await seed();
    const copy = await cloneUpload(meta.id);
    const [original, copied] = await Promise.all([
      readFile(filePathFor(meta), 'utf8'),
      readFile(filePathFor(copy!), 'utf8'),
    ]);
    assert.equal(copied, original);
  });

  it('lämnar kopian oanvänd även när originalet hör till en order', async () => {
    const meta = await seed({ claimedBy: 'C2026-ABC123' });
    const copy = await cloneUpload(meta.id);
    assert.equal(copy!.claimedBy, null);
    // Och originalets koppling rörs inte.
    assert.equal((await readMeta(meta.id))?.claimedBy, 'C2026-ABC123');
  });

  it('tar med uppmätningen, eftersom det är samma modell', async () => {
    const meta = await seed({
      analysis: {
        format: 'stl',
        volumeCm3: 27,
        surfaceAreaCm2: 54,
        bounds: { width: 30, depth: 30, height: 30 },
        triangles: 12,
        openEdges: 0,
        nonManifoldEdges: 0,
        watertight: true,
        invertedNormals: false,
        fitsBuildPlate: true,
        warnings: [],
      },
    });
    assert.equal((await cloneUpload(meta.id))?.analysis?.volumeCm3, 27);
  });

  it('ärver inte originalets skydd mot städning', async () => {
    const meta = await seed();
    await holdUpload(meta.id, new Date(Date.now() + 600_000));
    const copy = await cloneUpload(meta.id);
    assert.equal(copy!.heldUntil, undefined);
  });

  it('svarar undefined för en fil som inte finns', async () => {
    assert.equal(await cloneUpload(generateUploadId()), undefined);
  });
});
