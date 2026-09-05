import type {
  AnyOrder,
  CustomOrder,
  CustomerDetails,
  Product,
  QuoteBreakdown,
  QuoteRequest,
  ShopConfig,
  ShopOrder,
} from "../types";

const BASE = "/api";

export class ApiError extends Error {
  readonly fields: Record<string, string>;
  readonly status: number;

  constructor(
    message: string,
    status: number,
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      "Kunde inte nå servern. Kontrollera din uppkoppling.",
      0,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = (payload ?? {}) as {
      error?: string;
      fields?: Record<string, string>;
    };
    throw new ApiError(
      body.error ?? "Något gick fel",
      response.status,
      body.fields ?? {},
    );
  }
  return payload as T;
}

export function fetchConfig(): Promise<ShopConfig> {
  return request<ShopConfig>("/config");
}

export function fetchProducts(
  params: { category?: string; search?: string } = {},
): Promise<{
  products: Product[];
  total: number;
}> {
  const query = new URLSearchParams();
  if (params.category && params.category !== "alla")
    query.set("category", params.category);
  if (params.search) query.set("search", params.search);
  const suffix = query.toString() ? `?${query}` : "";
  return request(`/products${suffix}`);
}

export function fetchProduct(
  slug: string,
): Promise<{ product: Product; related: Product[] }> {
  return request(`/products/${encodeURIComponent(slug)}`);
}

export function fetchQuote(
  payload: QuoteRequest,
): Promise<{ request: QuoteRequest; quote: QuoteBreakdown }> {
  return request("/quote", { method: "POST", body: JSON.stringify(payload) });
}

export function placeOrder(payload: {
  customer: CustomerDetails;
  lines: Array<{
    productId: string;
    quantity: number;
    color: string;
    size?: string;
  }>;
}): Promise<{ order: ShopOrder }> {
  return request("/orders", { method: "POST", body: JSON.stringify(payload) });
}

export function placeCustomOrder(payload: {
  customer: CustomerDetails;
  request: QuoteRequest;
  projectName: string;
  description: string;
  fileName?: string;
}): Promise<{ order: CustomOrder }> {
  return request("/custom-orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchOrder(id: string): Promise<{ order: AnyOrder }> {
  return request(`/orders/${encodeURIComponent(id)}`);
}
