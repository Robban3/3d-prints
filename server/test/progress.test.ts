import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { printProgress, productionHoursFor } from '../src/progress.ts';
import type { AnyOrder, OrderStatus, StatusEvent } from '../src/types.ts';

const customer = {
  name: 'Anna Andersson',
  email: 'anna@example.com',
  address: 'Storgatan 1',
  postalCode: '11234',
  city: 'Stockholm',
};

const started = '2026-10-10T08:00:00.000Z';

function history(...steps: Array<[OrderStatus, string]>): StatusEvent[] {
  return steps.map(([status, at]) => ({ status, at }));
}

function shopOrder(over: Partial<AnyOrder> = {}): AnyOrder {
  return {
    id: 'S2026-1',
    type: 'shop',
    createdAt: '2026-10-09T10:00:00.000Z',
    status: 'i_produktion',
    customer,
    lines: [{ productId: 'p-001', name: 'Kruka', quantity: 1, unitPrice: 349, color: 'Grafit' }],
    shipping: 0,
    subtotal: 349,
    total: 349,
    productionHours: 10,
    history: history(['mottagen', '2026-10-09T10:00:00.000Z'], ['i_produktion', started]),
    ...over,
  } as AnyOrder;
}

function customOrder(over: Partial<AnyOrder> = {}): AnyOrder {
  return {
    id: 'C2026-1',
    type: 'custom',
    createdAt: '2026-10-09T10:00:00.000Z',
    status: 'i_produktion',
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
    history: history(['mottagen', '2026-10-09T10:00:00.000Z'], ['i_produktion', started]),
    ...over,
  } as AnyOrder;
}

/** En tidpunkt så många timmar efter produktionsstart. */
function hoursIn(hours: number): Date {
  return new Date(new Date(started).getTime() + hours * 3_600_000);
}

describe('productionHoursFor', () => {
  it('tar printtiden ur offerten för ett kundunikt jobb', () => {
    assert.equal(productionHoursFor(customOrder()), 8);
  });

  it('tar printtiden från ordern för en butiksorder', () => {
    assert.equal(productionHoursFor(shopOrder()), 10);
  });

  it('svarar undefined när tiden saknas eller är noll', () => {
    assert.equal(productionHoursFor(shopOrder({ productionHours: undefined })), undefined);
    assert.equal(productionHoursFor(shopOrder({ productionHours: 0 })), undefined);
  });
});

describe('printProgress', () => {
  it('räknar fram andelen utifrån förfluten tid', () => {
    const progress = printProgress(shopOrder(), hoursIn(2.5))!;
    assert.equal(progress.share, 0.25);
    assert.equal(progress.remainingHours, 7.5);
    assert.equal(progress.done, false);
    assert.equal(progress.overdue, false);
    assert.equal(progress.startedAt, started);
    assert.equal(progress.hours, 10);
  });

  it('börjar på noll i samma stund jobbet startar', () => {
    assert.equal(printProgress(shopOrder(), hoursIn(0))!.share, 0);
  });

  it('stannar på 99 procent så länge jobbet pågår', () => {
    // Att visa 100 % på något som inte är klart är ett löfte vi inte kan hålla.
    const progress = printProgress(shopOrder(), hoursIn(9.99))!;
    assert.ok(progress.share <= 0.99);
    assert.equal(progress.done, false);
  });

  it('markerar ett jobb som dragit över tiden', () => {
    const progress = printProgress(shopOrder(), hoursIn(14))!;
    assert.equal(progress.overdue, true);
    assert.equal(progress.share, 0.99);
    assert.equal(progress.remainingHours, 0);
  });

  it('går inte under noll om klockan går fel', () => {
    assert.equal(printProgress(shopOrder(), hoursIn(-3))!.share, 0);
  });

  it('räknar ett skickat jobb som klart', () => {
    const order = shopOrder({
      status: 'skickad',
      history: history(
        ['mottagen', '2026-10-09T10:00:00.000Z'],
        ['i_produktion', started],
        ['skickad', '2026-10-10T16:00:00.000Z'],
      ),
    });
    const progress = printProgress(order, hoursIn(3))!;
    assert.equal(progress.done, true);
    assert.equal(progress.share, 1);
    assert.equal(progress.remainingHours, 0);
    assert.equal(progress.overdue, false);
  });

  it('räknar ett levererat jobb som klart', () => {
    const order = shopOrder({
      status: 'levererad',
      history: history(['i_produktion', started], ['levererad', '2026-10-12T09:00:00.000Z']),
    });
    assert.equal(printProgress(order, hoursIn(100))!.done, true);
  });

  it('säger ingenting om en order som inte börjat printas', () => {
    assert.equal(printProgress(shopOrder({ status: 'mottagen' }), hoursIn(1)), undefined);
  });

  it('säger ingenting om en avbruten order', () => {
    assert.equal(printProgress(shopOrder({ status: 'avbruten' }), hoursIn(1)), undefined);
  });

  it('säger ingenting när printtiden saknas', () => {
    assert.equal(printProgress(shopOrder({ productionHours: undefined }), hoursIn(1)), undefined);
  });

  it('säger ingenting när historiken inte visar någon start', () => {
    const order = shopOrder({
      history: history(['mottagen', '2026-10-09T10:00:00.000Z']),
    });
    assert.equal(printProgress(order, hoursIn(1)), undefined);
  });

  it('räknar från den senaste starten när ordern gått tillbaka och in igen', () => {
    const order = shopOrder({
      history: history(
        ['i_produktion', '2026-10-01T08:00:00.000Z'],
        ['mottagen', '2026-10-02T08:00:00.000Z'],
        ['i_produktion', started],
      ),
    });
    const progress = printProgress(order, hoursIn(5))!;
    assert.equal(progress.startedAt, started);
    assert.equal(progress.share, 0.5);
  });

  it('fungerar likadant för ett kundunikt jobb', () => {
    const progress = printProgress(customOrder(), hoursIn(4))!;
    assert.equal(progress.hours, 8);
    assert.equal(progress.share, 0.5);
  });
});
