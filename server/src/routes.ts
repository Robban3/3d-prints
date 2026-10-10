import { Router } from 'express';
import {
  allCategories,
  allMaterials,
  allProducts,
  allQualities,
  findProduct,
  findProductBySlug,
  publishedProducts,
} from './catalog.ts';

import { QUOTE_LIMITS, quoteFor } from './pricing.ts';
import {
  DEFAULT_SHIPPING_ID,
  SHIPPING_OPTIONS,
  orderTotals,
  shippingOptionFor,
} from './shipping.ts';
import { evaluateDiscount, findDiscount, redeemDiscount, releaseDiscount } from './discounts.ts';
import type { AppliedDiscount } from './shipping.ts';
import { findOrder, generateOrderNumber, listOrders, saveOrder, updateOrder } from './store.ts';
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  claimUpload,
  cloneUpload,
  holdUpload,
  readMeta,
} from './uploads.ts';
import { pathParam } from './http.ts';
import { release, reserve, stockLevels } from './stock.ts';
import { orderConfirmation, savedQuoteMail, sendMail } from './mailer.ts';
import { expiryFrom, findQuote, saveQuote } from './quotes.ts';
import { rateLimit } from './rateLimit.ts';
import { publicHomeContent } from './content.ts';
import { recommendMaterials } from './materialGuide.ts';
import { buildQueue, jobFor } from './queue.ts';
import { printTimeFor } from './parameters.ts';
import type { Flex, GuideAnswers, Load, Place } from './materialGuide.ts';
import {
  ReviewError,
  publicReview,
  publishedFor,
  submitReview,
  summaries,
  summaryFor,
} from './reviews.ts';
import type { ReviewSummary } from './reviews.ts';
import { WatchError, watchStock } from './notify.ts';
import {
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
  withMeasuredVolume,
} from './validation.ts';
import type { CustomOrder, Order, OrderLine, PaymentDetails } from './types.ts';

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

const reviewLimit = rateLimit({
  name: 'reviews',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REVIEWS ?? 5),
  message: 'Många omdömen från samma nätverk. Hör av dig om du vill skriva fler.',
});
const notifyLimit = rateLimit({
  name: 'bevakningar',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_WATCHES ?? 10),
  message: 'Många bevakningar från samma nätverk. Försök igen om en stund.',
});
const discountLimit = rateLimit({
  name: 'rabattkoder',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_DISCOUNTS ?? 60),
  message: 'För många försök med rabattkoder. Vänta en stund och försök igen.',
});
const saveLimit = rateLimit({
  name: 'sparade-offerter',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SAVED_QUOTES ?? 20),
  message: 'Många sparade offerter från samma nätverk. Försök igen om en stund.',
});
const quoteLimit = rateLimit({
  name: 'quote',
  windowMs: 60 * 1000,
  max: 120,
  message: 'För många prisförfrågningar. Vänta en stund och försök igen.',
});

api.get('/health', async (_req, res) => {
  res.json({ status: 'ok', products: (await publishedProducts()).length });
});

api.get('/config', async (_req, res) => {
  res.json({
    materials: await allMaterials(),
    qualities: await allQualities(),
    categories: await allCategories(),
    quoteLimits: QUOTE_LIMITS,
    shipping: { options: SHIPPING_OPTIONS, defaultId: DEFAULT_SHIPPING_ID },
    upload: { maxBytes: MAX_UPLOAD_BYTES, extensions: ALLOWED_EXTENSIONS },
    payment: { provider: 'klarna', live: isConfigured() },
  });
});

api.get('/products', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().trim() : '';

  let result = await publishedProducts();
  // Flera kategorier åt gången: en kampanj kan peka på en hel kollektion som
  // delats upp i teman.
  const wanted = (category ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== 'alla');
  if (wanted.length > 0) {
    result = result.filter((product) => wanted.includes(product.category));
  }
  if (search) {
    result = result.filter((product) =>
      [product.name, product.tagline, product.description].join(' ').toLowerCase().includes(search),
    );
  }
  // Saldot och betygen är föränderliga och hämtas därför separat från katalogen.
  const levels = await stockLevels();
  const ratings = await summaries();
  res.json({
    products: result.map((product) => ({
      ...withRating(product, ratings.get(product.id)),
      stock: levels.get(product.id) ?? 0,
    })),
    total: result.length,
  });
});

