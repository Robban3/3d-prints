import { Router } from 'express';
import { categories, productBySlug, products } from './data/products.ts';
import { materials, qualities } from './data/materials.ts';
import { calculateQuote, QUOTE_LIMITS } from './pricing.ts';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE, shippingFor } from './shipping.ts';
import { findOrder, generateOrderNumber, listOrders, saveOrder, updateOrder } from './store.ts';
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, claimUpload, readMeta } from './uploads.ts';
import { pathParam } from './http.ts';
import { release, reserve, stockLevels } from './stock.ts';
import { orderConfirmation, sendMail } from './mailer.ts';
import { rateLimit } from './rateLimit.ts';
import {
  KlarnaError,
  createSession,
  isConfigured,
  klarnaConfig,
  payloadForCustomOrder,
  payloadForOrder,
  notificationSecret,
  placeOrder as placeKlarnaOrder,
} from './klarna.ts';
import {
  ValidationError,
  parseCustomer,
  parseOrderLines,
  parseQuoteRequest,
} from './validation.ts';
import type { CustomOrder, Order, PaymentDetails } from './types.ts';

export const api = Router();

const orderLimit = rateLimit({
  name: 'orders',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ORDERS ?? 20),
  message: 'Många beställningar från samma nätverk. Försök igen om en stund.',
});

/**
 * En betalsession skapas om varje gång varukorgen ändras, så den gränsen måste
 * vara betydligt generösare än den för lagda ordrar.
 */
const sessionLimit = rateLimit({
  name: 'payment-sessions',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SESSIONS ?? 120),
  message: 'För många betalförsök. Vänta en stund och försök igen.',
});

const quoteLimit = rateLimit({
  name: 'quote',
  windowMs: 60 * 1000,
  max: 120,
  message: 'För många prisförfrågningar. Vänta en stund och försök igen.',
});

api.get('/health', (_req, res) => {
  res.json({ status: 'ok', products: products.length });
});

api.get('/config', (_req, res) => {
  res.json({
    materials,
    qualities,
    categories,
    quoteLimits: QUOTE_LIMITS,
    shipping: { fee: SHIPPING_FEE, freeThreshold: FREE_SHIPPING_THRESHOLD },
    upload: { maxBytes: MAX_UPLOAD_BYTES, extensions: ALLOWED_EXTENSIONS },
    payment: { provider: 'klarna', live: isConfigured() },
  });
});

api.get('/products', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().trim() : '';

  let result = products;
  if (category && category !== 'alla') {
    result = result.filter((product) => product.category === category);
  }
  if (search) {
    result = result.filter((product) =>
      [product.name, product.tagline, product.description].join(' ').toLowerCase().includes(search),
    );
  }
  // Saldot är föränderligt och hämtas därför separat från katalogen.
  const levels = await stockLevels();
  res.json({
    products: result.map((product) => ({ ...product, stock: levels.get(product.id) ?? 0 })),
    total: result.length,
  });
});

api.get('/products/:slug', async (req, res) => {
  const product = productBySlug.get(pathParam(req.params.slug));
  if (!product) {
    res.status(404).json({ error: 'Produkten hittades inte' });
    return;
  }
  // Samma kategori först, därefter de mest omtyckta så att raden alltid blir full.
  const sameCategory = products.filter(
    (p) => p.id !== product.id && p.category === product.category,
  );
  const fillers = products
    .filter((p) => p.id !== product.id && p.category !== product.category)
    .sort((a, b) => b.rating * b.reviewCount - a.rating * a.reviewCount);
  const related = [...sameCategory, ...fillers].slice(0, 5);
  const levels = await stockLevels();
  const withStock = <T extends { id: string }>(entry: T) => ({
    ...entry,
    stock: levels.get(entry.id) ?? 0,
  });
  res.json({ product: withStock(product), related: related.map(withStock) });
});

api.post('/quote', quoteLimit, (req, res) => {
  const request = parseQuoteRequest(req.body);
  res.json({ request, quote: calculateQuote(request) });
});

/** Standardvärden när Klarna-nycklar saknas, så testläget kan räkna likadant. */
const paymentLocale = () =>
  klarnaConfig() ?? {
    purchaseCountry: 'SE',
    purchaseCurrency: 'SEK',
    locale: 'sv-SE',
  };

/**
 * Skapar en betalsession hos Klarna. Beloppet räknas alltid fram här av samma
 * kod som lägger ordern, så att widgeten visar exakt det kunden debiteras.
 */
api.post('/payments/session', sessionLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const config = paymentLocale();

  let payload;
  if (body.type === 'custom') {
    const request = parseQuoteRequest(body.request);
    const projectName = String(body.projectName ?? '').trim() || 'Eget printjobb';
    payload = payloadForCustomOrder(
      { projectName, request, quote: calculateQuote(request) },
      config,
    );
  } else {
    const lines = parseOrderLines(body.lines);
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    payload = payloadForOrder({ lines, shipping: shippingFor(subtotal), total: subtotal }, config);
  }

  const session = await createSession(payload);
  res.json({
    session: {
      clientToken: session.clientToken,
      paymentMethodCategories: session.paymentMethodCategories,
      test: session.mock,
    },
    amount: payload.order_amount,
  });
});

/** Växlar in kundens auktorisering mot en riktig order hos Klarna. */
async function settle(
  authorizationToken: string | undefined,
  payload: ReturnType<typeof payloadForOrder>,
): Promise<PaymentDetails | undefined> {
  if (!isConfigured()) {
    // Utan nycklar sker ingen betalning. Ordern läggs ändå, men märks tydligt
    // som obetald i testläge i stället för att se betald ut.
    return { provider: 'klarna', status: 'avvaktar', test: true };
  }
  if (!authorizationToken) {
    // Betalningen kan också skötas via en länk i efterhand.
    return undefined;
  }
  const placed = await placeKlarnaOrder(authorizationToken, payload);
  return {
    provider: 'klarna',
    reference: placed.orderId,
    status: placed.fraudStatus === 'REJECTED' ? 'obetald' : 'auktoriserad',
    fraudStatus: placed.fraudStatus,
    test: placed.mock,
  };
}

