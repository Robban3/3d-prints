import type { CustomOrder, Order, OrderLine } from './types.ts';

/**
 * Klarna Payments (v1). Flödet är tvådelat: vi skapar en session och skickar
 * client_token till webbläsaren, som renderar Klarnas widget och auktoriserar
 * betalningen. Auktoriseringen växlas sedan in mot en Klarna-order här på
 * servern, så att beloppet aldrig kan sättas av klienten.
 */

const PLAYGROUND = 'https://api.playground.klarna.com';
const PRODUCTION = 'https://api.klarna.com';

/** Svensk moms. Klarna vill ha skattesatsen i hundradels procent. */
const VAT_RATE_BASIS_POINTS = 2500;
const REQUEST_TIMEOUT_MS = 15000;

export interface KlarnaConfig {
  username: string;
  password: string;
  apiBase: string;
  purchaseCountry: string;
  purchaseCurrency: string;
  locale: string;
}

export interface KlarnaOrderLine {
  type: 'physical' | 'shipping_fee' | 'digital';
  reference: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total_amount: number;
  total_discount_amount: number;
  total_tax_amount: number;
}

export interface KlarnaOrderPayload {
  purchase_country: string;
  purchase_currency: string;
  locale: string;
  order_amount: number;
  order_tax_amount: number;
  order_lines: KlarnaOrderLine[];
  merchant_reference1?: string;
}

export interface KlarnaSession {
  sessionId: string;
  clientToken: string;
  paymentMethodCategories: Array<{ identifier: string; name: string }>;
  /** True när inga nycklar är konfigurerade och svaret är påhittat. */
  mock: boolean;
}

export interface KlarnaPlacedOrder {
  orderId: string;
  fraudStatus: string;
  redirectUrl?: string;
  mock: boolean;
}

export class KlarnaError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(message: string, status: number, detail = '') {
    super(message);
    this.name = 'KlarnaError';
    this.status = status;
    this.detail = detail;
  }
}

export function klarnaConfig(): KlarnaConfig | undefined {
  const username = process.env.KLARNA_USERNAME;
  const password = process.env.KLARNA_PASSWORD;
  if (!username || !password) return undefined;
  return {
    username,
    password,
    apiBase:
      process.env.KLARNA_API_BASE ??
      (process.env.KLARNA_ENV === 'production' ? PRODUCTION : PLAYGROUND),
    purchaseCountry: process.env.KLARNA_COUNTRY ?? 'SE',
    purchaseCurrency: process.env.KLARNA_CURRENCY ?? 'SEK',
    locale: process.env.KLARNA_LOCALE ?? 'sv-SE',
  };
}

export function isConfigured(): boolean {
  return klarnaConfig() !== undefined;
}

/** Kronor till ören – Klarna räknar allt i minsta valutaenhet. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Momsandelen av ett bruttobelopp, enligt Klarnas egen formel:
 * total_tax_amount = total_amount - total_amount * 10000 / (10000 + tax_rate)
 */
export function taxOf(totalMinor: number, taxRate = VAT_RATE_BASIS_POINTS): number {
  return Math.round(totalMinor - (totalMinor * 10000) / (10000 + taxRate));
}

function physicalLine(line: OrderLine): KlarnaOrderLine {
  const unitPrice = toMinorUnits(line.unitPrice);
  const total = unitPrice * line.quantity;
  const variant = [line.color, line.size].filter(Boolean).join(' · ');
  return {
    type: 'physical',
    reference: line.productId,
    name: variant ? `${line.name} (${variant})` : line.name,
    quantity: line.quantity,
    unit_price: unitPrice,
    tax_rate: VAT_RATE_BASIS_POINTS,
    total_amount: total,
    total_discount_amount: 0,
    total_tax_amount: taxOf(total),
  };
}

function shippingLine(shipping: number): KlarnaOrderLine {
  const total = toMinorUnits(shipping);
  return {
    type: 'shipping_fee',
    reference: 'frakt',
    name: 'Frakt',
    quantity: 1,
    unit_price: total,
    tax_rate: VAT_RATE_BASIS_POINTS,
    total_amount: total,
    total_discount_amount: 0,
    total_tax_amount: taxOf(total),
  };
}