api.get('/products/:slug', async (req, res) => {
  const product = await findProductBySlug(pathParam(req.params.slug));
  if (!product || product.published === false) {
    res.status(404).json({ error: 'Produkten hittades inte' });
    return;
  }
  // Samma kategori först, därefter de mest omtyckta så att raden alltid blir full.
  const catalog = await publishedProducts();
  const sameCategory = catalog.filter(
    (p) => p.id !== product.id && p.category === product.category,
  );
  const fillers = catalog
    .filter((p) => p.id !== product.id && p.category !== product.category)
    .sort((a, b) => b.rating * b.reviewCount - a.rating * a.reviewCount);
  const related = [...sameCategory, ...fillers].slice(0, 5);
  const levels = await stockLevels();
  const ratings = await summaries();
  const decorate = <T extends { id: string; rating: number; reviewCount: number }>(entry: T) => ({
    ...withRating(entry, ratings.get(entry.id)),
    stock: levels.get(entry.id) ?? 0,
  });
  res.json({
    product: decorate(product),
    related: related.map(decorate),
    reviews: await publishedFor(product.id),
    reviewSummary: (await summaryFor(product.id)) ?? null,
  });
});

/**
 * Tar emot ett omdöme. Det publiceras inte direkt – någon i verkstaden får
 * godkänna det först, annars kunde vem som helst sätta betyget på en produkt.
 */
