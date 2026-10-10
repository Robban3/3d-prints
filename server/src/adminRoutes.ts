import { Router } from 'express';
import type { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pathParam } from './http.ts';
import { rateLimit } from './rateLimit.ts';
import { findOrder, listOrders, updateOrder } from './store.ts';
import { canTransition, isOrderStatus, nextStatuses, shouldRestoreStock } from './lifecycle.ts';
import { backInStock, sendMail, statusUpdate } from './mailer.ts';
import { claimWatchers, watcherCounts } from './notify.ts';
import { buildStats, lowStockThreshold } from './stats.ts';
import { buildQueue, printerCount } from './queue.ts';
import { buildPickList } from './picking.ts';
import {
  addSpool,
  allSpools,
  consume,
  consumptionLog,
  lowFilamentGrams,
  parseSpoolInput,
  removeSpool,
  shortages,
  updateSpool,
} from './filament.ts';
import { allDiscounts, removeDiscount, saveDiscount } from './discounts.ts';
import {
  findCampaign,
  homeContent,
  moveCampaign,
  parseCampaignInput,
  parseHeroInput,
  removeCampaign,
  saveCampaign,
  saveHero,
} from './content.ts';
import {
  allCategories,
  allMaterials,
  allProducts,
  allQualities,
  createCategory,
  createProduct,
  deleteCategory,
  deleteMaterial,
  deleteProduct,
  deleteQuality,
  findProduct,
  saveMaterial,
  saveQuality,
  updateCategory,
  updateProduct,
} from './catalog.ts';
import { buildExport, planImport } from './catalogTransfer.ts';
import { changedFields, history, record } from './auditLog.ts';
import { allReviews, countWaiting, deleteReview, findReview, setReviewStatus } from './reviews.ts';
import type { ReviewStatus } from './reviews.ts';
import {
  parseCategoryInput,
  parseMaterialInput,
  parseProductInput,
  parseQualityInput,
} from './catalogValidation.ts';
import { release, removeStock, setStock, stockLevels } from './stock.ts';
import type { AnyOrder, OrderStatus, StatusEvent } from './types.ts';

export const admin = Router();

/**
 * Adminvägarna är avstängda tills ADMIN_TOKEN sätts. Ett saknat värde ska inte
 * ge en gissningsbar standardnyckel, utan ingen åtkomst alls.
 */
function adminToken(): string | undefined {
  const token = process.env.ADMIN_TOKEN;
  return token && token.length >= 16 ? token : undefined;
}

function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Jämförelsen görs i konstant tid så att svarstiden inte avslöjar nyckeln.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Hårdare gräns här, eftersom felaktiga försök är gissningar på nyckeln. */
const adminLimit = rateLimit({
  name: 'admin',
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'För många försök. Vänta en stund.',
});

const requireAdmin: RequestHandler = (req, res, next) => {
  const expected = adminToken();
  if (!expected) {
    res.status(503).json({ error: 'Adminläget är inte aktiverat på den här servern.' });
    return;
  }
  const header = req.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided || !matches(provided, expected)) {
    res.status(401).json({ error: 'Fel eller saknad adminnyckel.' });
    return;
  }
  next();
};

admin.get('/admin/status', (_req, res) => {
  res.json({ enabled: adminToken() !== undefined });
});

admin.get('/admin/orders', adminLimit, requireAdmin, async (_req, res) => {
  const orders = await listOrders();
  res.json({
    orders: orders.map((order) => ({ ...order, next: nextStatuses(order.status) })),
    total: orders.length,
  });
});

type MailResult = { delivered: boolean; path?: string };

type StatusOutcome =
  | {
      ok: true;
      order: AnyOrder;
      from: OrderStatus;
      mail?: MailResult;
      filament?: Awaited<ReturnType<typeof consume>>;
    }
  | { ok: false; id: string; reason: 'saknas' }
  | { ok: false; id: string; reason: 'otillåten'; from: OrderStatus; allowed: OrderStatus[] };

