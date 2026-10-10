import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildPickList } from '../src/picking.ts';
import type { AnyOrder, OrderLine, Product } from '../src/types.ts';

const customer = (name: string) => ({
  name,
  email: `${name.toLowerCase()}@example.com`,
  address: 'Storgatan 1',
  postalCode: '11234',
  city: 'Stockholm',
});

function shopOrder(id: string, name: string, lines: OrderLine[]): AnyOrder {
  return {
    id,
    type: 'shop',
    createdAt: '2026-10-09T10:00:00.000Z',
    status: 'mottagen',
    customer: customer(name),
    lines,
    shipping: 0,
    subtotal: 0,
    total: 0,
    history: [{ status: 'mottagen', at: '2026-10-09T10:00:00.000Z' }],
  } as AnyOrder;
}

function customOrder(id: string, name: string): AnyOrder {
  return {
    id,
    type: 'custom',
    createdAt: '2026-10-09T11:00:00.000Z',
    status: 'mottagen',
    customer: customer(name),
    request: {
      material: 'petg',
      quality: 'fin',
      volumeCm3: 40,
      infill: 20,
      quantity: 3,
      rush: false,
      postProcessing: false,
    },
    projectName: 'Fäste',
    description: 'Ska tåla värme.',
    fileName: 'faste.stl',
    quote: {
      materialCost: 40,
      machineCost: 60,
      setupFee: 95,
      postProcessingCost: 0,
      rushSurcharge: 0,
      volumeDiscount: 0,
      unitPrice: 100,
      total: 500,
      estimatedPrintHours: 8,
      estimatedDeliveryDays: 4,
      estimatedWeightGrams: 50,
    },
    total: 500,
    history: [{ status: 'mottagen', at: '2026-10-09T11:00:00.000Z' }],
  } as AnyOrder;
}

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

const vase = { ...planter, id: 'p-002', name: 'Aura vas', weightGrams: 120 } as Product;

const line = (over: Partial<OrderLine>): OrderLine => ({
  productId: 'p-001',
  name: 'Kruka',
  quantity: 1,
  unitPrice: 349,
  color: 'Grafit',
  ...over,
});

describe('plocklistan', () => {
  it('är tom utan ordrar', () => {
    const list = buildPickList({ orders: [] });
    assert.deepEqual(list.rows, []);
    assert.equal(list.items, 0);
    assert.equal(list.orders, 0);
  });

  it('slår ihop samma sak över flera ordrar men håller reda på vems den är', () => {
    const list = buildPickList({
      orders: [
        shopOrder('S-1', 'Anna', [line({ quantity: 2 })]),
        shopOrder('S-2', 'Bo', [line({ quantity: 3 })]),
      ],
      products: [planter],
    });

    assert.equal(list.rows.length, 1);
    assert.equal(list.rows[0]!.quantity, 5);
    assert.deepEqual(
      list.rows[0]!.orders.map((entry) => `${entry.id}:${entry.quantity}`),
      ['S-1:2', 'S-2:3'],
    );
    assert.equal(list.items, 5);
    assert.equal(list.orders, 2);
  });

  it('håller isär färg, storlek och mått', () => {
    const list = buildPickList({
      orders: [
        shopOrder('S-1', 'Anna', [
          line({ color: 'Grafit' }),
          line({ color: 'Benvit' }),
          line({ color: 'Grafit', size: 'stor' }),
          line({ color: 'Grafit', parameterText: 'Bredd 500 mm' }),
        ]),
      ],
      products: [planter],
    });
    assert.equal(list.rows.length, 4);
  });

  it('sorteras på namn och färg, så plocket följer hyllan', () => {
    const list = buildPickList({
      orders: [
        shopOrder('S-1', 'Anna', [
          line({ productId: 'p-002', name: 'Aura vas', color: 'Grafit' }),
          line({ color: 'Grafit' }),
          line({ productId: 'p-002', name: 'Aura vas', color: 'Benvit' }),
        ]),
      ],
      products: [planter, vase],
    });
    assert.deepEqual(
      list.rows.map((row) => `${row.name} ${row.color}`),
      ['Aura vas Benvit', 'Aura vas Grafit', 'Kruka Grafit'],
    );
  });

  it('räknar materialåtgången per rad', () => {
    const list = buildPickList({
      orders: [shopOrder('S-1', 'Anna', [line({ quantity: 3 })])],
      products: [planter],
    });
    assert.equal(list.rows[0]!.material, 'pla');
    assert.equal(list.rows[0]!.grams, 600);
  });

  it('klarar en produkt som tagits bort ur katalogen', () => {
    const list = buildPickList({ orders: [shopOrder('S-1', 'Anna', [line({})])], products: [] });
    assert.equal(list.rows.length, 1);
    assert.equal(list.rows[0]!.grams, undefined);
    assert.equal(list.rows[0]!.material, undefined);
  });

  it('lägger egna printjobb för sig, utan att slå ihop dem', () => {
    const list = buildPickList({
      orders: [customOrder('C-1', 'Anna'), customOrder('C-2', 'Bo')],
      products: [planter],
    });
    assert.equal(list.rows.length, 0);
    assert.equal(list.jobs.length, 2);
    assert.equal(list.jobs[0]!.fileName, 'faste.stl');
    assert.equal(list.jobs[0]!.description, 'Ska tåla värme.');
    // Tre exemplar i varje eget jobb.
    assert.equal(list.items, 6);
  });

  it('listar statusarna urvalet kom ur', () => {
    const list = buildPickList({
      orders: [
        shopOrder('S-1', 'Anna', [line({})]),
        { ...shopOrder('S-2', 'Bo', [line({})]), status: 'i_produktion' } as AnyOrder,
      ],
      products: [planter],
    });
    assert.deepEqual(list.statuses, ['i_produktion', 'mottagen']);
  });
});