api.post('/products/:slug/reviews', reviewLimit, async (req, res) => {
  const product = await findProductBySlug(pathParam(req.params.slug));
  if (!product || product.published === false) {
    res.status(404).json({ error: 'Produkten hittades inte' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  try {
    const review = await submitReview({
      productId: product.id,
      author: typeof body.author === 'string' ? body.author : '',
      email,
      rating: Number(body.rating),
      title: typeof body.title === 'string' ? body.title : '',
      body: typeof body.body === 'string' ? body.body : '',
      verifiedPurchase: await hasBought(email, product.id),
    });
    res.status(201).json({ review: publicReview(review), status: review.status });
  } catch (error) {
    if (error instanceof ReviewError) {
      res.status(400).json({ error: error.message, fields: error.fields });
      return;
    }
    throw error;
  }
});

/**
 * Prövar en rabattkod mot varukorgen. Ordervärdet räknas ut från katalogens
 * egna priser, aldrig från det klienten påstår, och beloppet som svaret
 * innehåller är bara till för att visas – ordern räknar om det på nytt.
 */
const PLACES: Place[] = ['inomhus', 'utomhus', 'varmt'];
const LOADS: Load[] = ['dekor', 'daglig', 'last'];
const FLEXES: Flex[] = ['styv', 'nagot', 'mjuk'];

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Materialguiden. Uträkningen ligger kvar på servern i stället för att
 * dubbleras i klienten, så den bara finns på ett ställe och följer materialens
 * egenskaper som de redigeras i panelen.
 */
api.post('/materials/guide', quoteLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const answers: GuideAnswers = {
    place: oneOf(body.place, PLACES, 'inomhus'),
    load: oneOf(body.load, LOADS, 'daglig'),
    flex: oneOf(body.flex, FLEXES, 'styv'),
  };
  res.json({ answers, results: recommendMaterials(await allMaterials(), answers) });
});

/** Startsidans hero och de kampanjer som är igång just nu. */
api.get('/content/home', async (_req, res) => {
  res.json(await publicHomeContent());
});

api.post('/discounts/check', discountLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const lines = await parseOrderLines(body.lines);
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  const verdict = evaluateDiscount(await findDiscount(body.code), subtotal);
  if (!verdict.ok) {
    res.status(400).json({ error: verdict.reason, fields: { code: verdict.reason } });
    return;
  }
  res.json({ discount: verdict.applied, subtotal });
});

api.post('/quote', quoteLimit, async (req, res) => {
  // Offertanropet tar både själva förfrågan och en inslagen variant med fileId.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fileId = String(body.fileId ?? '').trim();
  const upload = fileId ? await readMeta(fileId) : undefined;
  const request = withMeasuredVolume(
    await parseQuoteRequest(body.request ?? body),
    upload?.analysis,
  );
  res.json({ request, quote: await quoteFor(request), model: upload?.analysis });
});

/**
 * Bevakning av en slutsåld produkt. Vi lovar ett enda mejl: det som skickas när
 * saldot fyllts på. Därefter är bevakningen borta.
 */
api.post('/products/:slug/notify', notifyLimit, async (req, res) => {
  const product = await findProductBySlug(pathParam(req.params.slug));
  if (!product || product.published === false) {
    res.status(404).json({ error: 'Produkten hittades inte' });
    return;
  }

  const levels = await stockLevels();
  if ((levels.get(product.id) ?? 0) > 0) {
    res.status(409).json({
      error: 'Produkten finns i lager just nu – du kan beställa den direkt.',
    });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    await watchStock(product.id, typeof body.email === 'string' ? body.email : '');
    // Bevakningen i sig är inget vi behöver lämna ut.
    res.status(201).json({ watching: true, productName: product.name });
  } catch (error) {
    if (error instanceof WatchError) {
      res.status(400).json({ error: error.message, fields: error.fields });
      return;
    }
    throw error;
  }
});

/* ---------- Sparade offerter ---------- */

/**
 * Sparar den uträknade offerten bakom en egen länk. Den som räknar på ett jobb
 * är ofta inte den som får beställa det, så siffrorna ska gå att skicka vidare
 * utan att någon fyller i formuläret igen.
 */
api.post('/quotes', saveLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const requested = await parseQuoteRequest(body.request);

  const projectName = String(body.projectName ?? '').trim() || 'Eget printjobb';
  const description = String(body.description ?? '').trim();

  const fileId = String(body.fileId ?? '').trim();
  const upload = fileId ? await readMeta(fileId) : undefined;
  if (fileId && !upload) {
    throw new ValidationError({ fileId: 'Vi hittar inte din uppladdade fil. Ladda upp den igen.' });
  }

  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new ValidationError({ email: 'Fyll i en mejladress vi kan skicka offerten till.' });
  }

  const request = withMeasuredVolume(requested, upload?.analysis);
  const quote = await quoteFor(request);
  const saved = await saveQuote({
    projectName,
    description,
    request,
    quote,
    ...(upload
      ? {
          fileId: upload.id,
          fileName: upload.originalName,
          fileUrl: `/api/uploads/${upload.id}`,
          fileSize: upload.size,
          ...(upload.analysis ? { model: upload.analysis } : {}),
        }
      : {}),
    ...(email ? { email } : {}),
  });

  // Filen måste finnas kvar så länge offerten går att beställa. Annars städas
  // den bort som föräldralös inom ett dygn.
  if (upload) await holdUpload(upload.id, expiryFrom(new Date(saved.createdAt)));

  const mail = email
    ? await sendMail(
        savedQuoteMail({
          to: email,
          id: saved.id,
          projectName: saved.projectName,
          total: quote.total,
          deliveryDays: quote.estimatedDeliveryDays,
          expiresAt: saved.expiresAt,
        }),
      )
    : undefined;

  // Sökvägen, inte en absolut adress: klienten vet vilket ursprung den körs på,
  // och SHOP_URL pekar på driftmiljön även när man kör lokalt. Mejlet behöver
  // en absolut adress och bygger sin egen.
  res.status(201).json({ quote: saved, path: `/offert/${saved.id}`, mail });
});

/**
 * Hämtar en sparad offert. Priset räknas också om mot dagens siffror – ett pris
 * som ändrats sedan offerten sparades ska synas, inte tigas om.
 */