/**
 * Flyttar en order till en ny status, med allt som hänger på det: lagret,
 * filamentet, loggen och mejlet till kunden.
 *
 * Både enskilda statusbyten och bulkbytet går den här vägen, så en order som
 * flyttas tillsammans med tio andra behandlas exakt som en som flyttas ensam.
 */
async function applyStatus(id: string, target: OrderStatus, note?: string): Promise<StatusOutcome> {
  const existing = await findOrder(id);
  if (!existing) return { ok: false, id, reason: 'saknas' };
  if (!canTransition(existing.status, target)) {
    return {
      ok: false,
      id,
      reason: 'otillåten',
      from: existing.status,
      allowed: nextStatuses(existing.status),
    };
  }

  const event: StatusEvent = {
    status: target,
    at: new Date().toISOString(),
    ...(note ? { note } : {}),
  };

  const updated = await updateOrder(
    id,
    (order): AnyOrder => ({
      ...order,
      status: target,
      history: [...(order.history ?? []), event],
    }),
  );
  // Ordern kan ha tagits bort mellan uppslaget och skrivningen.
  if (!updated) return { ok: false, id, reason: 'saknas' };

  // En avbruten butiksorder ska lämna tillbaka sina exemplar till lagret.
  if (shouldRestoreStock(target) && updated.type === 'shop') {
    await release(updated.lines);
  }

  // Plasten bokförs när jobbet går i produktion. Går ordern ut och in igen
  // bokförs den ändå bara en gång – consume är idempotent på ordernumret.
  let filament: Awaited<ReturnType<typeof consume>> | undefined;
  if (target === 'i_produktion') {
    const products = await allProducts();
    const job = buildQueue({ orders: [updated], products }).jobs[0];
    if (job && job.materials.length > 0) filament = await consume(updated.id, job.materials);
  }

  await record({
    action: 'status',
    entity: 'order',
    entityId: updated.id,
    summary: `${existing.status} → ${target}`,
  });

  const mail = statusUpdate(updated);
  let mailResult: MailResult | undefined;
  if (mail) {
    try {
      mailResult = await sendMail(mail);
    } catch (error) {
      // Ett misslyckat utskick får inte rulla tillbaka statusbytet.
      console.error('Kunde inte skicka statusmejl', error);
    }
  }

  return {
    ok: true,
    order: updated,
    from: existing.status,
    ...(mailResult ? { mail: mailResult } : {}),
    ...(filament ? { filament } : {}),
  };
}

function noteFrom(value: unknown): string | undefined {
  const note = typeof value === 'string' ? value.trim().slice(0, 300) : '';
  return note ? note : undefined;
}

admin.patch('/admin/orders/:id/status', adminLimit, requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const target = body.status;

  if (!isOrderStatus(target)) {
    res.status(400).json({ error: 'Okänd status.' });
    return;
  }

  const result = await applyStatus(pathParam(req.params.id), target, noteFrom(body.note));
  if (!result.ok) {
    if (result.reason === 'saknas') {
      res.status(404).json({ error: 'Ordern hittades inte' });
      return;
    }
    res.status(409).json({
      error: `Går inte att flytta från ${result.from} till ${target}.`,
      allowed: result.allowed,
    });
    return;
  }

  res.json({
    order: result.order,
    next: nextStatuses(result.order.status),
    mail: result.mail,
    ...(result.filament ? { filament: result.filament } : {}),
  });
});

/** Hur många ordrar som får flyttas i ett svep. Skyddar mot en slint-klickad lista. */
const BULK_LIMIT = 100;

/**
 * Flyttar flera ordrar till samma status. Varje order prövas för sig: en som
 * inte kan flyttas stoppar inte de övriga, men den rapporteras tillbaka med
 * skälet, så panelen kan visa exakt vad som inte gick.
 */
