import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildQueue, jobFor } from '../src/queue.ts';
import type { AnyOrder, OrderStatus, Product, StatusEvent } from '../src/types.ts';

const customer = {
  name: 'Anna Andersson',
  email: 'anna@example.com',
  address: 'Storgatan 1',
  postalCode: '11234',
  city: 'Stockholm',
};

const now = new Date('2026-10-10T12:00:00.000Z');

function history(...steps: Array<[OrderStatus, string]>): StatusEvent[] {
  return steps.map(([status, at]) => ({ status, at }));
}

function shopOrder(over: Partial<AnyOrder> = {}): AnyOrder {
  return {
    id: 'S2026-1',
    type: 'shop',
    createdAt: '2026-10-09T10:00:00.000Z',
    status: 'mottagen',
    customer,
    lines: [{ productId: 'p-001', name: 'Kruka', quantity: 1, unitPrice: 349, color: 'Grafit' }],
    shipping: 0,
    subtotal: 349,
    total: 349,
    productionHours: 10,
    history: history(['mottagen', '2026-10-09T10:00:00.000Z']),
    ...over,
  } as AnyOrder;
}

function customOrder(over: Partial<AnyOrder> & { rush?: boolean } = {}): AnyOrder {
  const { rush = false, ...rest } = over;
  return {
    id: 'C2026-1',
    type: 'custom',
    createdAt: '2026-10-09T11:00:00.000Z',
    status: 'mottagen',
    customer,
    request: {
      material: 'pla',
      quality: 'standard',
      volumeCm3: 40,
      infill: 20,
      quantity: 1,
      rush,
      postProcessing: false,
    },
    projectName: 'Fäste',
    description: 'Ett fäste.',
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
    history: history(['mottagen', '2026-10-09T11:00:00.000Z']),
    ...rest,
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

const shelf = {
  ...planter,
  id: 'p-014',
  slug: 'hylla',
  name: 'Hylla',
  material: 'petg',
  price: 359,
  printTimeHours: 10,
  weightGrams: 285,
  parameters: [
    {
      id: 'bredd',
      name: 'Bredd',
      unit: 'mm',
      min: 240,
      max: 600,
      step: 20,
      default: 360,
      pricePerUnit: 1.2,
      axis: 'width' as const,
    },
  ],
} as Product;

const hoursBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 3_600_000;

describe('kön', () => {
  it('är tom när ingenting ska printas', () => {
    const queue = buildQueue({ orders: [], now });
    assert.equal(queue.jobs.length, 0);
    assert.equal(queue.hours, 0);
    assert.equal(queue.readyAt, undefined);
  });

  it('tar bara med det som ska printas', () => {
    const queue = buildQueue({
      orders: [
        shopOrder({ id: 'S-1', status: 'mottagen' }),
        shopOrder({ id: 'S-2', status: 'i_produktion' }),
        shopOrder({ id: 'S-3', status: 'skickad' }),
        shopOrder({ id: 'S-4', status: 'levererad' }),
        shopOrder({ id: 'S-5', status: 'avbruten' }),
      ],
      printers: 4,
      now,
    });
    assert.deepEqual(
      queue.jobs.map((job) => job.orderId),
      ['S-2', 'S-1'],
    );
    assert.equal(queue.running, 1);
    assert.equal(queue.waiting, 1);
  });

  it('kör jobben parallellt på skrivarna', () => {
    const orders = [
      shopOrder({ id: 'S-1', createdAt: '2026-10-09T08:00:00.000Z' }),
      shopOrder({ id: 'S-2', createdAt: '2026-10-09T09:00:00.000Z' }),
      shopOrder({ id: 'S-3', createdAt: '2026-10-09T10:00:00.000Z' }),
    ];
    const queue = buildQueue({ orders, printers: 2, now });

    // Två skrivare: de två första startar nu, den tredje när en blir ledig.
    assert.deepEqual(
      queue.jobs.map((job) => job.printer),
      [1, 2, 1],
    );
    assert.equal(queue.jobs[0]!.waitingHours, 0);
    assert.equal(queue.jobs[1]!.waitingHours, 0);
    assert.equal(queue.jobs[2]!.waitingHours, 10);
    assert.equal(hoursBetween(now.toISOString(), queue.readyAt!), 20);
  });

  it('en enda skrivare gör kön till en rad', () => {
    const queue = buildQueue({
      orders: [shopOrder({ id: 'S-1' }), shopOrder({ id: 'S-2' })],
      printers: 1,
      now,
    });
    assert.deepEqual(
      queue.jobs.map((job) => job.waitingHours),
      [0, 10],
    );
  });

  it('räknar bara timmarna som är kvar på ett pågående jobb', () => {
    const queue = buildQueue({
      orders: [
        shopOrder({
          id: 'S-1',
          status: 'i_produktion',
          history: history(
            ['mottagen', '2026-10-09T10:00:00.000Z'],
            // Fyra av tio timmar har gått.
            ['i_produktion', '2026-10-10T08:00:00.000Z'],
          ),
        }),
      ],
      printers: 1,
      now,
    });
    assert.equal(queue.jobs[0]!.hours, 10);
    assert.equal(queue.jobs[0]!.remainingHours, 6);
    assert.equal(queue.hours, 6);
  });

  it('släpper fram expressjobb före de som väntat längre', () => {
    const queue = buildQueue({
      orders: [
        shopOrder({ id: 'S-1', createdAt: '2026-10-01T08:00:00.000Z' }),
        customOrder({ id: 'C-1', createdAt: '2026-10-09T08:00:00.000Z', rush: true }),
      ],
      printers: 1,
      now,
    });
    assert.deepEqual(
      queue.jobs.map((job) => job.orderId),
      ['C-1', 'S-1'],
    );
  });

  it('men aldrig före något som redan står och printar', () => {
    const queue = buildQueue({
      orders: [
        customOrder({ id: 'C-1', rush: true }),
        shopOrder({
          id: 'S-1',
          status: 'i_produktion',
          history: history(['i_produktion', '2026-10-10T11:00:00.000Z']),
        }),
      ],
      printers: 1,
      now,
    });
    assert.equal(queue.jobs[0]!.orderId, 'S-1');
  });

  it('räknar om printtiden ur katalogen när ordern saknar sparad tid', () => {
    const queue = buildQueue({
      orders: [shopOrder({ productionHours: undefined })],
      products: [planter],
      printers: 1,
      now,
    });
    assert.equal(queue.jobs[0]!.hours, 5);
  });

  it('ger jobbet noll timmar när produkten är borta ur katalogen', () => {
    const queue = buildQueue({
      orders: [shopOrder({ productionHours: undefined })],
      products: [],
      printers: 1,
      now,
    });
    assert.equal(queue.jobs.length, 1);
    assert.equal(queue.jobs[0]!.hours, 0);
  });
});

describe('materialåtgång', () => {
  it('summerar gram per material och färg', () => {
    const queue = buildQueue({
      orders: [
        shopOrder({
          id: 'S-1',
          lines: [
            { productId: 'p-001', name: 'Kruka', quantity: 2, unitPrice: 349, color: 'Grafit' },
            { productId: 'p-001', name: 'Kruka', quantity: 1, unitPrice: 349, color: 'Benvit' },
          ],
        }),
      ],
      products: [planter],
      printers: 1,
      now,
    });
    assert.deepEqual(queue.demand, [
      { material: 'pla', color: 'Grafit', grams: 400 },
      { material: 'pla', color: 'Benvit', grams: 200 },
    ]);
  });

  it('väger måttanpassade produkter efter kundens mått', () => {
    const queue = buildQueue({
      orders: [
        shopOrder({
          id: 'S-1',
          lines: [
            {
              productId: 'p-014',
              name: 'Hylla',
              quantity: 1,
              unitPrice: 647,
              color: 'Benvit',
              parameters: { bredd: 600 },
            },
          ],
        }),
      ],
      products: [shelf],
      printers: 1,
      now,
    });
    // 647/359 gånger grundvikten 285 g.
    assert.equal(queue.demand[0]!.grams, 514);
  });

  it('tar egna printjobb ur offertens vikt', () => {
    const queue = buildQueue({ orders: [customOrder()], printers: 1, now });
    assert.deepEqual(queue.demand, [{ material: 'pla', color: 'valfri', grams: 50 }]);
  });
});

describe('jobFor', () => {
  it('hittar kundens plats i kön oavsett versaler', () => {
    const queue = buildQueue({
      orders: [shopOrder({ id: 'S-1' }), shopOrder({ id: 'S-2' })],
      printers: 1,
      now,
    });
    assert.equal(jobFor(queue, 's-2')?.position, 2);
    assert.equal(jobFor(queue, 'finns-inte'), undefined);
  });
});
