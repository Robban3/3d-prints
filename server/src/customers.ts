import type { AnyOrder, OrderStatus } from './types.ts';

/**
 * Kundregistret, räknat ur ordrarna.
 *
 * Det finns inget separat register att hålla i synk, och det är med flit: en
 * kund är någon som har lagt en order, och adressen som gäller är den på den
 * senaste ordern. Ett register vid sidan av skulle bara hinna bli osant.
 *
 * Nyckeln är mejladressen i gemener. Samma person som handlat med två adresser
 * blir två kunder – det är ärligare än att gissa att de hör ihop.
 *
 * Ren räkning: modulen vet ingenting om disk eller HTTP.
 */

export interface CustomerFavourite {
  productId: string;
  name: string;
  quantity: number;
}

export interface CustomerRecord {
  email: string;
  name: string;
  phone?: string;
  /** Adressen på den senaste ordern. */
  address: string;
  postalCode: string;
  city: string;
  orders: number;
  /** Summan av ordrar som inte avbrutits. */
  spent: number;
  firstOrderAt: string;
  lastOrderAt: string;
  /** Ordernummer, senaste först. */
  orderIds: string[];
  statuses: Partial<Record<OrderStatus, number>>;
  /** Mest köpta produkter, flest först. */
  favourites: CustomerFavourite[];
  /** True när kunden lagt mer än en order. */
  returning: boolean;
}

function key(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Bygger registret. Avbrutna ordrar räknas inte som omsättning men syns i
 * statusfördelningen – annars skulle en avbokning se ut som om den aldrig hänt.
 */
export function buildCustomers(orders: AnyOrder[]): CustomerRecord[] {
  const byEmail = new Map<string, CustomerRecord>();
  const products = new Map<string, Map<string, CustomerFavourite>>();

  // Äldsta först, så "senaste" blir den sista som skriver över.
  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const order of sorted) {
    const email = key(order.customer.email);
    if (!email) continue;

    const existing = byEmail.get(email);
    const record: CustomerRecord = existing ?? {
      email,
      name: order.customer.name,
      address: order.customer.address,
      postalCode: order.customer.postalCode,
      city: order.customer.city,
      orders: 0,
      spent: 0,
      firstOrderAt: order.createdAt,
      lastOrderAt: order.createdAt,
      orderIds: [],
      statuses: {},
      favourites: [],
      returning: false,
    };

    // Senaste ordern bestämmer namn och adress: folk flyttar.
    record.name = order.customer.name;
    record.address = order.customer.address;
    record.postalCode = order.customer.postalCode;
    record.city = order.customer.city;
    if (order.customer.phone) record.phone = order.customer.phone;

    record.orders += 1;
    record.returning = record.orders > 1;
    record.lastOrderAt = order.createdAt;
    record.orderIds.unshift(order.id);
    record.statuses[order.status] = (record.statuses[order.status] ?? 0) + 1;
    if (order.status !== 'avbruten') record.spent += order.total;

    if (order.type === 'shop') {
      const favourites = products.get(email) ?? new Map<string, CustomerFavourite>();
      for (const line of order.lines) {
        const current = favourites.get(line.productId);
        if (current) current.quantity += line.quantity;
        else
          favourites.set(line.productId, {
            productId: line.productId,
            name: line.name,
            quantity: line.quantity,
          });
      }
      products.set(email, favourites);
    }

    byEmail.set(email, record);
  }

  for (const [email, favourites] of products) {
    const record = byEmail.get(email);
    if (!record) continue;
    record.favourites = [...favourites.values()]
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'sv'))
      .slice(0, 5);
  }

  // Den som handlat senast först: det är den man oftast letar efter.
  return [...byEmail.values()].sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}

/** Fritextsökning på namn, mejladress och ort. */
export function searchCustomers(customers: CustomerRecord[], search: string): CustomerRecord[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return customers;
  return customers.filter((customer) =>
    [customer.name, customer.email, customer.city, ...customer.orderIds]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );
}

export function findCustomer(
  customers: CustomerRecord[],
  email: string,
): CustomerRecord | undefined {
  const wanted = key(email);
  return customers.find((customer) => customer.email === wanted);
}

export interface CustomerSummary {
  customers: number;
  returning: number;
  /** Genomsnittligt ordervärde över alla kunder, avrundat till hela kronor. */
  averageOrder: number;
}

export function summarize(customers: CustomerRecord[]): CustomerSummary {
  const orders = customers.reduce((sum, customer) => sum + customer.orders, 0);
  const spent = customers.reduce((sum, customer) => sum + customer.spent, 0);
  return {
    customers: customers.length,
    returning: customers.filter((customer) => customer.returning).length,
    averageOrder: orders > 0 ? Math.round(spent / orders) : 0,
  };
}