admin.post('/admin/orders/status', adminLimit, requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const target = body.status;

  if (!isOrderStatus(target)) {
    res.status(400).json({ error: 'Okänd status.' });
    return;
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];
  if (ids.length === 0) {
    res.status(400).json({ error: 'Välj minst en order.' });
    return;
  }
  if (ids.length > BULK_LIMIT) {
    res.status(400).json({ error: `Högst ${BULK_LIMIT} ordrar åt gången.` });
    return;
  }

  const note = noteFrom(body.note);
  const moved: AnyOrder[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  // En i taget: statusbytet skriver till ordern, lagret och filamentet, och
  // de skrivningarna ska inte trängas med varandra.
  for (const id of ids) {
    const result = await applyStatus(id, target, note);
    if (result.ok) {
      moved.push(result.order);
    } else if (result.reason === 'saknas') {
      failed.push({ id, reason: 'Ordern hittades inte.' });
    } else {
      failed.push({ id, reason: `Går inte att flytta från ${result.from} till ${target}.` });
    }
  }

  res.json({
    moved: moved.map((order) => ({ ...order, next: nextStatuses(order.status) })),
    failed,
    status: target,
  });
});

/**
 * Plocklistan för ett urval ordrar: antingen de ordrar som räknas upp, eller
 * alla i en viss status. Utan urval är det de mottagna – det är de som väntar
 * på att göras i ordning.
 */
admin.get('/admin/picklist', adminLimit, requireAdmin, async (req, res) => {
  const requested = typeof req.query.ids === 'string' ? req.query.ids.split(',') : [];
  const ids = new Set(requested.map((id) => id.trim().toLowerCase()).filter(Boolean));
  const status = isOrderStatus(req.query.status) ? req.query.status : undefined;

  const [all, products] = await Promise.all([listOrders(), allProducts()]);
  const orders =
    ids.size > 0
      ? all.filter((order) => ids.has(order.id.toLowerCase()))
      : all.filter((order) => order.status === (status ?? 'mottagen'));

  res.json({ list: buildPickList({ orders, products }) });
});

/* ---------- Katalog ---------- */

/** Vilka kategorier och material som finns just nu, för valideringen. */
async function inputOptions() {
  const [categories, materials] = await Promise.all([allCategories(), allMaterials()]);
  return {
    categoryIds: categories.map((category) => category.id),
    materialIds: materials.map((material) => material.id),
  };
}

/** Saldot bor i lagerlagringen, så listan speglar in det som gäller nu. */
async function withLiveStock() {
  const [products, levels] = await Promise.all([allProducts(), stockLevels()]);
  return products.map((product) => ({ ...product, stock: levels.get(product.id) ?? 0 }));
}

admin.get('/admin/products', adminLimit, requireAdmin, async (_req, res) => {
  const products = await withLiveStock();
  res.json({ products, total: products.length });
});

admin.post('/admin/products', adminLimit, requireAdmin, async (req, res) => {
  const input = parseProductInput(req.body, await inputOptions());
  const product = await createProduct(input);
  // Lagersaldot är föränderligt och sätts i sin egen lagring.
  await setStock(product.id, input.stock);
  await record({
    action: 'skapad',
    entity: 'produkt',
    entityId: product.id,
    summary: product.name,
  });
  res.status(201).json({ product });
});

admin.patch('/admin/products/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const existing = await findProduct(id);
  if (!existing) {
    res.status(404).json({ error: 'Produkten finns inte' });
    return;
  }

  // Formuläret skickar hela produkten tillbaka, så den valideras i sin helhet.
  const input = parseProductInput({ ...existing, ...(req.body as object) }, await inputOptions());
  const before = (await stockLevels()).get(id) ?? 0;
  const product = await updateProduct(id, input);
  await setStock(id, input.stock);
  const notified = await announceRestock(product, before, input.stock);
  await record({
    action: 'ändrad',
    entity: 'produkt',
    entityId: id,
    summary: product.name,
    changed: changedFields(
      existing as unknown as Record<string, unknown>,
      product as unknown as Record<string, unknown>,
    ),
  });
  res.json({ product, notified });
});

