import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildCustomers, findCustomer, searchCustomers, summarize } from '../src/customers.ts';
import type { AnyOrder, OrderLine, OrderStatus } from '../src/types.ts';

function order(over: {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  total?: number;
  status?: OrderStatus;
  city?: string;
  address?: string;
  lines?: OrderLine[];
  phone?: string;
}): AnyOrder {
  return {
    id: over.id,
    type: 'shop',
    createdAt: over.createdAt,
    status: over.status ?? 'levererad',
    customer: {
      name: over.name ?? 'Anna Andersson',
      email: over.email,
      address: over.address ?? 'Storgatan 1',
      postalCode: '11234',
      city: over.city ?? 'Stockholm',
      ...(over.phone ? { phone: over.phone } : {}),
    },
    lines: over.lines ?? [
      { productId: 'p-001', name: 'Kruka', quantity: 1, unitPrice: 349, color: 'Grafit' },
    ],
    shipping: 0,
    subtotal: over.total ?? 349,
    total: over.total ?? 349,
    history: [{ status: 'mottagen', at: over.createdAt }],
  } as AnyOrder;
}

describe('kundregistret', () => {
  it('är tomt utan ordrar', () => {
    assert.deepEqual(buildCustomers([]), []);
  });

  it('slår ihop ordrar på mejladressen, oavsett versaler', () => {
    const customers = buildCustomers([
      order({ id: 'S-1', email: 'Anna@Example.com', createdAt: '2026-01-01T10:00:00.000Z' }),
      order({ id: 'S-2', email: 'anna@example.com', createdAt: '2026-02-01T10:00:00.000Z' }),
    ]);
    assert.equal(customers.length, 1);
    assert.equal(customers[0]!.email, 'anna@example.com');
    assert.equal(customers[0]!.orders, 2);
    assert.equal(customers[0]!.returning, true);
  });

  it('den senaste ordern bestämmer namn och adress, för folk flyttar', () => {
    const customers = buildCustomers([
      order({
        id: 'S-1',
        email: 'anna@example.com',
        name: 'Anna A',
        address: 'Storgatan 1',
        city: 'Stockholm',
        createdAt: '2026-01-01T10:00:00.000Z',
      }),
      order({
        id: 'S-2',
        email: 'anna@example.com',
        name: 'Anna Berg',
        address: 'Lilla vägen 2',
        city: 'Göteborg',
        phone: '0701234567',
        createdAt: '2026-02-01T10:00:00.000Z',
      }),
    ]);
    assert.equal(customers[0]!.name, 'Anna Berg');
    assert.equal(customers[0]!.address, 'Lilla vägen 2');
    assert.equal(customers[0]!.city, 'Göteborg');
    assert.equal(customers[0]!.phone, '0701234567');
  });

  it('håller ordning på första och senaste ordern även i oordnad lista', () => {
    const customers = buildCustomers([
      order({ id: 'S-2', email: 'a@b.se', createdAt: '2026-02-01T10:00:00.000Z' }),
      order({ id: 'S-1', email: 'a@b.se', createdAt: '2026-01-01T10:00:00.000Z' }),
    ]);
    assert.equal(customers[0]!.firstOrderAt, '2026-01-01T10:00:00.000Z');
    assert.equal(customers[0]!.lastOrderAt, '2026-02-01T10:00:00.000Z');
    // Ordernumren listas med det senaste först.
    assert.deepEqual(customers[0]!.orderIds, ['S-2', 'S-1']);
  });

  it('avbrutna ordrar räknas inte som omsättning men syns i statusfördelningen', () => {
    const customers = buildCustomers([
      order({ id: 'S-1', email: 'a@b.se', createdAt: '2026-01-01T10:00:00.000Z', total: 500 }),
      order({
        id: 'S-2',
        email: 'a@b.se',
        createdAt: '2026-02-01T10:00:00.000Z',
        total: 900,
        status: 'avbruten',
      }),
    ]);
    assert.equal(customers[0]!.spent, 500);
    assert.equal(customers[0]!.orders, 2);
    assert.equal(customers[0]!.statuses.avbruten, 1);
    assert.equal(customers[0]!.statuses.levererad, 1);
  });

  it('listar favoriterna med flest exemplar först', () => {
    const customers = buildCustomers([
      order({
        id: 'S-1',
        email: 'a@b.se',
        createdAt: '2026-01-01T10:00:00.000Z',
        lines: [
          { productId: 'p-001', name: 'Kruka', quantity: 1, unitPrice: 349, color: 'Grafit' },
          { productId: 'p-002', name: 'Vas', quantity: 3, unitPrice: 299, color: 'Benvit' },
        ],
      }),
      order({
        id: 'S-2',
        email: 'a@b.se',
        createdAt: '2026-02-01T10:00:00.000Z',
        lines: [
          { productId: 'p-001', name: 'Kruka', quantity: 5, unitPrice: 349, color: 'Grafit' },
        ],
      }),
    ]);
    assert.deepEqual(
      customers[0]!.favourites.map((entry) => `${entry.name}:${entry.quantity}`),
      ['Kruka:6', 'Vas:3'],
    );
  });

  it('den som handlat senast ligger först', () => {
    const customers = buildCustomers([
      order({ id: 'S-1', email: 'gammal@b.se', createdAt: '2026-01-01T10:00:00.000Z' }),
      order({ id: 'S-2', email: 'ny@b.se', createdAt: '2026-03-01T10:00:00.000Z' }),
    ]);
    assert.deepEqual(
      customers.map((customer) => customer.email),
      ['ny@b.se', 'gammal@b.se'],
    );
  });

  it('hoppar över ordrar utan mejladress', () => {
    assert.deepEqual(
      buildCustomers([order({ id: 'S-1', email: '  ', createdAt: '2026-01-01T10:00:00.000Z' })]),
      [],
    );
  });
});

