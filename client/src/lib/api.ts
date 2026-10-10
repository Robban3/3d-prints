import type {
  AdminReview,
  AnyOrder,
  AppliedDiscount,
  Campaign,
  CustomOrder,
  CustomerDetails,
  Product,
  QuoteBreakdown,
  QuoteRequest,
  ShopConfig,
  AdminCategory,
  AdminMaterial,
  AuditEntry,
  Category,
  Material,
  ModelAnalysis,
  Quality,
  OrderStatus,
  PaymentSession,
  DashboardStats,
  DiscountCode,
  HeroContent,
  HomeContent,
  ImportResult,
  Media,
  ProductDraft,
  Review,
  ReviewStatus,
  ReviewSummary,
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

/** Startsidans hero och de kampanjer som är igång. */
export function fetchHomeContent(): Promise<HomeContent> {
  return request('/content/home');
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

export function fetchProduct(slug: string): Promise<{
  product: Product;
  related: Product[];
  reviews: Review[];
  reviewSummary: ReviewSummary | null;
}> {
  return request(`/products/${encodeURIComponent(slug)}`);
}

/**
 * Lämnar ett omdöme. Det hamnar i kö för granskning, så svaret bekräftar att vi
 * tagit emot det – inte att det syns i butiken.
 */
export function submitReview(
  slug: string,
  review: { author: string; email: string; rating: number; title: string; body: string },
): Promise<{ review: Review; status: string }> {
  return request(`/products/${encodeURIComponent(slug)}/reviews`, {
    method: 'POST',
    body: JSON.stringify(review),
  });
}

/** Bevakar en slutsåld produkt. Ger ett mejl när saldot fyllts på. */
export function watchStock(
  slug: string,
  email: string,
): Promise<{ watching: boolean; productName: string }> {
  return request(`/products/${encodeURIComponent(slug)}/notify`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/**
 * Har kunden laddat upp en fil skickas dess id med, och servern räknar på den
 * uppmätta volymen i stället för den som ligger i formuläret.
 */
export function fetchQuote(
  payload: QuoteRequest,
  fileId?: string,
): Promise<{ request: QuoteRequest; quote: QuoteBreakdown; model?: ModelAnalysis }> {
  return request('/quote', {
    method: 'POST',
    body: JSON.stringify(fileId ? { request: payload, fileId } : payload),
  });
}

/** Prövar en rabattkod mot varukorgen. Beloppet räknas av servern. */
export function checkDiscount(
  code: string,
  lines: Array<{ productId: string; quantity: number; color: string; size?: string }>,
): Promise<{ discount: AppliedDiscount; subtotal: number }> {
  return request('/discounts/check', { method: 'POST', body: JSON.stringify({ code, lines }) });
}

export function createPaymentSession(
  payload:
    | {
        type: 'shop';
        lines: Array<{ productId: string; quantity: number; color: string; size?: string }>;
        code?: string;
        shippingOption?: string;
      }
    | { type: 'custom'; request: QuoteRequest; projectName: string; fileId?: string },
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
  code?: string;
  shippingOption?: string;
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

/* ---------- Katalogen i adminpanelen ---------- */

function adminInit(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } };
}

export function fetchAdminProducts(token: string): Promise<{ products: Product[]; total: number }> {
  return request('/admin/products', adminInit(token));
}

export function createProduct(token: string, draft: ProductDraft): Promise<{ product: Product }> {
  return request(
    '/admin/products',
    adminInit(token, { method: 'POST', body: JSON.stringify(draft) }),
  );
}

export function updateProduct(
  token: string,
  id: string,
  draft: ProductDraft,
): Promise<{ product: Product }> {
  return request(
    `/admin/products/${encodeURIComponent(id)}`,
    adminInit(token, { method: 'PATCH', body: JSON.stringify(draft) }),
  );
}

export function deleteProduct(token: string, id: string): Promise<{ product: Product }> {
  return request(
    `/admin/products/${encodeURIComponent(id)}`,
    adminInit(token, { method: 'DELETE' }),
  );
}

export function fetchAdminCategories(token: string): Promise<{ categories: AdminCategory[] }> {
  return request('/admin/categories', adminInit(token));
}

export function createCategory(
  token: string,
  category: Omit<Category, 'id'> & { id?: string },
): Promise<{ category: Category }> {
  return request(
    '/admin/categories',
    adminInit(token, { method: 'POST', body: JSON.stringify(category) }),
  );
}

export function updateCategory(
  token: string,
  id: string,
  category: Partial<Category>,
): Promise<{ category: Category }> {
  return request(
    `/admin/categories/${encodeURIComponent(id)}`,
    adminInit(token, { method: 'PATCH', body: JSON.stringify(category) }),
  );
}

export function deleteCategory(token: string, id: string): Promise<{ category: Category }> {
  return request(
    `/admin/categories/${encodeURIComponent(id)}`,
    adminInit(token, { method: 'DELETE' }),
  );
}

/** Laddar upp en produktbild. Returnerar id och adress att spara på produkten. */
export function uploadProductImage(file: File): {
  promise: Promise<{ id: string; url: string; fileName: string }>;
  abort: () => void;
} {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ id: string; url: string; fileName: string }>((resolve, reject) => {
    const body = new FormData();
    body.append('file', file);
    xhr.addEventListener('load', () => {
      let payload: { image?: { id: string; url: string; fileName: string }; error?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText) as typeof payload;
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.image) resolve(payload.image);
      else reject(new ApiError(payload.error ?? 'Bilden kunde inte laddas upp', xhr.status));
    });
    xhr.addEventListener('error', () =>
      reject(new ApiError('Uppladdningen avbröts. Kontrollera din uppkoppling.', 0)),
    );
    xhr.open('POST', `${BASE}/uploads/images`);
    xhr.send(body);
  });
  return { promise, abort: () => xhr.abort() };
}

export function fetchAdminMaterials(
  token: string,
): Promise<{ materials: AdminMaterial[]; qualities: Quality[] }> {
  return request('/admin/materials', adminInit(token));
}

export function saveMaterial(
  token: string,
  material: Material,
  isNew: boolean,
): Promise<{ material: Material }> {
  return isNew
    ? request(
        '/admin/materials',
        adminInit(token, { method: 'POST', body: JSON.stringify(material) }),
      )
    : request(
        `/admin/materials/${encodeURIComponent(material.id)}`,
        adminInit(token, { method: 'PATCH', body: JSON.stringify(material) }),
      );
}

export function deleteMaterial(token: string, id: string): Promise<{ material: Material }> {
  return request(
    `/admin/materials/${encodeURIComponent(id)}`,
    adminInit(token, { method: 'DELETE' }),
  );
}

export function saveQuality(
  token: string,
  quality: Quality,
  isNew: boolean,
): Promise<{ quality: Quality }> {
  return isNew
    ? request(
        '/admin/qualities',
        adminInit(token, { method: 'POST', body: JSON.stringify(quality) }),
      )
    : request(
        `/admin/qualities/${encodeURIComponent(quality.id)}`,
        adminInit(token, { method: 'PATCH', body: JSON.stringify(quality) }),
      );
}

export function deleteQuality(token: string, id: string): Promise<{ quality: Quality }> {
  return request(
    `/admin/qualities/${encodeURIComponent(id)}`,
    adminInit(token, { method: 'DELETE' }),
  );
}

export function exportCatalog(token: string): Promise<Record<string, unknown>> {
  return request('/admin/catalog/export', adminInit(token));
}

/** Utan `apply` returneras bara en plan över vad importen skulle göra. */
export function importCatalog(
  token: string,
  catalog: unknown,
  apply: boolean,
): Promise<ImportResult> {
  return request(
    '/admin/catalog/import',
    adminInit(token, { method: 'POST', body: JSON.stringify({ catalog, apply }) }),
  );
}

export function fetchHistory(token: string): Promise<{ entries: AuditEntry[] }> {
  return request('/admin/history', adminInit(token));
}

export async function deleteUpload(id: string): Promise<void> {
  await fetch(`${BASE}/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ---------- Omdömen och översikt i panelen ---------- */

export function fetchAdminReviews(
  token: string,
  status?: ReviewStatus,
): Promise<{ reviews: AdminReview[]; waiting: number }> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/admin/reviews${query}`, adminInit(token));
}

export function moderateReview(
  token: string,
  id: string,
  status: ReviewStatus,
  reply?: string,
): Promise<{ review: AdminReview; waiting: number }> {
  return request(
    `/admin/reviews/${encodeURIComponent(id)}`,
    adminInit(token, { method: 'PATCH', body: JSON.stringify({ status, reply }) }),
  );
}

export function deleteReview(
  token: string,
  id: string,
): Promise<{ review: AdminReview; waiting: number }> {
  return request(
    `/admin/reviews/${encodeURIComponent(id)}`,
    adminInit(token, { method: 'DELETE' }),
  );
}

export function fetchStats(
  token: string,
  days = 30,
): Promise<{ stats: DashboardStats; days: number; lowStockThreshold: number }> {
  return request(`/admin/stats?days=${days}`, adminInit(token));
}

/* ---------- Rabattkoder i panelen ---------- */

export function fetchDiscounts(token: string): Promise<{ discounts: DiscountCode[] }> {
  return request('/admin/discounts', adminInit(token));
}

export function saveDiscount(
  token: string,
  discount: Partial<DiscountCode>,
  existingCode?: string,
): Promise<{ discount: DiscountCode }> {
  return existingCode
    ? request(
        `/admin/discounts/${encodeURIComponent(existingCode)}`,
        adminInit(token, { method: 'PATCH', body: JSON.stringify(discount) }),
      )
    : request(
        '/admin/discounts',
        adminInit(token, { method: 'POST', body: JSON.stringify(discount) }),
      );
}

export function deleteDiscount(token: string, code: string): Promise<{ discount: DiscountCode }> {
  return request(
    `/admin/discounts/${encodeURIComponent(code)}`,
    adminInit(token, { method: 'DELETE' }),
  );
}

/* ---------- Startsidan i panelen ---------- */

/** Laddar upp en bild eller video till startsidan. */
export function uploadMedia(
  file: File,
  onProgress?: (percent: number) => void,
): { promise: Promise<Media>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Media>((resolve, reject) => {
    const body = new FormData();
    body.append('file', file);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      let payload: { media?: Media; error?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText) as typeof payload;
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.media) resolve(payload.media);
      else reject(new ApiError(payload.error ?? 'Filen kunde inte laddas upp', xhr.status));
    });
    xhr.addEventListener('error', () =>
      reject(new ApiError('Uppladdningen avbröts. Kontrollera din uppkoppling.', 0)),
    );
    xhr.addEventListener('abort', () => reject(new ApiError('Uppladdningen avbröts.', 0)));

    xhr.open('POST', `${BASE}/uploads/media`);
    xhr.send(body);
  });
  return { promise, abort: () => xhr.abort() };
}

