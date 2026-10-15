import type {
  Appearance,
  ThemeId,
  AnyOrder,
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
  Quality,
  OrderStatus,
  PaymentSession,
  ImportResult,
  ProductDraft,
  ShopOrder,
  UploadedFile,
  ProductionPlan,
} from '../types';

const BASE = '/api';

export interface AdminPrintFile {
  id: string; fileName: string; size: number; createdAt: string;
  source: 'own' | 'customer'; orderId: string | null; projectName?: string;
  folderId?: string | null;
}
export interface FileFolder { id: string; name: string }
export function fetchPrintFiles(token: string): Promise<{ files: AdminPrintFile[]; folders?: FileFolder[] }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  return request<{ files: AdminPrintFile[]; folders?: FileFolder[] }>('/admin/files', adminInit(token, { signal: controller.signal })).finally(() => clearTimeout(timer));
}
export function saveFileFolder(token: string, name: string, id?: string): Promise<{ folder: FileFolder }> {
  return request(id ? `/admin/file-folders/${encodeURIComponent(id)}` : '/admin/file-folders', adminInit(token, { method: id ? 'PATCH' : 'POST', body: JSON.stringify({ name }) }));
}
export function movePrintFile(token: string, id: string, folderId: string | null): Promise<{ ok: true }> {
  return request(`/admin/files/${encodeURIComponent(id)}/folder`, adminInit(token, { method: 'PATCH', body: JSON.stringify({ folderId }) }));
}
export interface FileUploadProgress { loaded: number; total: number; percent: number; phase: 'uploading' | 'saving' | 'retrying' }
interface UploadOptions { signal?: AbortSignal; onProgress?: (progress: FileUploadProgress) => void }
async function uploadRequest<T>(token: string, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = window.setTimeout(abort, 120000);
  try { return await request(path, adminInit(token, { method: 'POST', body: JSON.stringify(body), signal: controller.signal })); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function uploadChunk(token: string, id: string, number: number, blob: Blob, loaded: number, total: number, options: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => options.signal?.removeEventListener('abort', abort);
    const report = (bytes: number, phase: FileUploadProgress['phase']) => options.onProgress?.({ loaded: bytes, total, percent: Math.min(100, Math.round(bytes / total * 100)), phase });
    xhr.open('PUT', `${BASE}/admin/files/uploads/${id}/parts/${number}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`); xhr.timeout = 180000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) report(loaded + Math.round(blob.size * event.loaded / event.total), 'uploading'); };
    xhr.upload.onload = () => report(loaded + blob.size, 'saving');
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
      let message = xhr.status === 401 ? 'Du behöver logga in igen.' : `Fildelen kunde inte sparas (${xhr.status}).`;
      try { const body = JSON.parse(xhr.responseText); message = Object.values(body.fields ?? {}).join(' ') || body.error || message; } catch { /* proxy errors may be HTML */ }
      reject(new ApiError(message, xhr.status));
    };
    xhr.onerror = () => { cleanup(); reject(new ApiError('Anslutningen bröts under uppladdningen.', 0)); };
    xhr.ontimeout = () => { cleanup(); reject(new ApiError('Uppladdningen svarade inte i tid. Kontrollera anslutningen och försök igen.', 0)); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Uppladdningen avbröts.', 'AbortError')); };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) { cleanup(); reject(new DOMException('Uppladdningen avbröts.', 'AbortError')); return; }
    const data = new FormData(); data.append('file', blob, 'chunk.bin'); xhr.send(data);
  });
}
export async function uploadPrintFile(token: string, file: File, folderId?: string | null, options: UploadOptions = {}): Promise<void | { warning?: string }> {
  if (file.size <= 0 || file.size > 150 * 1024 * 1024) throw new Error('Filen får vara högst 150 MB och får inte vara tom.');
  const session = await uploadRequest<{ id: string; chunkBytes: number }>(token, '/admin/files/uploads', { fileName: file.name, size: file.size }, options.signal);
  if (!session || !/^[a-f0-9]{32}$/.test(session.id) || !Number.isSafeInteger(session.chunkBytes) || session.chunkBytes < 1 || session.chunkBytes > 16 * 1024 * 1024) throw new Error('Servern kunde inte starta uppladdningen. Ladda om sidan och försök igen.');
  try {
    for (let offset = 0, part = 1; offset < file.size; offset += session.chunkBytes, part++) {
      const chunk = file.slice(offset, Math.min(offset + session.chunkBytes, file.size));
      try { await uploadChunk(token, session.id, part, chunk, offset, file.size, options); }
      catch (error) {
        if (options.signal?.aborted || !(error instanceof ApiError) || (error.status !== 0 && error.status < 500)) throw error;
        options.onProgress?.({ loaded: offset, total: file.size, percent: Math.round(offset / file.size * 100), phase: 'retrying' });
        await uploadChunk(token, session.id, part, chunk, offset, file.size, options);
      }
    }
    options.onProgress?.({ loaded: file.size, total: file.size, percent: 100, phase: 'saving' });
    try { return await uploadRequest(token, `/admin/files/uploads/${session.id}/complete`, { folderId: folderId ?? null }, options.signal); }
    catch (error) {
      if (options.signal?.aborted || !(error instanceof ApiError) || (error.status !== 0 && error.status < 500)) throw error;
      return await uploadRequest(token, `/admin/files/uploads/${session.id}/complete`, { folderId: folderId ?? null }, options.signal);
    }
  } catch (error) {
    // Aborting a staged upload never deletes a file that already completed.
    void fetch(`${BASE}/admin/files/uploads/${session.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    throw error;
  }
}
export async function downloadPrintFile(token: string, file: AdminPrintFile): Promise<void> {
  const response = await fetch(`${BASE}/admin/files/${encodeURIComponent(file.id)}/download`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Kunde inte hämta filen. Kontrollera att du är inloggad.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = file.fileName;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
        lines: Array<{ productId: string; quantity: number; color: string; size?: string; personalization?: string }>;
      }
    | { type: 'custom'; request: QuoteRequest; projectName: string },
): Promise<{ session: PaymentSession; amount: number; summary?: Pick<ShopOrder, 'lines' | 'subtotal' | 'shipping' | 'total'> }> {
  return request('/payments/session', { method: 'POST', body: JSON.stringify(payload) });
}

export function placeOrder(payload: {
  expectedTotal?: number;
  customer: CustomerDetails;
  lines: Array<{
    productId: string;
    quantity: number;
    color: string;
    size?: string;
    personalization?: string;
  }>;
  authorizationToken?: string;
}): Promise<{ order: ShopOrder; accessToken: string }> {
  return request('/orders', { method: 'POST', body: JSON.stringify(payload) });
}

export function placeCustomOrder(payload: {
  customer: CustomerDetails;
  request: QuoteRequest;
  projectName: string;
  description: string;
  fileId?: string;
  authorizationToken?: string;
}): Promise<{ order: CustomOrder; accessToken: string }> {
  return request('/custom-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function exportPersonalData(token: string, email: string): Promise<Record<string, unknown>> {
  return request('/admin/privacy/export', adminInit(token, { method: 'POST', body: JSON.stringify({ email }) }));
}
export function minimizePersonalData(token: string, email: string): Promise<{ minimized: number; active: number }> {
  return request('/admin/privacy/minimize', adminInit(token, { method: 'POST', body: JSON.stringify({ email, confirmed: true }) }));
}

export function fetchOrder(id: string, accessToken?: string): Promise<{ order: AnyOrder }> {
  return request(`/orders/${encodeURIComponent(id)}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
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

export function fetchAdminStatus(): Promise<{ enabled: boolean; passwordConfigured: boolean; email: string; authenticated: boolean; recoveryByEmail: boolean }> {
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

export function fetchOperations(token: string): Promise<{ emailConfigured: boolean; paymentConfigured: boolean; paymentEnvironment: string; storage: string }> {
  return request('/admin/operations', adminInit(token));
}
export function testShopEmail(token: string): Promise<{ accepted: boolean }> {
  return request('/admin/email/test', adminInit(token, { method: 'POST', body: '{}' }));
}
export function saveProduction(token: string, id: string, production: Omit<ProductionPlan, 'revision'>, expectedRevision: number): Promise<{ order: AnyOrder; next: OrderStatus[] }> {
  return request(`/admin/orders/${encodeURIComponent(id)}/production`, adminInit(token, { method: 'PATCH', body: JSON.stringify({ production, expectedRevision }) }));
}

export function adminLogin(email: string, password: string) { return request('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); }
export function adminSetup(key: string, password: string) { return request('/admin/auth/setup', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ password }) }); }
export function adminLogout() { return request('/admin/auth/logout', { method: 'POST', body: '{}' }); }
export function adminForgot(email: string) { return request('/admin/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }); }
export function adminReset(token: string, password: string) { return request('/admin/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }); }

export function fetchAppearance(): Promise<{ appearance: Appearance }> {
  return request('/appearance');
}

export function fetchAdminAppearance(token: string): Promise<{ appearance: Appearance }> {
  return request('/admin/appearance', adminInit(token));
}

export function saveAppearance(token: string, theme: ThemeId): Promise<{ appearance: Appearance }> {
  return request('/admin/appearance', adminInit(token, { method: 'PUT', body: JSON.stringify({ theme }) }));
}

export function fetchAdminProducts(token: string): Promise<{ products: Product[]; total: number }> {
  return request('/admin/products', adminInit(token));
}

export function createProduct(
  token: string,
  draft: ProductDraft,
): Promise<{ product: Product }> {
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
export function uploadProductImage(
  file: File,
): { promise: Promise<{ id: string; url: string; fileName: string }>; abort: () => void } {
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
    xhr.open('POST', `${BASE}/admin/uploads/images`);
    xhr.setRequestHeader('Authorization', 'Bearer session');
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
    ? request('/admin/materials', adminInit(token, { method: 'POST', body: JSON.stringify(material) }))
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
    ? request('/admin/qualities', adminInit(token, { method: 'POST', body: JSON.stringify(quality) }))
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
