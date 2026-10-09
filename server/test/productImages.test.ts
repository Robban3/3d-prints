import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  ORPHAN_MAX_AGE_MS,
  imageContentType,
  isAllowedFileName,
  isAllowedImageName,
  isImageExtension,
  isStorableExtension,
  generateUploadId,
  readMeta,
  sweepOrphans,
  writeMeta,
} from '../src/uploads.ts';
import { ProductInputError, parseProductInput } from '../src/catalogValidation.ts';

const options = {
  categoryIds: ['inredning'],
  materialIds: ['pla', 'petg'],
};

const base = {
  name: 'Testprodukt',
  tagline: 'En kort rad',
  description: 'En beskrivning som är tillräckligt lång för valideringen här.',
  category: 'inredning',
  price: 299,
  material: 'pla',
  printTimeHours: 5,
  dimensions: { width: 100, depth: 100, height: 100 },
  weightGrams: 150,
  colors: ['Svart'],
  stock: 5,
  art: { shape: 'planter', tone: 'benvit' },
};

describe('bildformat', () => {
  it('godkänner vanliga bildformat oavsett skiftläge', () => {
    for (const extension of IMAGE_EXTENSIONS) {
      assert.ok(isAllowedImageName(`foto${extension}`));
      assert.ok(isAllowedImageName(`FOTO${extension.toUpperCase()}`));
    }
  });

  it('avvisar annat än bilder', () => {
    assert.equal(isAllowedImageName('modell.stl'), false);
    assert.equal(isAllowedImageName('skadlig.svg'), false);
    assert.equal(isAllowedImageName('skript.exe'), false);
  });

  it('håller isär bilder och modellfiler', () => {
    assert.ok(isImageExtension('.png'));
    assert.equal(isImageExtension('.stl'), false);
    // Modellfiler ska fortfarande fungera som förut.
    assert.ok(isAllowedFileName('modell.3mf'));
  });

  it('håller modellfilsfiltret skilt från bildfiltret', () => {
    // En bild får aldrig gå in som modellfil till ett printjobb …
    assert.equal(isAllowedFileName('bild.png'), false);
    assert.equal(isAllowedFileName('foto.jpg'), false);
    // … och en modellfil är ingen bild.
    assert.equal(isAllowedImageName('modell.stl'), false);
    // Lagringen känner igen båda, så metadata går att läsa tillbaka.
    assert.ok(isStorableExtension('.png'));
    assert.ok(isStorableExtension('.stl'));
    assert.equal(isStorableExtension('.exe'), false);
  });

  it('ger rätt innehållstyp per format', () => {
    assert.equal(imageContentType('.jpg'), 'image/jpeg');
    assert.equal(imageContentType('.JPEG'), 'image/jpeg');
    assert.equal(imageContentType('.png'), 'image/png');
    // Okänt format får aldrig en typ som webbläsaren renderar.
    assert.equal(imageContentType('.stl'), 'application/octet-stream');
  });

  it('har en rimligare storleksgräns än modellfilerna', () => {
    assert.equal(MAX_IMAGE_BYTES, 8 * 1024 * 1024);
  });
});

describe('bilder och städningen', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'formlabb-bilder-'));
    process.env.UPLOAD_DIR = dir;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  it('städar inte bort produktbilder som saknar order', async () => {
    const gammal = new Date(Date.now() - ORPHAN_MAX_AGE_MS - 1000).toISOString();
    const image = {
      id: generateUploadId(),
      kind: 'image' as const,
      originalName: 'produkt.png',
      extension: '.png',
      size: 1024,
      createdAt: gammal,
      claimedBy: null,
    };
    const model = {
      id: generateUploadId(),
      originalName: 'modell.stl',
      extension: '.stl',
      size: 1024,
      createdAt: gammal,
      claimedBy: null,
    };
    await writeMeta(image);
    await writeMeta(model);

    const removed = await sweepOrphans();
    assert.equal(removed, 1, 'bara modellfilen ska städas bort');
    assert.ok(await readMeta(image.id), 'bilden ska finnas kvar');
    assert.equal(await readMeta(model.id), undefined);
  });
});

describe('produkt med bild', () => {
  it('sparar bilden med adress som går att visa', () => {
    const id = 'a'.repeat(32);
    const parsed = parseProductInput(
      { ...base, image: { id, fileName: 'produkt.png' } },
      options,
    );
    assert.equal(parsed.image?.id, id);
    assert.equal(parsed.image?.url, `/api/uploads/${id}`);
    assert.equal(parsed.image?.fileName, 'produkt.png');
  });

  it('klarar sig utan bild', () => {
    const parsed = parseProductInput(base, options);
    assert.equal(parsed.image, undefined);
  });

  it('avvisar ett id som inte kan komma från uppladdningen', () => {
    for (const id of ['../../etc/passwd', 'ZZZZ', '123']) {
      assert.throws(
        () => parseProductInput({ ...base, image: { id, fileName: 'x.png' } }, options),
        ProductInputError,
      );
    }
  });

  it('bygger adressen själv i stället för att lita på klientens', () => {
    const id = 'b'.repeat(32);
    const parsed = parseProductInput(
      { ...base, image: { id, url: 'https://elak.example/bild.png', fileName: 'x.png' } },
      options,
    );
    assert.equal(parsed.image?.url, `/api/uploads/${id}`);
  });
});
