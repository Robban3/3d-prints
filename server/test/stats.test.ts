import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { buildStats, lowStockThreshold } from '../src/stats.ts';
import type { AnyOrder, OrderStatus } from '../src/types.ts';

const customer = {
  name: 'Anna Andersson',
  email: 'anna@example.com',
  address: 'Storgatan 1',
  postalCode: '11234',
  city: 'Stockholm',
};

let counter = 0;

function shopOrder(
  over: Partial<AnyOrder> & {
    lines?: Array<{ productId: string; name: string; quantity: number; unitPrice: number }>;
  } = {},
): AnyOrder {
  counter += 1;
  const lines = (
    over.lines ?? [{ productId: 'p-001', name: 'Kruka', quantity: 1, unitPrice: 349 }]
  ).map((line) => ({ ...line, color: 'Grafit' }));
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return {
    id: `S2026-${counter}`,
    type: 'shop',
    createdAt: '2026-10-09T10:00:00.000Z',
    status: 'mottagen',
    customer,
    lines,
    shipping: 0,
    subtotal,
    total: subtotal,
    history: [],
    ...over,
  } as AnyOrder;
}

function customOrder(over: Partial<AnyOrder> = {}): AnyOrder {
  counter += 1;
  return {
    id: `C2026-${counter}`,
    type: 'custom',
    createdAt: '2026-10-09T10:00:00.000Z',
    status: 'mottagen',
    customer,
    request: {
      material: 'pla',
      quality: 'standard',
      volumeCm3: 40,
      infill: 20,
      quantity: 1,
      rush: false,
      postProcessing: false,
    },
    projectName: 'Fäste',
    description: 'Ett fäste till kameran.',
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
    total: 500,
    history: [],
    ...over,
  } as AnyOrder;
}

const products = [
  { id: 'p-001', name: 'Kruka' },
  { id: 'p-002', name: 'Hållare' },
  { id: 'p-003', name: 'Lampa' },
];

const now = new Date('2026-10-09T12:00:00.000Z');

function stats(orders: AnyOrder[], stock = new Map<string, number>(), extra = {}) {
  return buildStats({ orders, stock, products, now, ...extra });
}

describe('omsättning', () => {
  it('summerar ordrarna', () => {
    const result = stats([shopOrder(), customOrder()]);
    assert.equal(result.revenue.total, 849);
    assert.equal(result.orders.total, 2);
    assert.equal(result.orders.shop, 1);
    assert.equal(result.orders.custom, 1);
  });

  it('räknar inte avbrutna ordrar som omsättning', () => {
    const result = stats([shopOrder(), shopOrder({ status: 'avbruten' })]);
    assert.equal(result.revenue.total, 349);
    assert.equal(result.orders.active, 1);
    assert.equal(result.orders.cancelled, 1);
    // Men de ska synas i fördelningen – en avbokning har hänt.
    assert.equal(result.orders.byStatus.avbruten, 1);
    assert.equal(result.orders.total, 2);
  });

  it('ger snittordervärdet på de ordrar som gäller', () => {
    const result = stats([
      shopOrder(),
      customOrder(),
      shopOrder({ status: 'avbruten', total: 9999 }),
    ]);
    // (349 + 500) / 2
    assert.equal(result.orders.averageValue, 425);
  });

  it('svarar med noll i snitt när allt är avbrutet', () => {
    const result = stats([shopOrder({ status: 'avbruten' })]);
    assert.equal(result.orders.averageValue, 0);
    assert.equal(result.revenue.total, 0);
  });

  it('fyller dagar utan ordrar med nollor så grafen får en obruten axel', () => {
    const result = stats([shopOrder()], new Map(), { days: 7 });
    assert.equal(result.revenue.byDay.length, 7);
    assert.equal(result.revenue.byDay[0]!.date, '2026-10-03');
    assert.equal(result.revenue.byDay[0]!.revenue, 0);
    assert.equal(result.revenue.byDay.at(-1)!.date, '2026-10-09');
    assert.equal(result.revenue.byDay.at(-1)!.revenue, 349);
    assert.equal(result.peakRevenue, 349);
  });

  it('lägger ordrarna på rätt dag i svensk tid, inte UTC', () => {
    // 23:30 svensk tid den 9:e är 21:30 UTC samma dag …
    const kvall = stats([shopOrder({ createdAt: '2026-10-09T21:30:00.000Z' })], new Map(), {
      days: 2,
    });
    assert.equal(kvall.revenue.byDay.at(-1)!.orders, 1);

    // … medan 00:30 svensk tid den 9:e är 22:30 UTC den 8:e.
    const natt = stats([shopOrder({ createdAt: '2026-10-08T22:30:00.000Z' })], new Map(), {
      days: 2,
    });
    assert.equal(natt.revenue.byDay[0]!.date, '2026-10-08');
    assert.equal(natt.revenue.byDay[0]!.orders, 0);
    assert.equal(natt.revenue.byDay[1]!.orders, 1);
  });

  it('håller perioden skild från totalen', () => {
    const result = stats(
      [shopOrder(), shopOrder({ createdAt: '2025-01-05T10:00:00.000Z' })],
      new Map(),
      {
        days: 7,
      },
    );
    assert.equal(result.revenue.total, 698);
    assert.equal(result.revenue.period, 349);
  });

  it('grupperar per månad och tar de senaste tolv', () => {
    const orders = Array.from({ length: 14 }, (_unused, index) =>
      shopOrder({ createdAt: `2025-${String(index + 1).padStart(2, '0')}-05T10:00:00.000Z` }),
    ).slice(0, 12);
    const result = stats([...orders, shopOrder({ createdAt: '2026-01-05T10:00:00.000Z' })]);
    assert.equal(result.revenue.byMonth.length, 12);
    assert.equal(result.revenue.byMonth.at(-1)!.date, '2026-01');
    // Den äldsta månaden ska ha fallit av.
    assert.equal(result.revenue.byMonth[0]!.date, '2025-02');
  });
});

