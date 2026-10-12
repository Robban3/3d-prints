import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DiscountError,
  allDiscounts,
  evaluateDiscount,
  findDiscount,
  labelFor,
  normalizeCode,
  parseDiscountInput,
  redeemDiscount,
  releaseDiscount,
  removeDiscount,
  saveDiscount,
} from '../src/discounts.ts';

let dir: string;
const previous = process.env.DISCOUNT_STORE;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-rabatter-'));
  process.env.DISCOUNT_STORE = join(dir, 'rabatter.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (previous === undefined) delete process.env.DISCOUNT_STORE;
  else process.env.DISCOUNT_STORE = previous;
});

const valid = {
  code: 'host20',
  description: 'Höstkampanj 2026',
  kind: 'procent' as const,
  value: 20,
};

describe('normalizeCode', () => {
  it('skriver koden i versaler utan blanksteg', () => {
    assert.equal(normalizeCode('  host 20 '), 'HOST20');
    assert.equal(normalizeCode('Host-20'), 'HOST-20');
    assert.equal(normalizeCode(undefined), '');
  });
});

describe('parseDiscountInput', () => {
  it('normaliserar koden och fyller i standardvärden', () => {
    const discount = parseDiscountInput(valid);
    assert.equal(discount.code, 'HOST20');
    assert.equal(discount.kind, 'procent');
    assert.equal(discount.value, 20);
    assert.equal(discount.minSubtotal, 0);
    assert.equal(discount.maxUses, 0);
    assert.equal(discount.uses, 0);
    assert.equal(discount.freeShipping, false);
    assert.equal(discount.active, true);
  });

  it('kräver en kod som går att skriva in', () => {
    assert.throws(() => parseDiscountInput({ ...valid, code: 'ab' }), DiscountError);
    assert.throws(
      () => parseDiscountInput({ ...valid, code: 'kod med mellanslag!' }),
      DiscountError,
    );
    assert.throws(() => parseDiscountInput({ ...valid, code: 'x'.repeat(25) }), DiscountError);
  });

  it('håller procentsatsen i ett rimligt spann', () => {
    assert.throws(() => parseDiscountInput({ ...valid, value: 0 }), DiscountError);
    assert.throws(() => parseDiscountInput({ ...valid, value: 95 }), DiscountError);
    assert.equal(parseDiscountInput({ ...valid, value: 90 }).value, 90);
  });

  it('tillåter större belopp för kronrabatter', () => {
    const discount = parseDiscountInput({ ...valid, kind: 'kronor', value: 500 });
    assert.equal(discount.kind, 'kronor');
    assert.equal(discount.value, 500);
  });

  it('kräver en beskrivning', () => {
    assert.throws(() => parseDiscountInput({ ...valid, description: '' }), DiscountError);
  });

  it('avvisar datum som inte går att tolka', () => {
    assert.throws(
      () => parseDiscountInput({ ...valid, endsAt: 'i höst någon gång' }),
      (error: unknown) => {
        assert.ok(error instanceof DiscountError);
        assert.match(error.fields.endsAt!, /2026-12-24/);
        return true;
      },
    );
  });

  it('kräver att slutdatumet ligger efter startdatumet', () => {
    assert.throws(
      () => parseDiscountInput({ ...valid, startsAt: '2026-12-01', endsAt: '2026-11-01' }),
      DiscountError,
    );
  });

  it('lämnar datumen tomma när de inte angetts', () => {
    const discount = parseDiscountInput({ ...valid, startsAt: '', endsAt: '' });
    assert.equal('startsAt' in discount, false);
    assert.equal('endsAt' in discount, false);
  });

  it('behåller antalet användningar vid en ändring', () => {
    const existing = { ...parseDiscountInput(valid), uses: 7 };
    assert.equal(parseDiscountInput({ ...valid, value: 25 }, existing).uses, 7);
  });

  it('låter inte taket sättas under det som redan använts', () => {
    const existing = { ...parseDiscountInput(valid), uses: 7 };
    assert.throws(
      () => parseDiscountInput({ ...valid, maxUses: 3 }, existing),
      (error: unknown) => {
        assert.ok(error instanceof DiscountError);
        assert.match(error.fields.maxUses!, /redan inlöst 7/);
        return true;
      },
    );
  });

  it('byter inte kod på en kod som redigeras', () => {
    const existing = parseDiscountInput(valid);
    assert.equal(parseDiscountInput({ ...valid, code: 'NYTTNAMN' }, existing).code, 'HOST20');
  });
});

describe('lagring', () => {
  it('sparar och läser tillbaka en kod', async () => {
    await saveDiscount(valid);
    const found = await findDiscount('host20');
    assert.equal(found?.code, 'HOST20');
    assert.equal((await allDiscounts()).length, 1);
  });

  it('hittar koden oavsett skiftläge och blanksteg', async () => {
    await saveDiscount(valid);
    assert.ok(await findDiscount(' HoSt 20 '));
  });

  it('vägrar två koder med samma namn', async () => {
    await saveDiscount(valid);
    await assert.rejects(
      () => saveDiscount({ ...valid, description: 'En annan' }),
      (error: unknown) => {
        assert.ok(error instanceof DiscountError);
        assert.match(error.fields.code!, /finns redan/);
        return true;
      },
    );
  });

  it('uppdaterar en befintlig kod utan att skapa en till', async () => {
    await saveDiscount(valid);
    const updated = await saveDiscount({ ...valid, value: 30 }, 'HOST20');
    assert.equal(updated.value, 30);
    assert.equal((await allDiscounts()).length, 1);
  });

  it('säger till när koden som ska ändras inte finns', async () => {
    await assert.rejects(() => saveDiscount(valid, 'FINNSINTE'), DiscountError);
  });

  it('tar bort en kod', async () => {
    await saveDiscount(valid);
    assert.equal((await removeDiscount('HOST20'))?.code, 'HOST20');
    assert.deepEqual(await allDiscounts(), []);
    assert.equal(await removeDiscount('HOST20'), undefined);
  });

  it('svarar undefined för en tom kod', async () => {
    await saveDiscount(valid);
    assert.equal(await findDiscount(''), undefined);
    assert.equal(await findDiscount('   '), undefined);
  });
});

