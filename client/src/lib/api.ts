import type {
  AnyOrder,
  CustomOrder,
  CustomerDetails,
  Product,
  QuoteBreakdown,
  QuoteRequest,
  ShopConfig,
  OrderStatus,
  PaymentSession,
  ShopOrder,
  UploadedFile,
} from '../types';

const BASE = '/api';

export class ApiError extends Error {
  readonly fields: Record<string, string>;
  readonly status: number;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('Kunde inte nå servern. Kontrollera din uppkoppling.', 0);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = (payload ?? {}) as {
      error?: string;
      fields?: Record<string, string>;
    };
    throw new ApiError(body.error ?? 'Något gick fel', response.status, body.fields ?? {});
  }
  return payload as T;
}

export function fetchConfig(): Promise<ShopConfig> {
  return request<ShopConfig>('/config');
}

export function fetchProducts(params: { category?: string; search?: string } = {}): Promise<{
  products: Product[];
  total: number;
}> {
  const query = new URLSearchParams();
  if (params.category && params.category !== 'alla') query.set('category', params.category);
  if (params.search) query.set('search', params.search);
  const suffix = query.toString() ? `?${query}` : '';
  return request(`/products${suffix}`);
}

export function fetchProduct(slug: string): Promise<{ product: Product; related: Product[] }> {
  return request(`/products/${encodeURIComponent(slug)}`);
}

export function fetchQuote(
  payload: QuoteRequest,
): Promise<{ request: QuoteRequest; quote: QuoteBreakdown }> {
  return request('/quote', { method: 'POST', body: JSON.stringify(payload) });
}

export function createPaymentSession(
  payload:
    | {
        type: 'shop';
        lines: Array<{ productId: string; quantity: number; color: string; size?: string }>;
      }
    | { type: 'custom'; request: QuoteRequest; projectName: string },
): Promise<{ session: PaymentSession; amount: number }> {
  return request('/payments/session', { method: 'POST', body: JSON.stringify(payload) });
}

export function placeOrder(payload: {
  customer: CustomerDetails;
  lines: Array<{
    productId: string;
    quantity: number;
    color: string;
    size?: string;
  }>;
  authorizationToken?: string;
}): Promise<{ order: ShopOrder }> {
  return request('/orders', { method: 'POST', body: JSON.stringify(payload) });
}

export function placeCustomOrder(payload: {
  customer: CustomerDetails;
  request: QuoteRequest;
  projectName: string;
  description: string;
  fileId?: string;
  authorizationToken?: string;
}): Promise<{ order: CustomOrder }> {
  return request('/custom-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchOrder(id: string): Promise<{ order: AnyOrder }> {
  return request(`/orders/${encodeURIComponent(id)}`);
}

/**
 * Laddar upp modellfilen. XMLHttpRequest används i stället för fetch eftersom
 * det är det enda sättet att följa uppladdningens förlopp, och stora STL-filer
 * kan ta en stund.
 */
export function uploadModelFile(
  file: File,
  onProgress?: (percent: number) => void,
): { promise: Promise<UploadedFile>; abort: () => void } {
  const request = new XMLHttpRequest();
  const promise = new Promise<UploadedFile>((resolve, reject) => {
    const body = new FormData();
    body.append('file', file);

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener('load', () => {
      let payload: { upload?: UploadedFile; error?: string } = {};
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        payload = {};
      }
      if (request.status >= 200 && request.status < 300 && payload.upload) {
        resolve(payload.upload);
      } else {
        reject(new ApiError(payload.error ?? 'Uppladdningen misslyckades', request.status));
      }
    });
    request.addEventListener('error', () =>
      reject(new ApiError('Uppladdningen avbröts. Kontrollera din uppkoppling.', 0)),
    );
    request.addEventListener('abort', () => reject(new ApiError('Uppladdningen avbröts.', 0)));

    request.open('POST', `${BASE}/uploads`);
    request.send(body);
  });

  return { promise, abort: () => request.abort() };
}

export function fetchAdminStatus(): Promise<{ enabled: boolean }> {
  return request('/admin/status');
}

export function fetchAdminOrders(
  token: string,
): Promise<{ orders: Array<AnyOrder & { next: OrderStatus[] }>; total: number }> {
  return request('/admin/orders', { headers: { Authorization: `Bearer ${token}` } });
}

export function setOrderStatus(
  token: string,
  id: string,
  status: OrderStatus,
  note?: string,
): Promise<{ order: AnyOrder; next: OrderStatus[]; mail?: { delivered: boolean; path?: string } }> {
  return request(`/admin/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, note }),
  });
}

export async function deleteUpload(id: string): Promise<void> {
  await fetch(`${BASE}/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
