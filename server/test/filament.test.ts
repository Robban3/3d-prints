import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  FilamentError,
  addSpool,
  allSpools,
  consume,
  consumption,
  consumptionLog,
  lowFilamentGrams,
  parseSpoolInput,
  removeSpool,
  resetFilamentCache,
  shortages,
  stockByMaterial,
  updateSpool,
} from '../src/filament.ts';
import type { Spool } from '../src/filament.ts';
import { buildQueue } from '../src/queue.ts';
import type { AnyOrder, Product } from '../src/types.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-filament-'));
  process.env.FILAMENT_STORE = join(dir, 'filament.json');
  resetFilamentCache();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.FILAMENT_STORE;
  delete process.env.LOW_FILAMENT_GRAMS;
  resetFilamentCache();
});

const materials = ['pla', 'petg', 'abs'];

describe('parseSpoolInput', () => {
  it('tar emot en rulle ur formuläret', () => {
    const spool = parseSpoolInput(
      { material: 'pla', color: ' Matt svart ', grams: '750.4', totalGrams: 1000 },
      materials,
    );
    assert.equal(spool.material, 'pla');
    assert.equal(spool.color, 'Matt svart');
    assert.equal(spool.grams, 750);
    assert.equal(spool.totalGrams, 1000);
  });

  it('antar en kilorulle när vikten ny inte angetts', () => {
    const spool = parseSpoolInput({ material: 'petg', color: 'Benvit', grams: 400 }, materials);
    assert.equal(spool.totalGrams, 1000);
  });

  it('avvisar okänt material, saknad färg och orimliga gram', () => {
    const bad = [
      { material: 'guld', color: 'Svart', grams: 500 },
      { material: 'pla', color: '', grams: 500 },
      { material: 'pla', color: 'Svart', grams: -5 },
      { material: 'pla', color: 'Svart', grams: 'tungt' },
      // Mer kvar än rullen vägde ny går inte ihop.
      { material: 'pla', color: 'Svart', grams: 1200, totalGrams: 1000 },
    ];
    for (const input of bad) {
      assert.throws(() => parseSpoolInput(input, materials), FilamentError);
    }
  });
});

describe('rullarna', () => {
  it('sparas och läses tillbaka med minst kvar först', async () => {
    await addSpool({ material: 'pla', color: 'Svart', grams: 800, totalGrams: 1000 });
    await addSpool({ material: 'petg', color: 'Benvit', grams: 200, totalGrams: 1000 });
    resetFilamentCache();

    const spools = await allSpools();
    assert.deepEqual(
      spools.map((spool) => spool.grams),
      [200, 800],
    );
  });

  it('går att väga om och ta bort', async () => {
    const spool = await addSpool({ material: 'pla', color: 'Svart', grams: 800, totalGrams: 1000 });
    const updated = await updateSpool(spool.id, { grams: 450 });
    assert.equal(updated?.grams, 450);

    // En omvägning kan aldrig ge mer än rullen vägde ny.
    assert.equal((await updateSpool(spool.id, { grams: 5000 }))?.grams, 1000);
    assert.equal((await updateSpool(spool.id, { grams: -20 }))?.grams, 0);

    assert.equal(await removeSpool(spool.id), true);
    assert.equal(await removeSpool(spool.id), false);
    assert.equal((await allSpools()).length, 0);
  });

  it('summerar saldot per material och färg', async () => {
    await addSpool({ material: 'pla', color: 'Svart', grams: 800, totalGrams: 1000 });
    await addSpool({ material: 'pla', color: 'Svart', grams: 150, totalGrams: 1000 });
    await addSpool({ material: 'pla', color: 'Benvit', grams: 300, totalGrams: 1000 });

    const totals = stockByMaterial(await allSpools());
    assert.equal(totals.get('pla|Svart'), 950);
    assert.equal(totals.get('pla|Benvit'), 300);
  });
});