admin.delete('/admin/products/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const product = await deleteProduct(id);
  await removeStock(id);
  await record({
    action: 'borttagen',
    entity: 'produkt',
    entityId: id,
    summary: product.name,
  });
  // Lagda ordrar behåller sin egen kopia av namn och pris och påverkas inte.
  res.json({ product });
});

admin.get('/admin/categories', adminLimit, requireAdmin, async (_req, res) => {
  const [categories, products] = await Promise.all([allCategories(), allProducts()]);
  res.json({
    categories: categories.map((category) => ({
      ...category,
      productCount: products.filter((product) => product.category === category.id).length,
    })),
  });
});

admin.post('/admin/categories', adminLimit, requireAdmin, async (req, res) => {
  const category = await createCategory(parseCategoryInput(req.body));
  await record({
    action: 'skapad',
    entity: 'kategori',
    entityId: category.id,
    summary: category.name,
  });
  res.status(201).json({ category });
});

admin.patch('/admin/categories/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const category = await updateCategory(id, parseCategoryInput(req.body, id));
  await record({ action: 'ändrad', entity: 'kategori', entityId: id, summary: category.name });
  res.json({ category });
});

admin.delete('/admin/categories/:id', adminLimit, requireAdmin, async (req, res) => {
  const category = await deleteCategory(pathParam(req.params.id));
  await record({
    action: 'borttagen',
    entity: 'kategori',
    entityId: category.id,
    summary: category.name,
  });
  res.json({ category });
});

/* ---------- Material och kvalitetsnivåer ---------- */

admin.get('/admin/materials', adminLimit, requireAdmin, async (_req, res) => {
  const [materials, qualities, products] = await Promise.all([
    allMaterials(),
    allQualities(),
    allProducts(),
  ]);
  res.json({
    materials: materials.map((material) => ({
      ...material,
      productCount: products.filter((product) => product.material === material.id).length,
    })),
    qualities,
  });
});

admin.post('/admin/materials', adminLimit, requireAdmin, async (req, res) => {
  const material = await saveMaterial(parseMaterialInput(req.body));
  await record({
    action: 'skapad',
    entity: 'material',
    entityId: material.id,
    summary: material.name,
  });
  res.status(201).json({ material });
});

admin.patch('/admin/materials/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const material = await saveMaterial(parseMaterialInput(req.body, id));
  await record({
    action: 'ändrad',
    entity: 'material',
    entityId: id,
    summary: `${material.name} (prisfaktor ${material.priceFactor})`,
  });
  res.json({ material });
});

admin.delete('/admin/materials/:id', adminLimit, requireAdmin, async (req, res) => {
  const material = await deleteMaterial(pathParam(req.params.id));
  await record({
    action: 'borttagen',
    entity: 'material',
    entityId: material.id,
    summary: material.name,
  });
  res.json({ material });
});

admin.post('/admin/qualities', adminLimit, requireAdmin, async (req, res) => {
  const quality = await saveQuality(parseQualityInput(req.body));
  res.status(201).json({ quality });
});

admin.patch('/admin/qualities/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const quality = await saveQuality(parseQualityInput(req.body, id));
  await record({
    action: 'ändrad',
    entity: 'kvalitet',
    entityId: id,
    summary: `${quality.name} (tidsfaktor ${quality.timeFactor})`,
  });
  res.json({ quality });
});

admin.delete('/admin/qualities/:id', adminLimit, requireAdmin, async (req, res) => {
  const quality = await deleteQuality(pathParam(req.params.id));
  res.json({ quality });
});

/* ---------- Export, import och historik ---------- */

admin.get('/admin/catalog/export', adminLimit, requireAdmin, async (_req, res) => {
  const [products, categories, materials, qualities] = await Promise.all([
    allProducts(),
    allCategories(),
    allMaterials(),
    allQualities(),
  ]);
  const payload = buildExport({ products, categories, materials, qualities });
  res.setHeader('Content-Disposition', 'attachment; filename="katalog.json"');
  res.json(payload);
});