describe('evaluateDiscount', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');

  it('räknar procent på ordervärdet', () => {
    const verdict = evaluateDiscount(parseDiscountInput(valid), 500, now);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.applied?.amount, 100);
    assert.equal(verdict.applied?.code, 'HOST20');
    assert.equal(verdict.applied?.freeShipping, false);
  });

  it('räknar kronrabatt rakt av', () => {
    const discount = parseDiscountInput({ ...valid, kind: 'kronor', value: 150 });
    assert.equal(evaluateDiscount(discount, 500, now).applied?.amount, 150);
  });

  it('ger aldrig mer än ordervärdet i kronrabatt', () => {
    const discount = parseDiscountInput({ ...valid, kind: 'kronor', value: 900 });
    assert.equal(evaluateDiscount(discount, 500, now).applied?.amount, 500);
  });

  it('avvisar en kod som inte finns', () => {
    const verdict = evaluateDiscount(undefined, 500, now);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /hittar ingen/);
  });

  it('avvisar en avstängd kod', () => {
    const discount = parseDiscountInput({ ...valid, active: false });
    assert.equal(evaluateDiscount(discount, 500, now).ok, false);
  });

  it('avvisar en kod som inte börjat gälla', () => {
    const discount = parseDiscountInput({ ...valid, startsAt: '2026-11-01' });
    assert.match(evaluateDiscount(discount, 500, now).reason!, /inte börjat gälla/);
  });

  it('avvisar en kod som gått ut', () => {
    const discount = parseDiscountInput({ ...valid, endsAt: '2026-09-01' });
    assert.match(evaluateDiscount(discount, 500, now).reason!, /gått ut/);
  });

  it('avvisar en slutanvänd kod', () => {
    const discount = { ...parseDiscountInput({ ...valid, maxUses: 3 }), uses: 3 };
    assert.match(evaluateDiscount(discount, 500, now).reason!, /slutanvänd/);
  });

  it('säger hur mycket som fattas till lägsta ordervärde', () => {
    const discount = parseDiscountInput({ ...valid, minSubtotal: 600 });
    const verdict = evaluateDiscount(discount, 450, now);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /från 600 kr/);
    assert.match(verdict.reason!, /150 kr mer/);
  });

  it('släpper igenom precis på gränsen', () => {
    const discount = parseDiscountInput({ ...valid, minSubtotal: 600 });
    assert.equal(evaluateDiscount(discount, 600, now).ok, true);
  });

  it('bär med sig fri frakt', () => {
    const discount = parseDiscountInput({ ...valid, freeShipping: true });
    assert.equal(evaluateDiscount(discount, 300, now).applied?.freeShipping, true);
  });

  it('avrundar procentrabatten till hela kronor', () => {
    const discount = parseDiscountInput({ ...valid, value: 15 });
    assert.equal(evaluateDiscount(discount, 349, now).applied?.amount, 52);
  });
});

describe('labelFor', () => {
  it('beskriver en procentrabatt', () => {
    assert.equal(labelFor(parseDiscountInput(valid)), 'HOST20 · 20 %');
  });

  it('beskriver en kronrabatt', () => {
    assert.equal(
      labelFor(parseDiscountInput({ ...valid, kind: 'kronor', value: 150 })),
      'HOST20 · 150 kr',
    );
  });

  it('nämner fri frakt', () => {
    assert.match(labelFor(parseDiscountInput({ ...valid, freeShipping: true })), /fri frakt/);
  });
});

describe('inlösen', () => {
  it('räknar upp antalet användningar', async () => {
    await saveDiscount(valid);
    assert.equal(await redeemDiscount('HOST20'), true);
    assert.equal((await findDiscount('HOST20'))?.uses, 1);
  });

  it('svarar false för en kod som inte finns', async () => {
    assert.equal(await redeemDiscount('FINNSINTE'), false);
  });

  it('släpper inte igenom fler inlösen än taket', async () => {
    await saveDiscount({ ...valid, maxUses: 2 });
    assert.equal(await redeemDiscount('HOST20'), true);
    assert.equal(await redeemDiscount('HOST20'), true);
    assert.equal(await redeemDiscount('HOST20'), false);
    assert.equal((await findDiscount('HOST20'))?.uses, 2);
  });

  it('delar inte ut sista inlösen till två kunder samtidigt', async () => {
    await saveDiscount({ ...valid, maxUses: 1 });
    const results = await Promise.all([redeemDiscount('HOST20'), redeemDiscount('HOST20')]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await findDiscount('HOST20'))?.uses, 1);
  });

  it('backar en inlösen när ordern inte blev av', async () => {
    await saveDiscount(valid);
    await redeemDiscount('HOST20');
    await releaseDiscount('HOST20');
    assert.equal((await findDiscount('HOST20'))?.uses, 0);
  });

  it('går inte under noll när en inlösen backas för mycket', async () => {
    await saveDiscount(valid);
    await releaseDiscount('HOST20');
    assert.equal((await findDiscount('HOST20'))?.uses, 0);
  });

  it('tål att en okänd kod backas', async () => {
    await releaseDiscount('FINNSINTE');
  });
});