/** Bekräftelsemejlet får aldrig fälla en order som redan är betald och sparad. */
async function notify(order: Order | CustomOrder): Promise<void> {
  try {
    await sendMail(orderConfirmation(order));
  } catch (error) {
    console.error('Kunde inte skicka orderbekräftelse', error);
  }
}

api.post('/orders', orderLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customer = parseCustomer(body.customer);
  const lines = parseOrderLines(body.lines);

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const shipping = shippingFor(subtotal);

  const orderId = generateOrderNumber('S');
  // Saldot dras av innan betalningen, så att två kunder inte kan köpa samma
  // sista exemplar medan Klarna svarar.
  await reserve(lines);

  let payment;
  try {
    payment = await settle(
      typeof body.authorizationToken === 'string' ? body.authorizationToken : undefined,
      payloadForOrder(
        { lines, shipping, total: subtotal + shipping, id: orderId },
        paymentLocale(),
      ),
    );
  } catch (error) {
    await release(lines);
    throw error;
  }

  const order: Order = {
    id: orderId,
    type: 'shop',
    createdAt: new Date().toISOString(),
    status: 'mottagen',
    history: [{ status: 'mottagen', at: new Date().toISOString() }],
    customer,
    lines,
    subtotal,
    shipping,
    total: subtotal + shipping,
    payment,
  };

  await saveOrder(order);
  await notify(order);
  res.status(201).json({ order });
});

api.post('/custom-orders', orderLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customer = parseCustomer(body.customer);
  const request = parseQuoteRequest(body.request);

  const projectName = String(body.projectName ?? '').trim();
  const description = String(body.description ?? '').trim();
  const errors: Record<string, string> = {};
  if (projectName.length < 2) errors.projectName = 'Ge projektet ett namn.';
  if (description.length < 10)
    errors.description = 'Beskriv vad du vill ha printat (minst 10 tecken).';
  // Filnamnet tas från den uppladdade filens metadata, aldrig från klienten.
  const fileId = String(body.fileId ?? '').trim();
  const upload = fileId ? await readMeta(fileId) : undefined;
  if (fileId && !upload) {
    errors.fileId = 'Vi hittar inte din uppladdade fil. Ladda upp den igen.';
  } else if (upload?.claimedBy) {
    errors.fileId = 'Filen är redan kopplad till en annan beställning.';
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  const quote = calculateQuote(request);
  const orderId = generateOrderNumber('C');

  if (upload) {
    const claimed = await claimUpload(upload.id, orderId);
    if (!claimed) {
      throw new ValidationError({
        fileId: 'Filen kunde inte kopplas till ordern. Ladda upp den igen.',
      });
    }
  }

  const payment = await settle(
    typeof body.authorizationToken === 'string' ? body.authorizationToken : undefined,
    payloadForCustomOrder({ projectName, request, quote, id: orderId }, paymentLocale()),
  );

  const order: CustomOrder = {
    id: orderId,
    type: 'custom',
    createdAt: new Date().toISOString(),
    status: 'mottagen',
    history: [{ status: 'mottagen', at: new Date().toISOString() }],
    customer,
    request,
    projectName,
    fileId: upload?.id,
    fileName: upload?.originalName,
    fileUrl: upload ? `/api/uploads/${upload.id}` : undefined,
    fileSize: upload?.size,
    description,
    quote,
    total: quote.total,
    payment,
  };

  await saveOrder(order);
  await notify(order);
  res.status(201).json({ order });
});

/**
 * Klarna hör av sig hit när en bedrägeriprövning som låg på PENDING landat.
 * Anropet är oautentiserat hos Klarna, så hemligheten i frågesträngen är det
 * som skiljer ett äkta anrop från ett påhittat.
 */
api.post('/payments/klarna/notification', async (req, res) => {
  const secret = notificationSecret();
  if (!secret || req.query.token !== secret) {
    res.status(401).json({ error: 'Ogiltig notifiering' });
    return;
  }

  const body = (req.body ?? {}) as { order_id?: unknown; event_type?: unknown };
  const klarnaOrderId = typeof body.order_id === 'string' ? body.order_id : '';
  const event = typeof body.event_type === 'string' ? body.event_type : '';
  if (!klarnaOrderId || !event) {
    res.status(400).json({ error: 'Saknar order_id eller event_type' });
    return;
  }

  const orders = await listOrders();
  const match = orders.find((order) => order.payment?.reference === klarnaOrderId);
  if (!match) {
    // Klarna gör om anropet senare om vi svarar med fel, så en okänd order
    // kvitteras med 200 för att inte fastna i en loop.
    console.warn('Klarna-notifiering för okänd order', klarnaOrderId);
    res.status(200).json({ ok: true });
    return;
  }

  const status = event === 'FRAUD_RISK_ACCEPTED' ? 'auktoriserad' : 'obetald';
  await updateOrder(match.id, (order) => ({
    ...order,
    payment: order.payment ? { ...order.payment, status, fraudStatus: event } : order.payment,
  }));

  res.json({ ok: true });
});

api.get('/orders/:id', async (req, res) => {
  const order = await findOrder(pathParam(req.params.id));
  if (!order) {
    res.status(404).json({ error: 'Ordern hittades inte' });
    return;
  }
  res.json({ order });
});