/**
 * Importen körs i två steg. Utan `apply` returneras bara en plan, så att det
 * går att se vad som skulle hända innan något skrivs. Är någon rad felaktig
 * skrivs ingenting alls – halva kataloger är värre än inga.
 */
admin.post('/admin/catalog/import', adminLimit, requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as { apply?: unknown; catalog?: unknown };
  const existing = await allProducts();
  const plan = planImport(body.catalog, existing, await inputOptions());

  if (body.apply !== true || plan.failed > 0) {
    res.status(plan.failed > 0 && body.apply === true ? 400 : 200).json({
      applied: false,
      ...plan,
      products: undefined,
    });
    return;
  }

  let created = 0;
  let updated = 0;
  let notified = 0;
  const levels = await stockLevels();
  for (const entry of plan.products) {
    if (entry.existingId) {
      const product = await updateProduct(entry.existingId, entry.input);
      const before = levels.get(entry.existingId) ?? 0;
      await setStock(entry.existingId, entry.input.stock);
      notified += await announceRestock(product, before, entry.input.stock);
      updated += 1;
    } else {
      const product = await createProduct(entry.input);
      await setStock(product.id, entry.input.stock);
      created += 1;
    }
  }

  await record({
    action: 'importerad',
    entity: 'produkt',
    entityId: 'katalog',
    summary: `${created} skapade, ${updated} uppdaterade`,
  });

  res.json({ applied: true, rows: plan.rows, created, updated, notified, ok: plan.ok, failed: 0 });
});

admin.get('/admin/history', adminLimit, requireAdmin, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100) || 100));
  res.json({ entries: await history(limit) });
});

/* ---------- Omdömen ---------- */

const REVIEW_STATUSES = ['väntar', 'publicerad', 'avslagen'] as const;

function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && (REVIEW_STATUSES as readonly string[]).includes(value);
}

/**
 * Hela kön, väntande först. Produktnamnet följer med så att panelen inte
 * behöver slå upp varje produkt för sig.
 */
admin.get('/admin/reviews', adminLimit, requireAdmin, async (req, res) => {
  const status = isReviewStatus(req.query.status) ? req.query.status : undefined;
  const [reviews, products] = await Promise.all([allReviews(status), allProducts()]);
  const names = new Map(products.map((product) => [product.id, product.name]));

  res.json({
    reviews: reviews.map((review) => ({
      ...review,
      productName: names.get(review.productId) ?? 'Borttagen produkt',
    })),
    waiting: await countWaiting(),
  });
});

admin.patch('/admin/reviews/:id', adminLimit, requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as { status?: unknown; reply?: unknown };
  if (!isReviewStatus(body.status)) {
    res.status(400).json({
      error: 'Okänd status.',
      fields: { status: `Välj en av ${REVIEW_STATUSES.join(', ')}.` },
    });
    return;
  }
  if (body.reply !== undefined && typeof body.reply !== 'string') {
    res.status(400).json({ error: 'Svaret måste vara text.', fields: { reply: 'Ogiltigt svar.' } });
    return;
  }
  if (typeof body.reply === 'string' && body.reply.length > 1000) {
    res.status(400).json({
      error: 'Svaret är för långt.',
      fields: { reply: 'Svaret får vara högst 1000 tecken.' },
    });
    return;
  }

  const review = await setReviewStatus(pathParam(req.params.id), body.status, body.reply);
  if (!review) {
    res.status(404).json({ error: 'Omdömet hittades inte' });
    return;
  }

  await record({
    action: 'status',
    entity: 'omdöme',
    entityId: review.id,
    summary: `${review.rating} av 5 från ${review.author} → ${review.status}`,
  });
  res.json({ review, waiting: await countWaiting() });
});