describe('åtgång', () => {
  it('tömmer den rulle som har minst kvar först', async () => {
    await addSpool({ material: 'pla', color: 'Svart', grams: 800, totalGrams: 1000 });
    await addSpool({ material: 'pla', color: 'Svart', grams: 150, totalGrams: 1000 });

    const entry = await consume('S-1', [{ material: 'pla', color: 'Svart', grams: 200 }]);
    assert.equal(entry.shortfall, 0);

    const spools = await allSpools();
    assert.deepEqual(
      spools.map((spool) => spool.grams),
      [0, 750],
    );
  });

  it('bokförs bara en gång per order', async () => {
    await addSpool({ material: 'pla', color: 'Svart', grams: 1000, totalGrams: 1000 });
    await consume('S-1', [{ material: 'pla', color: 'Svart', grams: 200 }]);
    await consume('S-1', [{ material: 'pla', color: 'Svart', grams: 200 }]);

    assert.equal((await allSpools())[0]!.grams, 800);
    assert.equal((await consumptionLog()).length, 1);
    assert.equal((await consumption('S-1'))?.items[0]?.grams, 200);
  });

  it('tar rätt material i en annan färg när färgen är slut', async () => {
    await addSpool({ material: 'pla', color: 'Benvit', grams: 1000, totalGrams: 1000 });
    const entry = await consume('S-1', [{ material: 'pla', color: 'Svart', grams: 300 }]);
    assert.equal(entry.shortfall, 0);
    assert.equal((await allSpools())[0]!.grams, 700);
  });

  it('bokför ändå när plasten inte räcker, och rapporterar bristen', async () => {
    await addSpool({ material: 'pla', color: 'Svart', grams: 100, totalGrams: 1000 });
    const entry = await consume('S-1', [{ material: 'pla', color: 'Svart', grams: 400 }]);
    assert.equal(entry.shortfall, 300);
    assert.equal((await allSpools())[0]!.grams, 0);
  });

  it('rör inte rullar av fel material', async () => {
    await addSpool({ material: 'petg', color: 'Svart', grams: 1000, totalGrams: 1000 });
    const entry = await consume('S-1', [{ material: 'pla', color: 'Svart', grams: 400 }]);
    assert.equal(entry.shortfall, 400);
    assert.equal((await allSpools())[0]!.grams, 1000);
  });

  it('visar de senaste bokföringarna först', async () => {
    await addSpool({ material: 'pla', color: 'Svart', grams: 1000, totalGrams: 1000 });
    await consume('S-1', [{ material: 'pla', color: 'Svart', grams: 10 }]);
    await consume('S-2', [{ material: 'pla', color: 'Svart', grams: 10 }]);
    assert.deepEqual(
      (await consumptionLog()).map((entry) => entry.orderId),
      ['S-2', 'S-1'],
    );
  });
});

describe('shortages', () => {
  const spool = (over: Partial<Spool>): Spool => ({
    id: 'x',
    material: 'pla',
    color: 'Svart',
    grams: 500,
    totalGrams: 1000,
    addedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  });

  it('är tom när lagret räcker', () => {
    const result = shortages([{ material: 'pla', color: 'Svart', grams: 400 }], [spool({})]);
    assert.deepEqual(result, []);
  });

  it('räknar ihop färgerna, för rätt plast i fel färg är ett val', () => {
    const result = shortages(
      [
        { material: 'pla', color: 'Svart', grams: 300 },
        { material: 'pla', color: 'Benvit', grams: 300 },
      ],
      [spool({ color: 'Svart' })],
    );
    assert.equal(result.length, 1);
    assert.equal(result[0]!.needed, 600);
    assert.equal(result[0]!.available, 500);
    assert.match(result[0]!.color, /Svart, Benvit/);
  });

  it('visar störst underskott först', () => {
    const result = shortages(
      [
        { material: 'pla', color: 'Svart', grams: 600 },
        { material: 'petg', color: 'Benvit', grams: 900 },
      ],
      [spool({}), spool({ id: 'y', material: 'petg', grams: 100 })],
    );
    assert.deepEqual(
      result.map((entry) => entry.material),
      ['petg', 'pla'],
    );
  });

  it('ett material utan en enda rulle saknas helt', () => {
    const result = shortages([{ material: 'abs', color: 'Svart', grams: 100 }], []);
    assert.equal(result[0]!.available, 0);
  });
});

describe('lowFilamentGrams', () => {
  it('är 250 gram om inget annat sägs', () => {
    assert.equal(lowFilamentGrams(), 250);
    process.env.LOW_FILAMENT_GRAMS = '400';
    assert.equal(lowFilamentGrams(), 400);
    process.env.LOW_FILAMENT_GRAMS = 'mycket';
    assert.equal(lowFilamentGrams(), 250);
  });
});

describe('kön och lagret tillsammans', () => {
  const planter = {
    id: 'p-001',
    slug: 'kruka',
    name: 'Kruka',
    tagline: 'En kruka',
    description: 'En kruka.',
    category: 'inredning',
    price: 349,
    material: 'pla',
    finish: 'Matte',
    printTimeHours: 5,
    dimensions: { width: 100, depth: 100, height: 120 },
    weightGrams: 200,
    colors: ['Grafit'],
    highlights: [],
    stock: 5,
    rating: 4,
    reviewCount: 2,
    featured: false,
    art: { shape: 'planter', tone: 'benvit' },
  } as Product;

  const order = {
    id: 'S2026-1',
    type: 'shop',
    createdAt: '2026-10-09T10:00:00.000Z',
    status: 'i_produktion',
    customer: {
      name: 'Anna',
      email: 'anna@example.com',
      address: 'Storgatan 1',
      postalCode: '11234',
      city: 'Stockholm',
    },
    lines: [{ productId: 'p-001', name: 'Kruka', quantity: 3, unitPrice: 349, color: 'Grafit' }],
    shipping: 0,
    subtotal: 1047,
    total: 1047,
    productionHours: 15,
    history: [{ status: 'i_produktion', at: '2026-10-10T08:00:00.000Z' }],
  } as AnyOrder;

  it('drar av exakt det jobbet kräver', async () => {
    await addSpool({ material: 'pla', color: 'Grafit', grams: 1000, totalGrams: 1000 });

    // Samma väg som statusbytet i panelen tar: kön räknar fram åtgången.
    const job = buildQueue({ orders: [order], products: [planter] }).jobs[0]!;
    await consume(order.id, job.materials);

    assert.equal((await allSpools())[0]!.grams, 400);
  });
});
