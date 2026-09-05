import { Router } from 'express';
import { categories, productBySlug, products } from './data/products.ts';
import { materials, qualities } from './data/materials.ts';
import { calculateQuote, QUOTE_LIMITS } from './pricing.ts';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE, shippingFor } from './shipping.ts';
import { findOrder, generateOrderNumber, saveOrder } from './store.ts';
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, claimUpload, readMeta } from './uploads.ts';
import { pathParam } from './http.ts';
import {
  ValidationError,
  parseCustomer,
  parseOrderLines,
  parseQuoteRequest,
} from './validation.ts';
import type { CustomOrder, Order } from './types.ts';

export const api = Router();

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
  });
});

api.get('/products', (req, res) => {
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
  res.json({ products: result, total: result.length });
});

api.get('/products/:slug', (req, res) => {
  const product = productBySlug.get(pathParam(req.params.slug));
  if (!product) {
    res.status(404).json({ error: 'Produkten hittades inte' });
    return;
  }
  const related = products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 3);
  res.json({ product, related });
});

api.post('/quote', (req, res) => {
  const request = parseQuoteRequest(req.body);
  res.json({ request, quote: calculateQuote(request) });
});

api.post('/orders', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customer = parseCustomer(body.customer);
  const lines = parseOrderLines(body.lines);

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const shipping = shippingFor(subtotal);

  const order: Order = {
    id: generateOrderNumber('S'),
    type: 'shop',
    createdAt: new Date().toISOString(),
    status: 'mottagen',
    customer,
    lines,
    subtotal,
    shipping,
    total: subtotal + shipping,
  };

  await saveOrder(order);
  res.status(201).json({ order });
});

api.post('/custom-orders', async (req, res) => {
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

  const order: CustomOrder = {
    id: orderId,
    type: 'custom',
    createdAt: new Date().toISOString(),
    status: 'mottagen',
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
  };

  await saveOrder(order);
  res.status(201).json({ order });
});

api.get('/orders/:id', async (req, res) => {
  const order = await findOrder(pathParam(req.params.id));
  if (!order) {
    res.status(404).json({ error: 'Ordern hittades inte' });
    return;
  }
  res.json({ order });
});
