import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchProducts, placeOrder } from '../src/lib/api';

const originalFetch = global.fetch;

function respondWith(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('API-klienten', () => {
  it('bygger frågesträngen av filter', async () => {
    const fetchMock = respondWith(200, { products: [], total: 0 });
    global.fetch = fetchMock;
    await fetchProducts({ category: 'kontor', search: 'kruka' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products?category=kontor&search=kruka');
  });

  it('utelämnar kategorin när allt visas', async () => {
    const fetchMock = respondWith(200, { products: [], total: 0 });
    global.fetch = fetchMock;
    await fetchProducts({ category: 'alla' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products');
  });

  it('gör om ett felsvar till ApiError med fälten kvar', async () => {
    global.fetch = respondWith(400, {
      error: 'Kontrollera fälten nedan',
      fields: { 'customer.email': 'Ange en giltig e-postadress.' },
    });
    await expect(placeOrder({ customer: {} as never, lines: [] })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Kontrollera fälten nedan',
      fields: { 'customer.email': 'Ange en giltig e-postadress.' },
    });
  });

  it('behåller lagerfel så att kassan kan visa dem', async () => {
    global.fetch = respondWith(409, {
      error: 'Lagersaldot räcker inte längre',
      fields: { 'stock.p-005': 'Luna månlampa är slut i lager just nu.' },
    });
    try {
      await placeOrder({ customer: {} as never, lines: [] });
      expect.unreachable('skulle ha kastat');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).fields['stock.p-005']).toMatch(/slut i lager/);
    }
  });

  it('säger till när servern inte går att nå', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('nätverksfel'));
    await expect(fetchProducts()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: expect.stringContaining('Kunde inte nå servern'),
    });
  });
});
