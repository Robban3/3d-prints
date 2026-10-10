import { describe, expect, it } from 'vitest';
import { printProgress, productionHoursFor } from '../src/lib/progress';
import type { AnyOrder, OrderStatus, StatusEvent } from '../src/types';

/**
 * Samma siffror som i serverns progress.test.ts. Glider de två uträkningarna
 * isär ska ett av testerna gå sönder – mätaren får inte visa en annan siffra
 * än den servern skulle räkna fram.
 */

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

function hoursIn(hours: number): Date {
  return new Date(new Date(started).getTime() + hours * 3_600_000);
}

describe('productionHoursFor', () => {
  it('tar printtiden från ordern', () => {
    expect(productionHoursFor(shopOrder())).toBe(10);
  });

  it('svarar undefined när tiden saknas eller är noll', () => {
    expect(productionHoursFor(shopOrder({ productionHours: undefined }))).toBeUndefined();
    expect(productionHoursFor(shopOrder({ productionHours: 0 }))).toBeUndefined();
  });
});

describe('printProgress', () => {
  it('räknar fram andelen utifrån förfluten tid', () => {
    const progress = printProgress(shopOrder(), hoursIn(2.5))!;
    expect(progress.share).toBe(0.25);
    expect(progress.remainingHours).toBe(7.5);
    expect(progress.done).toBe(false);
    expect(progress.overdue).toBe(false);
  });

  it('börjar på noll i samma stund jobbet startar', () => {
    expect(printProgress(shopOrder(), hoursIn(0))!.share).toBe(0);
  });

  it('stannar på 99 procent så länge jobbet pågår', () => {
    const progress = printProgress(shopOrder(), hoursIn(9.99))!;
    expect(progress.share).toBe(0.99);
    expect(progress.done).toBe(false);
  });

  it('markerar ett jobb som dragit över tiden', () => {
    const progress = printProgress(shopOrder(), hoursIn(14))!;
    expect(progress.overdue).toBe(true);
    expect(progress.remainingHours).toBe(0);
  });

  it('går inte under noll om klockan går fel', () => {
    expect(printProgress(shopOrder(), hoursIn(-3))!.share).toBe(0);
  });

  it('räknar ett skickat jobb som klart', () => {
    const order = shopOrder({
      status: 'skickad',
      history: history(['i_produktion', started], ['skickad', '2026-10-10T16:00:00.000Z']),
    });
    const progress = printProgress(order, hoursIn(3))!;
    expect(progress.done).toBe(true);
    expect(progress.share).toBe(1);
  });

  it('säger ingenting om en order som inte börjat printas', () => {
    expect(printProgress(shopOrder({ status: 'mottagen' }), hoursIn(1))).toBeUndefined();
  });

  it('säger ingenting om en avbruten order', () => {
    expect(printProgress(shopOrder({ status: 'avbruten' }), hoursIn(1))).toBeUndefined();
  });

  it('säger ingenting när printtiden saknas', () => {
    expect(printProgress(shopOrder({ productionHours: undefined }), hoursIn(1))).toBeUndefined();
  });

  it('säger ingenting när historiken inte visar någon start', () => {
    const order = shopOrder({ history: history(['mottagen', '2026-10-09T10:00:00.000Z']) });
    expect(printProgress(order, hoursIn(1))).toBeUndefined();
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
    expect(progress.startedAt).toBe(started);
    expect(progress.share).toBe(0.5);
  });
});