/** Bygger Klarnas orderunderlag för en butiksorder. */
export function payloadForOrder(
  order: Pick<Order, 'lines' | 'shipping' | 'total'> & { id?: string },
  config: Pick<KlarnaConfig, 'purchaseCountry' | 'purchaseCurrency' | 'locale'>,
): KlarnaOrderPayload {
  const lines = order.lines.map(physicalLine);
  if (order.shipping > 0) lines.push(shippingLine(order.shipping));
  const orderAmount = lines.reduce((sum, line) => sum + line.total_amount, 0);
  return {
    purchase_country: config.purchaseCountry,
    purchase_currency: config.purchaseCurrency,
    locale: config.locale,
    order_amount: orderAmount,
    order_tax_amount: lines.reduce((sum, line) => sum + line.total_tax_amount, 0),
    order_lines: lines,
    ...(order.id ? { merchant_reference1: order.id } : {}),
  };
}

/** Bygger Klarnas orderunderlag för ett kundunikt printjobb. */
export function payloadForCustomOrder(
  order: Pick<CustomOrder, 'projectName' | 'request' | 'quote'> & { id?: string },
  config: Pick<KlarnaConfig, 'purchaseCountry' | 'purchaseCurrency' | 'locale'>,
): KlarnaOrderPayload {
  // Hela jobbet skickas som en rad – Klarna ska visa samma summa som kunden såg.
  const total = toMinorUnits(order.quote.total);
  const line: KlarnaOrderLine = {
    type: 'physical',
    reference: 'egen-print',
    name: `${order.projectName} (${order.request.quantity} st, ${order.request.material.toUpperCase()})`,
    quantity: 1,
    unit_price: total,
    tax_rate: VAT_RATE_BASIS_POINTS,
    total_amount: total,
    total_discount_amount: 0,
    total_tax_amount: taxOf(total),
  };
  return {
    purchase_country: config.purchaseCountry,
    purchase_currency: config.purchaseCurrency,
    locale: config.locale,
    order_amount: total,
    order_tax_amount: line.total_tax_amount,
    order_lines: [line],
    ...(order.id ? { merchant_reference1: order.id } : {}),
  };
}

async function call<T>(config: KlarnaConfig, path: string, body: unknown): Promise<T> {
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${config.apiBase}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new KlarnaError(
      aborted ? 'Klarna svarade inte i tid' : 'Kunde inte nå Klarna',
      502,
      aborted ? 'timeout' : String(error),
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) {
    // Svaret kan innehålla ordersummor men aldrig våra nycklar – de sitter i headern.
    throw new KlarnaError('Klarna avvisade betalningen', response.status, text.slice(0, 500));
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function createSession(payload: KlarnaOrderPayload): Promise<KlarnaSession> {
  const config = klarnaConfig();
  if (!config) {
    // Utan nycklar körs butiken vidare i testläge så att flödet går att använda.
    return {
      sessionId: `mock-session-${Date.now().toString(36)}`,
      clientToken: 'mock-client-token',
      paymentMethodCategories: [{ identifier: 'pay_later', name: 'Faktura' }],
      mock: true,
    };
  }

  const result = await call<{
    session_id: string;
    client_token: string;
    payment_method_categories?: Array<{ identifier: string; name: string }>;
  }>(config, '/payments/v1/sessions', payload);

  return {
    sessionId: result.session_id,
    clientToken: result.client_token,
    paymentMethodCategories: result.payment_method_categories ?? [],
    mock: false,
  };
}

export async function placeOrder(
  authorizationToken: string,
  payload: KlarnaOrderPayload,
): Promise<KlarnaPlacedOrder> {
  const config = klarnaConfig();
  if (!config) {
    return {
      orderId: `mock-order-${Date.now().toString(36)}`,
      fraudStatus: 'ACCEPTED',
      mock: true,
    };
  }
  if (!/^[\w-]{8,120}$/.test(authorizationToken)) {
    throw new KlarnaError('Ogiltigt auktoriseringstoken', 400);
  }

  const result = await call<{ order_id: string; fraud_status: string; redirect_url?: string }>(
    config,
    `/payments/v1/authorizations/${encodeURIComponent(authorizationToken)}/order`,
    payload,
  );

  return {
    orderId: result.order_id,
    fraudStatus: result.fraud_status,
    redirectUrl: result.redirect_url,
    mock: false,
  };
}