admin.delete('/admin/reviews/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const existing = await findReview(id);
  const review = await deleteReview(id);
  if (!review) {
    res.status(404).json({ error: 'Omdömet hittades inte' });
    return;
  }

  await record({
    action: 'borttagen',
    entity: 'omdöme',
    entityId: review.id,
    summary: `${existing?.rating ?? review.rating} av 5 från ${review.author}`,
  });
  res.json({ review, waiting: await countWaiting() });
});

/* ---------- Översikt ---------- */

admin.get('/admin/stats', adminLimit, requireAdmin, async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days ?? 30) || 30));
  const [orders, products, stock, watchers, pendingReviews] = await Promise.all([
    listOrders(),
    allProducts(),
    stockLevels(),
    watcherCounts(),
    countWaiting(),
  ]);

  res.json({
    stats: buildStats({ orders, products, stock, watchers, pendingReviews, days }),
    days,
    lowStockThreshold: lowStockThreshold(),
  });
});

/* ---------- Produktionskö och filament ---------- */

admin.get('/admin/queue', adminLimit, requireAdmin, async (_req, res) => {
  const [orders, products, spools] = await Promise.all([listOrders(), allProducts(), allSpools()]);
  const queue = buildQueue({ orders, products });

  res.json({
    queue,
    spools,
    shortages: shortages(queue.demand, spools),
    lowFilamentGrams: lowFilamentGrams(),
    printers: printerCount(),
  });
});

admin.get('/admin/filament', adminLimit, requireAdmin, async (_req, res) => {
  const [spools, log] = await Promise.all([allSpools(), consumptionLog()]);
  res.json({ spools, log, lowFilamentGrams: lowFilamentGrams() });
});

admin.post('/admin/filament', adminLimit, requireAdmin, async (req, res) => {
  const materials = await allMaterials();
  const spool = await addSpool(
    parseSpoolInput(
      req.body ?? {},
      materials.map((material) => material.id),
    ),
  );
  await record({
    action: 'skapad',
    entity: 'filament',
    entityId: spool.id,
    summary: `${spool.material.toUpperCase()} ${spool.color}, ${spool.grams} g`,
  });
  res.status(201).json({ spool });
});

admin.patch('/admin/filament/:id', adminLimit, requireAdmin, async (req, res) => {
  const materials = await allMaterials();
  const parsed = parseSpoolInput(
    req.body ?? {},
    materials.map((material) => material.id),
  );
  const spool = await updateSpool(pathParam(req.params.id), parsed);
  if (!spool) {
    res.status(404).json({ error: 'Rullen hittades inte' });
    return;
  }
  await record({
    action: 'ändrad',
    entity: 'filament',
    entityId: spool.id,
    summary: `${spool.material.toUpperCase()} ${spool.color}, ${spool.grams} g kvar`,
  });
  res.json({ spool });
});

admin.delete('/admin/filament/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  if (!(await removeSpool(id))) {
    res.status(404).json({ error: 'Rullen hittades inte' });
    return;
  }
  await record({
    action: 'borttagen',
    entity: 'filament',
    entityId: id,
    summary: 'Rulle borttagen',
  });
  res.json({ ok: true });
});

/**
 * Skickar beskedet till dem som bevakat en slutsåld produkt. Bevakningarna
 * plockas ut och tas bort i samma steg, så ingen får mejlet två gånger.
 * Returnerar hur många som fick besked.
 */
async function announceRestock(
  product: { id: string; name: string; slug: string },
  before: number,
  after: number,
): Promise<number> {
  // Bara övergången från tomt till påfyllt är ett besked värt att skicka.
  if (before > 0 || after <= 0) return 0;

  const watchers = await claimWatchers(product.id);
  for (const watcher of watchers) {
    await sendMail(
      backInStock({
        to: watcher.email,
        productName: product.name,
        slug: product.slug,
        stock: after,
      }),
    );
  }
  if (watchers.length > 0) {
    await record({
      action: 'status',
      entity: 'produkt',
      entityId: product.id,
      summary: `${product.name} i lager igen – ${watchers.length} fick besked`,
    });
  }
  return watchers.length;
}

