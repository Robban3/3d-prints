import type { AnyOrder, OrderStatus } from './types.ts';

/**
 * Sammanställer siffrorna till panelens översikt.
 *
 * Allt räknas fram ur ordrarna varje gång i stället för att hållas i en egen
 * räknare. Det blir aldrig fel på det sättet, och med en butik av den här
 * storleken kostar det ingenting.
 *
 * Avbrutna ordrar räknas inte som omsättning men syns i statusfördelningen –
 * annars skulle en avbokning se ut som om den aldrig hänt.
 */

/** Saldo på eller under den här nivån flaggas i panelen. */
export function lowStockThreshold(): number {
  const raw = Number(process.env.LOW_STOCK_THRESHOLD);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

/** Butiken ligger i Sverige, så dygnsgränsen ska följa svensk tid. */
function zone(): string {
  return process.env.SHOP_TIME_ZONE ?? 'Europe/Stockholm';
}

export interface DayBucket {
  /** Datum som ÅÅÅÅ-MM-DD i butikens tidszon. */
  date: string;
  revenue: number;
  orders: number;
}

export interface Bestseller {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface LowStockItem {
  productId: string;
  name: string;
  stock: number;
  /** Antal kunder som bevakar produkten och väntar på påfyllning. */
  watchers: number;
}

export interface DashboardStats {
  revenue: {
    total: number;
    /** Omsättningen under de dagar som visas i grafen. */
    period: number;
    byDay: DayBucket[];
    byMonth: DayBucket[];
  };
  orders: {
    total: number;
    /** Ordrar som inte avbrutits – de som faktiskt ska produceras. */
    active: number;
    cancelled: number;
    shop: number;
    custom: number;
    averageValue: number;
    byStatus: Record<OrderStatus, number>;
    waitingToStart: number;
  };
  bestsellers: Bestseller[];
  lowStock: LowStockItem[];
  pendingReviews: number;
  /** Dagen med högst omsättning i perioden, för att kunna skala grafen. */
  peakRevenue: number;
}

const ALL_STATUSES: OrderStatus[] = [
  'mottagen',
  'i_produktion',
  'skickad',
  'levererad',
  'avbruten',
];

function dayKey(iso: string, timeZone: string): string {
  // sv-SE skriver datum som ÅÅÅÅ-MM-DD, vilket också sorterar rätt som text.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Dagarna i perioden, bakåt från och med i dag, äldst först. */
function dayRange(days: number, now: Date, timeZone: string): string[] {
  const keys: string[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    keys.push(dayKey(new Date(now.getTime() - back * 86_400_000).toISOString(), timeZone));
  }
  // Nära en tidsomställning kan samma datum falla ut två gånger.
  return [...new Set(keys)];
}

export interface StatsInput {
  orders: AnyOrder[];
  /** Saldo per produkt-id. */
  stock: Map<string, number>;
  products: Array<{ id: string; name: string }>;
  pendingReviews?: number;
  /** Antal bevakningar per produkt-id. */
  watchers?: Map<string, number>;
  /** Hur många dagar grafen ska täcka. */
  days?: number;
  now?: Date;
}

export function buildStats(input: StatsInput): DashboardStats {
  const { orders, stock, products } = input;
  const days = input.days ?? 30;
  const now = input.now ?? new Date();
  const timeZone = zone();
  const names = new Map(products.map((product) => [product.id, product.name]));

  const byStatus = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0])) as Record<
    OrderStatus,
    number
  >;

  const perDay = new Map<string, DayBucket>();
  const perMonth = new Map<string, DayBucket>();
  const sold = new Map<string, Bestseller>();

  let total = 0;
  let active = 0;
  let cancelled = 0;
  let shop = 0;
  let custom = 0;

  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
    if (order.type === 'shop') shop += 1;
    else custom += 1;

    if (order.status === 'avbruten') {
      cancelled += 1;
      continue;
    }
    active += 1;
    total += order.total;

    const day = dayKey(order.createdAt, timeZone);
    const month = day.slice(0, 7);
    for (const [key, map] of [
      [day, perDay],
      [month, perMonth],
    ] as const) {
      const bucket = map.get(key) ?? { date: key, revenue: 0, orders: 0 };
      bucket.revenue += order.total;
      bucket.orders += 1;
      map.set(key, bucket);
    }

    if (order.type !== 'shop') continue;
    for (const line of order.lines) {
      const entry = sold.get(line.productId) ?? {
        productId: line.productId,
        name: names.get(line.productId) ?? line.name,
        quantity: 0,
        revenue: 0,
      };
      entry.quantity += line.quantity;
      entry.revenue += line.unitPrice * line.quantity;
      sold.set(line.productId, entry);
    }
  }

  // Grafen ska ha en obruten axel, så dagar utan ordrar fylls med nollor.
  const byDay = dayRange(days, now, timeZone).map(
    (date) => perDay.get(date) ?? { date, revenue: 0, orders: 0 },
  );
  const period = byDay.reduce((sum, bucket) => sum + bucket.revenue, 0);

  const byMonth = [...perMonth.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-12);

  const bestsellers = [...sold.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 8);

  const threshold = lowStockThreshold();
  const waiting = input.watchers ?? new Map<string, number>();
  const lowStock = products
    .map((product) => ({
      productId: product.id,
      name: product.name,
      stock: stock.get(product.id) ?? 0,
      watchers: waiting.get(product.id) ?? 0,
    }))
    .filter((entry) => entry.stock <= threshold)
    // Den som har flest väntande kunder är mest bråttom att fylla på.
    .sort(
      (a, b) => a.stock - b.stock || b.watchers - a.watchers || a.name.localeCompare(b.name, 'sv'),
    );

  return {
    revenue: {
      total: Math.round(total),
      period: Math.round(period),
      byDay,
      byMonth,
    },
    orders: {
      total: orders.length,
      active,
      cancelled,
      shop,
      custom,
      averageValue: active === 0 ? 0 : Math.round(total / active),
      byStatus,
      waitingToStart: byStatus.mottagen,
    },
    bestsellers,
    lowStock,
    pendingReviews: input.pendingReviews ?? 0,
    peakRevenue: byDay.reduce((max, bucket) => Math.max(max, bucket.revenue), 0),
  };
}