describe('status', () => {
  it('räknar varje status, även de som inte förekommer', () => {
    const result = stats([
      shopOrder({ status: 'mottagen' }),
      shopOrder({ status: 'mottagen' }),
      shopOrder({ status: 'skickad' }),
    ]);
    assert.deepEqual(result.orders.byStatus, {
      mottagen: 2,
      i_produktion: 0,
      skickad: 1,
      levererad: 0,
      avbruten: 0,
    } satisfies Record<OrderStatus, number>);
    assert.equal(result.orders.waitingToStart, 2);
  });
});

describe('bästsäljare', () => {
  it('summerar antal och omsättning per produkt', () => {
    const result = stats([
      shopOrder({
        lines: [
          { productId: 'p-001', name: 'Kruka', quantity: 2, unitPrice: 349 },
          { productId: 'p-002', name: 'Hållare', quantity: 1, unitPrice: 249 },
        ],
      }),
      shopOrder({ lines: [{ productId: 'p-002', name: 'Hållare', quantity: 5, unitPrice: 249 }] }),
    ]);
    assert.equal(result.bestsellers[0]!.productId, 'p-002');
    assert.equal(result.bestsellers[0]!.quantity, 6);
    assert.equal(result.bestsellers[0]!.revenue, 1494);
    assert.equal(result.bestsellers[1]!.quantity, 2);
  });

  it('räknar inte avbrutna ordrar', () => {
    const result = stats([
      shopOrder({
        status: 'avbruten',
        lines: [{ productId: 'p-001', name: 'Kruka', quantity: 9, unitPrice: 349 }],
      }),
    ]);
    assert.deepEqual(result.bestsellers, []);
  });

  it('tar namnet från katalogen när produkten bytt namn sedan ordern lades', () => {
    const result = stats([
      shopOrder({
        lines: [{ productId: 'p-001', name: 'Gamla namnet', quantity: 1, unitPrice: 349 }],
      }),
    ]);
    assert.equal(result.bestsellers[0]!.name, 'Kruka');
  });

  it('visar högst åtta produkter', () => {
    const orders = Array.from({ length: 12 }, (_unused, index) =>
      shopOrder({
        lines: [{ productId: `p-${index}`, name: `Produkt ${index}`, quantity: 1, unitPrice: 100 }],
      }),
    );
    assert.equal(stats(orders).bestsellers.length, 8);
  });

  it('räknar inte kundunika jobb som produktförsäljning', () => {
    assert.deepEqual(stats([customOrder()]).bestsellers, []);
  });
});

describe('lågt lager', () => {
  const previous = process.env.LOW_STOCK_THRESHOLD;
  afterEach(() => {
    if (previous === undefined) delete process.env.LOW_STOCK_THRESHOLD;
    else process.env.LOW_STOCK_THRESHOLD = previous;
  });

  it('flaggar produkter på eller under gränsen, lägst först', () => {
    const result = stats(
      [],
      new Map([
        ['p-001', 12],
        ['p-002', 5],
        ['p-003', 0],
      ]),
    );
    assert.deepEqual(
      result.lowStock.map((entry) => entry.productId),
      ['p-003', 'p-002'],
    );
    assert.equal(result.lowStock[0]!.watchers, 0);
  });

  it('visar hur många som bevakar en slutsåld produkt', () => {
    const result = stats([], new Map([['p-001', 0]]), {
      watchers: new Map([['p-001', 12]]),
    });
    assert.equal(result.lowStock.find((entry) => entry.productId === 'p-001')?.watchers, 12);
  });

  it('sätter produkten med flest väntande kunder först vid lika saldo', () => {
    const result = stats(
      [],
      new Map([
        ['p-001', 0],
        ['p-002', 0],
        ['p-003', 0],
      ]),
      { watchers: new Map([['p-002', 7]]) },
    );
    assert.equal(result.lowStock[0]!.productId, 'p-002');
  });

  it('räknar en produkt utan saldo som slut', () => {
    const result = stats([], new Map([['p-001', 50]]));
    assert.deepEqual(
      result.lowStock.map((entry) => entry.stock),
      [0, 0],
    );
  });

  it('följer gränsen i LOW_STOCK_THRESHOLD', () => {
    process.env.LOW_STOCK_THRESHOLD = '0';
    const result = stats(
      [],
      new Map([
        ['p-001', 1],
        ['p-002', 0],
        ['p-003', 3],
      ]),
    );
    assert.deepEqual(
      result.lowStock.map((entry) => entry.productId),
      ['p-002'],
    );
  });

  it('faller tillbaka på fem när gränsen inte går att läsa', () => {
    process.env.LOW_STOCK_THRESHOLD = 'inte-ett-tal';
    assert.equal(lowStockThreshold(), 5);
  });
});

describe('omdömen', () => {
  it('visar hur många som väntar på granskning', () => {
    assert.equal(stats([], new Map(), { pendingReviews: 4 }).pendingReviews, 4);
    assert.equal(stats([]).pendingReviews, 0);
  });
});