/* ---------- Rabattkoder ---------- */

admin.get('/admin/discounts', adminLimit, requireAdmin, async (_req, res) => {
  res.json({ discounts: await allDiscounts() });
});

admin.post('/admin/discounts', adminLimit, requireAdmin, async (req, res) => {
  const discount = await saveDiscount(req.body);
  await record({
    action: 'skapad',
    entity: 'rabattkod',
    entityId: discount.code,
    summary: `${discount.code} · ${discount.description}`,
  });
  res.status(201).json({ discount });
});

admin.patch('/admin/discounts/:code', adminLimit, requireAdmin, async (req, res) => {
  const code = pathParam(req.params.code);
  const discount = await saveDiscount(req.body, code);
  await record({
    action: 'ändrad',
    entity: 'rabattkod',
    entityId: discount.code,
    summary: `${discount.code} · ${discount.active ? 'aktiv' : 'avstängd'}`,
  });
  res.json({ discount });
});

admin.delete('/admin/discounts/:code', adminLimit, requireAdmin, async (req, res) => {
  const discount = await removeDiscount(pathParam(req.params.code));
  if (!discount) {
    res.status(404).json({ error: 'Rabattkoden hittades inte' });
    return;
  }
  await record({
    action: 'borttagen',
    entity: 'rabattkod',
    entityId: discount.code,
    summary: `${discount.code}, inlöst ${discount.uses} gånger`,
  });
  res.json({ discount });
});

/* ---------- Startsidan ---------- */

admin.get('/admin/content', adminLimit, requireAdmin, async (_req, res) => {
  res.json(await homeContent());
});

admin.put('/admin/content/hero', adminLimit, requireAdmin, async (req, res) => {
  const hero = await saveHero(await parseHeroInput(req.body));
  await record({
    action: 'ändrad',
    entity: 'startsida',
    entityId: 'hero',
    summary: hero.media ? `${hero.title} (${hero.media.kind})` : hero.title,
  });
  res.json({ hero });
});

admin.post('/admin/content/campaigns', adminLimit, requireAdmin, async (req, res) => {
  const campaign = await saveCampaign(await parseCampaignInput(req.body));
  await record({
    action: 'skapad',
    entity: 'kampanj',
    entityId: campaign.id,
    summary: campaign.title,
  });
  res.status(201).json({ campaign });
});

admin.patch('/admin/content/campaigns/:id', adminLimit, requireAdmin, async (req, res) => {
  const existing = await findCampaign(pathParam(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Kampanjen hittades inte' });
    return;
  }
  // Formuläret skickar hela kampanjen tillbaka, så den valideras i sin helhet.
  const campaign = await saveCampaign(await parseCampaignInput(req.body, existing));
  await record({
    action: 'ändrad',
    entity: 'kampanj',
    entityId: campaign.id,
    summary: campaign.title,
    changed: changedFields(
      existing as unknown as Record<string, unknown>,
      campaign as unknown as Record<string, unknown>,
    ),
  });
  res.json({ campaign });
});

admin.post('/admin/content/campaigns/:id/move', adminLimit, requireAdmin, async (req, res) => {
  const direction = (req.body as { direction?: unknown })?.direction === 'ned' ? 1 : -1;
  const campaigns = await moveCampaign(pathParam(req.params.id), direction);
  res.json({ campaigns });
});

admin.delete('/admin/content/campaigns/:id', adminLimit, requireAdmin, async (req, res) => {
  const campaign = await removeCampaign(pathParam(req.params.id));
  if (!campaign) {
    res.status(404).json({ error: 'Kampanjen hittades inte' });
    return;
  }
  await record({
    action: 'borttagen',
    entity: 'kampanj',
    entityId: campaign.id,
    summary: campaign.title,
  });
  res.json({ campaign });
});