api.get('/quotes/:id', async (req, res) => {
  const saved = await findQuote(pathParam(req.params.id));
  if (!saved) {
    res.status(404).json({ error: 'Offerten hittades inte, eller har gått ut.' });
    return;
  }

  let current = null;
  try {
    current = await quoteFor(saved.request);
  } catch {
    // Materialet eller kvaliteten finns inte kvar i katalogen. Då går det inte
    // att räkna om, och den sparade siffran är allt vi har.
    current = null;
  }

  res.json({
    quote: saved,
    current,
    changed: current !== null && current.total !== saved.quote.total,
  });
});

/**
 * Förbereder en ny beställning av ett jobb som redan gjorts. Filen kopieras till
 * ett nytt id, eftersom originalet hör till sin order – en fil äger en order och
 * bara en. Själva ordern läggs sedan genom det vanliga formuläret, så den går
 * igenom samma validering och betalning som alla andra.
 */
api.post('/orders/:id/reorder', saveLimit, async (req, res) => {
  const order = await findOrder(pathParam(req.params.id));
  if (!order || order.type !== 'custom') {
    res.status(404).json({ error: 'Vi hittar ingen tidigare beställning med det numret.' });
    return;
  }

  const copy = order.fileId ? await cloneUpload(order.fileId) : undefined;
  res.json({
    draft: {
      projectName: order.projectName,
      description: order.description,
      request: order.request,
      customer: order.customer,
      ...(copy
        ? {
            fileId: copy.id,
            fileName: copy.originalName,
            fileUrl: `/api/uploads/${copy.id}`,
            fileSize: copy.size,
            ...(copy.analysis ? { analysis: copy.analysis } : {}),
          }
        : {}),
      // Filen fanns på ordern men går inte att kopiera – då får kunden ladda
      // upp den igen i stället för att tro att den följt med.
      fileMissing: Boolean(order.fileId) && copy === undefined,
    },
    quote: await quoteFor(order.request),
  });
});

/** Summerar produkternas printtider för en butiksorder. */
async function totalPrintHours(lines: OrderLine[]): Promise<number> {
  const products = await Promise.all(lines.map((line) => findProduct(line.productId)));
  const hours = lines.reduce((sum, line, index) => {
    const product = products[index];
    // En bredare hylla tar längre tid, så måtten måste räknas in här.
    return sum + (product ? printTimeFor(product, line.parameters ?? {}) * line.quantity : 0);
  }, 0);
  return Math.round(hours * 10) / 10;
}

/**
 * Löser upp en rabattkod från kunden. Gäller den inte avbryts hela
 * beställningen – kunden räknar med rabatten, så att tysta släppa den vore att
 * ta mer betalt än vad som visades i kassan.
 */
async function resolveDiscount(
  code: unknown,
  subtotal: number,
): Promise<(AppliedDiscount & { code: string; label: string }) | undefined> {
  const wanted = typeof code === 'string' ? code.trim() : '';
  if (wanted.length === 0) return undefined;

  const verdict = evaluateDiscount(await findDiscount(wanted), subtotal);
  if (!verdict.ok || !verdict.applied) {
    throw new ValidationError({ code: verdict.reason ?? 'Rabattkoden gäller inte.' });
  }
  return verdict.applied;
}

/**
 * Finns det riktiga omdömen är det de som gäller. Produkter utan omdömen
 * behåller katalogens värden, så en ny produkt inte ser ut att ha fått noll i betyg.
 */
function withRating<T extends { rating: number; reviewCount: number }>(
  product: T,
  summary: ReviewSummary | undefined,
): T {
  if (!summary || summary.count === 0) return product;
  return { ...product, rating: summary.average, reviewCount: summary.count };
}