describe('sökning', () => {
  const customers = buildCustomers([
    order({
      id: 'S2026-AB12',
      email: 'anna@example.com',
      name: 'Anna Andersson',
      city: 'Stockholm',
      createdAt: '2026-01-01T10:00:00.000Z',
    }),
    order({
      id: 'S2026-CD34',
      email: 'bo@example.com',
      name: 'Bo Lund',
      city: 'Göteborg',
      createdAt: '2026-02-01T10:00:00.000Z',
    }),
  ]);

  it('hittar på namn, adress, ort och ordernummer', () => {
    assert.equal(searchCustomers(customers, 'anna')[0]?.email, 'anna@example.com');
    assert.equal(searchCustomers(customers, 'GÖTEBORG')[0]?.email, 'bo@example.com');
    assert.equal(searchCustomers(customers, 's2026-ab12')[0]?.email, 'anna@example.com');
    assert.equal(searchCustomers(customers, 'example.com').length, 2);
  });

  it('en tom sökning lämnar listan som den är', () => {
    assert.equal(searchCustomers(customers, '   ').length, 2);
  });

  it('findCustomer bryr sig inte om versaler', () => {
    assert.equal(findCustomer(customers, 'ANNA@example.com')?.name, 'Anna Andersson');
    assert.equal(findCustomer(customers, 'finns-inte@b.se'), undefined);
  });
});

describe('summarize', () => {
  it('räknar kunder, återkommande och snittorder', () => {
    const customers = buildCustomers([
      order({ id: 'S-1', email: 'a@b.se', createdAt: '2026-01-01T10:00:00.000Z', total: 400 }),
      order({ id: 'S-2', email: 'a@b.se', createdAt: '2026-02-01T10:00:00.000Z', total: 600 }),
      order({ id: 'S-3', email: 'c@d.se', createdAt: '2026-02-02T10:00:00.000Z', total: 200 }),
    ]);
    assert.deepEqual(summarize(customers), { customers: 2, returning: 1, averageOrder: 400 });
  });

  it('tål att det inte finns några kunder', () => {
    assert.deepEqual(summarize([]), { customers: 0, returning: 0, averageOrder: 0 });
  });
});
