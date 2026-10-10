import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  QUOTE_TTL_DAYS,
  expiryFrom,
  findQuote,
  generateQuoteId,
  isExpired,
  pruneQuotes,
  saveQuote,
} from '../src/quotes.ts';
import type { QuoteInput } from '../src/quotes.ts';

let dir: string;
const previous = process.env.QUOTE_STORE;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-offerter-'));
  process.env.QUOTE_STORE = join(dir, 'offerter.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (previous === undefined) delete process.env.QUOTE_STORE;
  else process.env.QUOTE_STORE = previous;
});

const input: QuoteInput = {
  projectName: 'Fäste till kameran',
  description: 'Ett fäste som ska sitta på ett stativ.',
  request: {
    material: 'pla',
    quality: 'standard',
    volumeCm3: 40,
    infill: 20,
    quantity: 2,
    rush: false,
    postProcessing: false,
  },
  quote: {
    materialCost: 40,
    machineCost: 60,
    setupFee: 95,
    postProcessingCost: 0,
    rushSurcharge: 0,
    volumeDiscount: 0,
    unitPrice: 100,
    total: 500,
    estimatedPrintHours: 2,
    estimatedDeliveryDays: 4,
    estimatedWeightGrams: 50,
  },
};

const now = new Date('2026-10-10T12:00:00.000Z');

describe('generateQuoteId', () => {
  it('ger unika, url-säkra id:n', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateQuoteId()));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]+$/);
  });

  it('är kort nog att skicka i ett mejl men långt nog att inte gissas', () => {
    const id = generateQuoteId();
    assert.ok(id.length >= 16 && id.length <= 24, id);
  });
});

describe('saveQuote', () => {
  it('sparar offerten och sätter ett utgångsdatum', async () => {
    const saved = await saveQuote(input, now);
    assert.equal(saved.projectName, 'Fäste till kameran');
    assert.equal(saved.createdAt, now.toISOString());
    assert.equal(saved.expiresAt, expiryFrom(now).toISOString());
    assert.equal((await findQuote(saved.id, now))?.id, saved.id);
  });

  it('ger varje offert sitt eget id', async () => {
    const first = await saveQuote(input, now);
    const second = await saveQuote(input, now);
    assert.notEqual(first.id, second.id);
    assert.ok(await findQuote(first.id, now));
    assert.ok(await findQuote(second.id, now));
  });

  it('tar med filen och uppmätningen när de finns', async () => {
    const saved = await saveQuote(
      { ...input, fileId: 'a'.repeat(32), fileName: 'faste.stl', fileUrl: '/api/uploads/x' },
      now,
    );
    assert.equal(saved.fileName, 'faste.stl');
    assert.equal((await findQuote(saved.id, now))?.fileId, 'a'.repeat(32));
  });

  it('klarar flera offerter som sparas samtidigt', async () => {
    const saved = await Promise.all(Array.from({ length: 20 }, () => saveQuote(input, now)));
    // Skrivningarna köas, så ingen ska ha skrivit över en annan.
    for (const quote of saved) assert.ok(await findQuote(quote.id, now));
  });
});

describe('utgång', () => {
  const later = new Date(now.getTime() + (QUOTE_TTL_DAYS + 1) * 24 * 60 * 60 * 1000);

  it('räknar en gammal offert som utgången', async () => {
    const saved = await saveQuote(input, now);
    assert.equal(isExpired(saved, now), false);
    assert.equal(isExpired(saved, later), true);
  });

  it('lämnar inte ut en utgången offert', async () => {
    const saved = await saveQuote(input, now);
    assert.equal(await findQuote(saved.id, later), undefined);
  });

  it('gäller ända fram till utgångstiden', async () => {
    const saved = await saveQuote(input, now);
    const justBefore = new Date(new Date(saved.expiresAt).getTime() - 1000);
    assert.ok(await findQuote(saved.id, justBefore));
  });

  it('rensar bort utgångna offerter', async () => {
    // Två offerter sparade med tjugo dagars mellanrum: en månad senare har
    // bara den första gått ut.
    const halfway = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);
    const old = await saveQuote(input, now);
    const newer = await saveQuote(input, halfway);

    assert.equal(await pruneQuotes(later), 1);
    assert.equal(await findQuote(old.id, later), undefined);
    assert.ok(await findQuote(newer.id, later));
  });

  it('rensar ingenting när allt gäller', async () => {
    await saveQuote(input, now);
    assert.equal(await pruneQuotes(now), 0);
  });

  it('städar bort utgångna när en ny sparas', async () => {
    await saveQuote(input, now);
    await saveQuote(input, later);
    // Den gamla ska inte ligga kvar och fylla filen.
    assert.equal(await pruneQuotes(later), 0);
  });
});

describe('findQuote', () => {
  it('avvisar id:n som inte har rätt form', async () => {
    await saveQuote(input, now);
    assert.equal(await findQuote('../../etc/passwd', now), undefined);
    assert.equal(await findQuote('', now), undefined);
    assert.equal(await findQuote('kort', now), undefined);
    assert.equal(await findQuote(42, now), undefined);
    assert.equal(await findQuote(undefined, now), undefined);
  });

  it('svarar undefined för ett id som inte finns', async () => {
    assert.equal(await findQuote(generateQuoteId(), now), undefined);
  });
});