/** Sant när mejladressen finns på en levererad eller pågående order med produkten. */
async function hasBought(email: string, productId: string): Promise<boolean> {
  if (!email) return false;
  const orders = await listOrders();
  return orders.some(
    (order) =>
      order.customer.email.toLowerCase() === email &&
      order.status !== 'avbruten' &&
      order.type === 'shop' &&
      order.lines.some((line) => line.productId === productId),
  );
}

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
    // Samma uppmätta volym som ordern räknas på, annars auktoriserar kunden ett
    // annat belopp än det ordern sedan landar på.
    const fileId = String(body.fileId ?? '').trim();
    const upload = fileId ? await readMeta(fileId) : undefined;
    const request = withMeasuredVolume(await parseQuoteRequest(body.request), upload?.analysis);
    const projectName = String(body.projectName ?? '').trim() || 'Eget printjobb';
    payload = payloadForCustomOrder(
      { projectName, request, quote: await quoteFor(request) },
      config,
    );
  } else {
    const lines = await parseOrderLines(body.lines);
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const resolved = await resolveDiscount(body.code, subtotal);
    const totals = orderTotals({
      subtotal,
      shippingOption: shippingOptionFor(body.shippingOption),
      discount: resolved,
    });
    payload = payloadForOrder(
      {
        lines,
        shipping: totals.shipping,
        total: totals.total,
        ...(resolved ? { discount: { amount: totals.discount, label: resolved.label } } : {}),
      },
      config,
    );
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
  const lines = await parseOrderLines(body.lines);

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  // Printtiden summeras när ordern läggs, så framstegsmätaren har något att
  // räkna på utan att verkstaden rapporterar något.
  const productionHours = await totalPrintHours(lines);
  const shippingOption = shippingOptionFor(body.shippingOption);
  const resolved = await resolveDiscount(body.code, subtotal);
  const totals = orderTotals({ subtotal, shippingOption, discount: resolved });

  const orderId = generateOrderNumber('S');
  // Saldot dras av innan betalningen, så att två kunder inte kan köpa samma
  // sista exemplar medan Klarna svarar.
  await reserve(lines);

  // Rabatten räknas av på samma sätt och av samma skäl: koden kan ha tagit slut
  // sedan varukorgen räknades ut.
  if (resolved) {
    const claimed = await redeemDiscount(resolved.code);
    if (!claimed) {
      await release(lines);
      throw new ValidationError({
        code: 'Den koden blev slutanvänd nyss. Ta bort den och försök igen.',
      });
    }
  }

  let payment;
  try {
    payment = await settle(
      typeof body.authorizationToken === 'string' ? body.authorizationToken : undefined,
      payloadForOrder(
        {
          lines,
          shipping: totals.shipping,
          total: totals.total,
          id: orderId,
          ...(resolved ? { discount: { amount: totals.discount, label: resolved.label } } : {}),
        },
        paymentLocale(),
      ),
    );
  } catch (error) {
    await release(lines);
    if (resolved) await releaseDiscount(resolved.code);
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
    ...(productionHours > 0 ? { productionHours } : {}),
    shipping: totals.shipping,
    shippingOption: { id: shippingOption.id, name: shippingOption.name },
    ...(resolved && totals.discount > 0
      ? { discount: { code: resolved.code, label: resolved.label, amount: totals.discount } }
      : {}),
    total: totals.total,
    payment,
  };

  await saveOrder(order);
  await notify(order);
  res.status(201).json({ order });
});

api.post('/custom-orders', orderLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customer = parseCustomer(body.customer);
  const requested = await parseQuoteRequest(body.request);

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

  const request = withMeasuredVolume(requested, upload?.analysis);
  const quote = await quoteFor(request);
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
    model: upload?.analysis,
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

  // Köplatsen är ett svar på den fråga kunden faktiskt ställer: när är den
  // klar? Bara den egna orderns siffror följer med – kön i övrigt angår inte
  // den som spårar sin order.
  let place: { position: number; jobs: number; startsAt: string; readyAt: string } | undefined;
  if (order.status === 'mottagen') {
    const [orders, products] = await Promise.all([listOrders(), allProducts()]);
    const queue = buildQueue({ orders, products });
    const job = jobFor(queue, order.id);
    if (job) {
      place = {
        position: job.position,
        jobs: queue.jobs.length,
        startsAt: job.startsAt,
        readyAt: job.readyAt,
      };
    }
  }

  res.json({ order, ...(place ? { queue: place } : {}) });
});