export function fetchAdminContent(token: string): Promise<HomeContent> {
  return request('/admin/content', adminInit(token));
}

export function saveHero(token: string, hero: unknown): Promise<{ hero: HeroContent }> {
  return request(
    '/admin/content/hero',
    adminInit(token, { method: 'PUT', body: JSON.stringify(hero) }),
  );
}

export function saveCampaign(
  token: string,
  campaign: unknown,
  id?: string,
): Promise<{ campaign: Campaign }> {
  return id
    ? request(
        `/admin/content/campaigns/${encodeURIComponent(id)}`,
        adminInit(token, { method: 'PATCH', body: JSON.stringify(campaign) }),
      )
    : request(
        '/admin/content/campaigns',
        adminInit(token, { method: 'POST', body: JSON.stringify(campaign) }),
      );
}

export function moveCampaign(
  token: string,
  id: string,
  direction: 'upp' | 'ned',
): Promise<{ campaigns: Campaign[] }> {
  return request(
    `/admin/content/campaigns/${encodeURIComponent(id)}/move`,
    adminInit(token, { method: 'POST', body: JSON.stringify({ direction }) }),
  );
}

export function deleteCampaign(token: string, id: string): Promise<{ campaign: Campaign }> {
  return request(
    `/admin/content/campaigns/${encodeURIComponent(id)}`,
    adminInit(token, { method: 'DELETE' }),
  );
}
