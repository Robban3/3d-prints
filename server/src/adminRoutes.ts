import { Router } from 'express';
import type { RequestHandler } from 'express';
import { pathParam } from './http.ts';
import { rateLimit } from './rateLimit.ts';
import { findOrder, listOrders, updateOrder } from './store.ts';
import { canTransition, isOrderStatus, nextStatuses, shouldRestoreStock } from './lifecycle.ts';
import { backInStock, sendMail, statusUpdate } from './mailer.ts';
import { claimWatchers, watcherCounts } from './notify.ts';
import { buildStats, lowStockThreshold } from './stats.ts';
import { buildQueue, printerCount } from './queue.ts';
import { buildPickList } from './picking.ts';
import { buildCustomers, findCustomer, searchCustomers, summarize } from './customers.ts';
import {
  allTemplates,
  renderTemplate,
  resetTemplate,
  saveTemplate,
  templateSpec,
} from './mailTemplates.ts';
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  actorFor,
  activeOwners,
  allUsers,
  can,
  createUser,
  findUser,
  login,
  logout,
  removeUser,
  updateUser,
  userCount,
} from './users.ts';
import type { Actor, Permission } from './users.ts';
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
 * Startnyckeln. Ett saknat värde ska inte ge en gissningsbar standardnyckel,
 * utan ingen åtkomst alls – och nyckeln gäller bara tills den första
 * användaren skapats, se `actorFor`.
 */
function adminToken(): string | undefined {
  const token = process.env.ADMIN_TOKEN;
  return token && token.length >= 16 ? token : undefined;
}

/** Hårdare gräns här, eftersom felaktiga försök är gissningar på ett lösenord. */
const adminLimit = rateLimit({
  name: 'admin',
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'För många försök. Vänta en stund.',
});

function bearer(req: Parameters<RequestHandler>[0]): string {
  const header = req.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/** Den inloggade för ett svar. Finns alltid efter requireUser. */
function actor(res: Parameters<RequestHandler>[1]): Actor {
  return res.locals.actor as Actor;
}

/** Kräver att någon är inloggad, utan krav på särskild behörighet. */
const requireUser: RequestHandler = (req, res, next) => {
  void (async () => {
    if (adminToken() === undefined && (await userCount()) === 0) {
      res.status(503).json({ error: 'Adminläget är inte aktiverat på den här servern.' });
      return;
    }
    const found = await actorFor(bearer(req), adminToken());
    if (!found) {
      res.status(401).json({ error: 'Logga in för att fortsätta.' });
      return;
    }
    res.locals.actor = found;
    next();
  })().catch(next);
};

/** Kräver en viss behörighet. Saknas den blir det 403, inte 401. */
function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    requireUser(req, res, (error?: unknown) => {
      if (error) {
        next(error as Error);
        return;
      }
      if (!can(actor(res).role, permission)) {
        res.status(403).json({ error: 'Din roll har inte behörighet till det här.' });
        return;
      }
      next();
    });
  };
}

const mayOrders = requirePermission('ordrar');
const mayProduction = requirePermission('produktion');
const mayCatalog = requirePermission('katalog');
const mayContent = requirePermission('innehall');
const mayStats = requirePermission('statistik');
const mayUsers = requirePermission('anvandare');

/* ---------- Inloggning ---------- */

/**
 * Säger vad panelen ska visa innan någon loggat in: om adminläget alls är
 * påslaget, och om den första ägaren behöver skapas.
 */
admin.get('/admin/status', async (_req, res) => {
  const users = await userCount();
  res.json({
    enabled: users > 0 || adminToken() !== undefined,
    users,
    // Startnyckeln gäller bara tills den första användaren finns.
    bootstrap: users === 0 && adminToken() !== undefined,
  });
});

admin.post('/admin/login', adminLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const session = await login(body.email, body.password);
  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: session.user,
    permissions: ROLE_PERMISSIONS[session.user.role],
  });
});

admin.post('/admin/logout', adminLimit, async (req, res) => {
  await logout(bearer(req));
  res.json({ ok: true });
});

admin.get('/admin/me', adminLimit, requireUser, (_req, res) => {
  const current = actor(res);
  res.json({ user: current, permissions: ROLE_PERMISSIONS[current.role] });
});

/* ---------- Användare ---------- */

admin.get('/admin/users', adminLimit, mayUsers, async (_req, res) => {
  res.json({ users: await allUsers(), roles: ROLE_PERMISSIONS });
});

admin.post('/admin/users', adminLimit, mayUsers, async (req, res) => {
  const user = await createUser((req.body ?? {}) as never);
  await record({
    action: 'skapad',
    entity: 'användare',
    entityId: user.id,
    summary: `${user.name} (${ROLE_LABELS[user.role]})`,
    by: actor(res).name,
  });
  res.status(201).json({ user });
});

admin.patch('/admin/users/:id', adminLimit, mayUsers, async (req, res) => {
  const id = pathParam(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const existing = await findUser(id);
  if (!existing) {
    res.status(404).json({ error: 'Användaren hittades inte' });
    return;
  }

  // Den sista aktiva ägaren får inte degraderas eller stängas av: då står
  // panelen utan någon som kan släppa in folk igen.
  const losesOwner =
    existing.role === 'agare' &&
    ((body.role !== undefined && body.role !== 'agare') || body.active === false);
  if (losesOwner && (await activeOwners(id)) === 0) {
    res.status(409).json({ error: 'Det måste finnas minst en aktiv ägare.' });
    return;
  }

  const user = await updateUser(id, body);
  if (!user) {
    res.status(404).json({ error: 'Användaren hittades inte' });
    return;
  }
  await record({
    action: 'ändrad',
    entity: 'användare',
    entityId: user.id,
    summary: `${user.name} (${ROLE_LABELS[user.role]})${user.active ? '' : ', avstängd'}`,
    by: actor(res).name,
  });
  res.json({ user });
});

admin.delete('/admin/users/:id', adminLimit, mayUsers, async (req, res) => {
  const id = pathParam(req.params.id);
  const existing = await findUser(id);
  if (!existing) {
    res.status(404).json({ error: 'Användaren hittades inte' });
    return;
  }
  if (actor(res).id === id) {
    res.status(409).json({ error: 'Du kan inte ta bort ditt eget konto.' });
    return;
  }
  if (existing.role === 'agare' && (await activeOwners(id)) === 0) {
    res.status(409).json({ error: 'Det måste finnas minst en aktiv ägare.' });
    return;
  }

  await removeUser(id);
  await record({
    action: 'borttagen',
    entity: 'användare',
    entityId: id,
    summary: existing.name,
    by: actor(res).name,
  });
  res.json({ ok: true });
});

admin.get('/admin/orders', adminLimit, mayOrders, async (_req, res) => {
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
async function applyStatus(
  id: string,
  target: OrderStatus,
  by: string,
  note?: string,
): Promise<StatusOutcome> {
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
    by,
  });

  const mail = await statusUpdate(updated);
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

admin.patch('/admin/orders/:id/status', adminLimit, mayOrders, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const target = body.status;

  if (!isOrderStatus(target)) {
    res.status(400).json({ error: 'Okänd status.' });
    return;
  }

  const result = await applyStatus(
    pathParam(req.params.id),
    target,
    actor(res).name,
    noteFrom(body.note),
  );
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
admin.post('/admin/orders/status', adminLimit, mayOrders, async (req, res) => {
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
    const result = await applyStatus(id, target, actor(res).name, note);
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
admin.get('/admin/picklist', adminLimit, mayOrders, async (req, res) => {
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

admin.get('/admin/products', adminLimit, mayCatalog, async (_req, res) => {
  const products = await withLiveStock();
  res.json({ products, total: products.length });
});

admin.post('/admin/products', adminLimit, mayCatalog, async (req, res) => {
  const input = parseProductInput(req.body, await inputOptions());
  const product = await createProduct(input);
  // Lagersaldot är föränderligt och sätts i sin egen lagring.
  await setStock(product.id, input.stock);
  await record({
    action: 'skapad',
    entity: 'produkt',
    entityId: product.id,
    summary: product.name,
    by: actor(res).name,
  });
  res.status(201).json({ product });
});

admin.patch('/admin/products/:id', adminLimit, mayCatalog, async (req, res) => {
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
    by: actor(res).name,
  });
  res.json({ product, notified });
});

admin.delete('/admin/products/:id', adminLimit, mayCatalog, async (req, res) => {
  const id = pathParam(req.params.id);
  const product = await deleteProduct(id);
  await removeStock(id);
  await record({
    action: 'borttagen',
    entity: 'produkt',
    entityId: id,
    summary: product.name,
    by: actor(res).name,
  });
  // Lagda ordrar behåller sin egen kopia av namn och pris och påverkas inte.
  res.json({ product });
});

admin.get('/admin/categories', adminLimit, mayCatalog, async (_req, res) => {
  const [categories, products] = await Promise.all([allCategories(), allProducts()]);
  res.json({
    categories: categories.map((category) => ({
      ...category,
      productCount: products.filter((product) => product.category === category.id).length,
    })),
  });
});

admin.post('/admin/categories', adminLimit, mayCatalog, async (req, res) => {
  const category = await createCategory(parseCategoryInput(req.body));
  await record({
    action: 'skapad',
    entity: 'kategori',
    entityId: category.id,
    summary: category.name,
    by: actor(res).name,
  });
  res.status(201).json({ category });
});

admin.patch('/admin/categories/:id', adminLimit, mayCatalog, async (req, res) => {
  const id = pathParam(req.params.id);
  const category = await updateCategory(id, parseCategoryInput(req.body, id));
  await record({
    action: 'ändrad',
    entity: 'kategori',
    entityId: id,
    summary: category.name,
    by: actor(res).name,
  });
  res.json({ category });
});

admin.delete('/admin/categories/:id', adminLimit, mayCatalog, async (req, res) => {
  const category = await deleteCategory(pathParam(req.params.id));
  await record({
    action: 'borttagen',
    entity: 'kategori',
    entityId: category.id,
    summary: category.name,
    by: actor(res).name,
  });
  res.json({ category });
});

/* ---------- Material och kvalitetsnivåer ---------- */

admin.get('/admin/materials', adminLimit, mayCatalog, async (_req, res) => {
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

admin.post('/admin/materials', adminLimit, mayCatalog, async (req, res) => {
  const material = await saveMaterial(parseMaterialInput(req.body));
  await record({
    action: 'skapad',
    entity: 'material',
    entityId: material.id,
    summary: material.name,
    by: actor(res).name,
  });
  res.status(201).json({ material });
});

admin.patch('/admin/materials/:id', adminLimit, mayCatalog, async (req, res) => {
  const id = pathParam(req.params.id);
  const material = await saveMaterial(parseMaterialInput(req.body, id));
  await record({
    action: 'ändrad',
    entity: 'material',
    entityId: id,
    summary: `${material.name} (prisfaktor ${material.priceFactor})`,
    by: actor(res).name,
  });
  res.json({ material });
});

admin.delete('/admin/materials/:id', adminLimit, mayCatalog, async (req, res) => {
  const material = await deleteMaterial(pathParam(req.params.id));
  await record({
    action: 'borttagen',
    entity: 'material',
    entityId: material.id,
    summary: material.name,
    by: actor(res).name,
  });
  res.json({ material });
});

admin.post('/admin/qualities', adminLimit, mayCatalog, async (req, res) => {
  const quality = await saveQuality(parseQualityInput(req.body));
  res.status(201).json({ quality });
});

admin.patch('/admin/qualities/:id', adminLimit, mayCatalog, async (req, res) => {
  const id = pathParam(req.params.id);
  const quality = await saveQuality(parseQualityInput(req.body, id));
  await record({
    action: 'ändrad',
    entity: 'kvalitet',
    entityId: id,
    summary: `${quality.name} (tidsfaktor ${quality.timeFactor})`,
    by: actor(res).name,
  });
  res.json({ quality });
});

admin.delete('/admin/qualities/:id', adminLimit, mayCatalog, async (req, res) => {
  const quality = await deleteQuality(pathParam(req.params.id));
  res.json({ quality });
});

/* ---------- Export, import och historik ---------- */

admin.get('/admin/catalog/export', adminLimit, mayCatalog, async (_req, res) => {
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
admin.post('/admin/catalog/import', adminLimit, mayCatalog, async (req, res) => {
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
    by: actor(res).name,
  });

  res.json({ applied: true, rows: plan.rows, created, updated, notified, ok: plan.ok, failed: 0 });
});

admin.get('/admin/history', adminLimit, requireUser, async (req, res) => {
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
admin.get('/admin/reviews', adminLimit, mayContent, async (req, res) => {
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

admin.patch('/admin/reviews/:id', adminLimit, mayContent, async (req, res) => {
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
    by: actor(res).name,
  });
  res.json({ review, waiting: await countWaiting() });
});

admin.delete('/admin/reviews/:id', adminLimit, mayContent, async (req, res) => {
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
    by: actor(res).name,
  });
  res.json({ review, waiting: await countWaiting() });
});

/* ---------- Översikt ---------- */

admin.get('/admin/stats', adminLimit, mayStats, async (req, res) => {
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

/* ---------- Kundregister ---------- */

/**
 * Kunderna räknas fram ur ordrarna varje gång. Det är orderdata, så det är
 * ordrarnas behörighet som gäller – redaktören har inget på kundernas adresser
 * att göra.
 */
admin.get('/admin/customers', adminLimit, mayOrders, async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const all = buildCustomers(await listOrders());
  res.json({
    customers: searchCustomers(all, search),
    summary: summarize(all),
    total: all.length,
  });
});

admin.get('/admin/customers/:email', adminLimit, mayOrders, async (req, res) => {
  const orders = await listOrders();
  const customer = findCustomer(buildCustomers(orders), pathParam(req.params.email));
  if (!customer) {
    res.status(404).json({ error: 'Kunden hittades inte' });
    return;
  }
  const own = new Set(customer.orderIds);
  res.json({
    customer,
    orders: orders
      .filter((order) => own.has(order.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
});

/* ---------- Mejlmallar ---------- */

admin.get('/admin/mail-templates', adminLimit, mayContent, async (_req, res) => {
  res.json({ templates: await allTemplates() });
});

admin.put('/admin/mail-templates/:id', adminLimit, mayContent, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const template = await saveTemplate(pathParam(req.params.id), body);
  await record({
    action: 'ändrad',
    entity: 'mejlmall',
    entityId: template.id,
    summary: `${template.name}${template.custom ? '' : ' (tillbaka till utgångsläget)'}`,
    by: actor(res).name,
  });
  res.json({ template });
});

admin.delete('/admin/mail-templates/:id', adminLimit, mayContent, async (req, res) => {
  const template = await resetTemplate(pathParam(req.params.id));
  if (!template) {
    res.status(404).json({ error: 'Mallen hittades inte' });
    return;
  }
  await record({
    action: 'ändrad',
    entity: 'mejlmall',
    entityId: template.id,
    summary: `${template.name} tillbaka till utgångsläget`,
    by: actor(res).name,
  });
  res.json({ template });
});

/**
 * Visar hur brevet ser ut med påhittade värden, så man slipper lägga en
 * testorder för att se vad kunden får.
 */
admin.post('/admin/mail-templates/:id/preview', adminLimit, mayContent, async (req, res) => {
  const id = pathParam(req.params.id);
  const spec = templateSpec(id);
  if (!spec) {
    res.status(404).json({ error: 'Mallen hittades inte' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const values = (body.values ?? {}) as Record<string, string>;
  const filled = Object.fromEntries(
    spec.variables.map((name) => [name, values[name] ?? `‹${name}›`]),
  );
  res.json({ preview: await renderTemplate(id, filled) });
});

/* ---------- Produktionskö och filament ---------- */

admin.get('/admin/queue', adminLimit, mayProduction, async (_req, res) => {
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

admin.get('/admin/filament', adminLimit, mayProduction, async (_req, res) => {
  const [spools, log] = await Promise.all([allSpools(), consumptionLog()]);
  res.json({ spools, log, lowFilamentGrams: lowFilamentGrams() });
});

admin.post('/admin/filament', adminLimit, mayProduction, async (req, res) => {
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
    by: actor(res).name,
  });
  res.status(201).json({ spool });
});

admin.patch('/admin/filament/:id', adminLimit, mayProduction, async (req, res) => {
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
    by: actor(res).name,
  });
  res.json({ spool });
});

admin.delete('/admin/filament/:id', adminLimit, mayProduction, async (req, res) => {
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
    by: actor(res).name,
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
      await backInStock({
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
      // Ingen person bakom den här: beskedet går ut av sig självt.
    });
  }
  return watchers.length;
}

/* ---------- Rabattkoder ---------- */

admin.get('/admin/discounts', adminLimit, mayContent, async (_req, res) => {
  res.json({ discounts: await allDiscounts() });
});

admin.post('/admin/discounts', adminLimit, mayContent, async (req, res) => {
  const discount = await saveDiscount(req.body);
  await record({
    action: 'skapad',
    entity: 'rabattkod',
    entityId: discount.code,
    summary: `${discount.code} · ${discount.description}`,
    by: actor(res).name,
  });
  res.status(201).json({ discount });
});

admin.patch('/admin/discounts/:code', adminLimit, mayContent, async (req, res) => {
  const code = pathParam(req.params.code);
  const discount = await saveDiscount(req.body, code);
  await record({
    action: 'ändrad',
    entity: 'rabattkod',
    entityId: discount.code,
    summary: `${discount.code} · ${discount.active ? 'aktiv' : 'avstängd'}`,
    by: actor(res).name,
  });
  res.json({ discount });
});

admin.delete('/admin/discounts/:code', adminLimit, mayContent, async (req, res) => {
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
    by: actor(res).name,
  });
  res.json({ discount });
});

/* ---------- Startsidan ---------- */

admin.get('/admin/content', adminLimit, mayContent, async (_req, res) => {
  res.json(await homeContent());
});

admin.put('/admin/content/hero', adminLimit, mayContent, async (req, res) => {
  const hero = await saveHero(await parseHeroInput(req.body));
  await record({
    action: 'ändrad',
    entity: 'startsida',
    entityId: 'hero',
    summary: hero.media ? `${hero.title} (${hero.media.kind})` : hero.title,
    by: actor(res).name,
  });
  res.json({ hero });
});

admin.post('/admin/content/campaigns', adminLimit, mayContent, async (req, res) => {
  const campaign = await saveCampaign(await parseCampaignInput(req.body));
  await record({
    action: 'skapad',
    entity: 'kampanj',
    entityId: campaign.id,
    summary: campaign.title,
    by: actor(res).name,
  });
  res.status(201).json({ campaign });
});

admin.patch('/admin/content/campaigns/:id', adminLimit, mayContent, async (req, res) => {
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
    by: actor(res).name,
  });
  res.json({ campaign });
});

admin.post('/admin/content/campaigns/:id/move', adminLimit, mayContent, async (req, res) => {
  const direction = (req.body as { direction?: unknown })?.direction === 'ned' ? 1 : -1;
  const campaigns = await moveCampaign(pathParam(req.params.id), direction);
  res.json({ campaigns });
});

admin.delete('/admin/content/campaigns/:id', adminLimit, mayContent, async (req, res) => {
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
    by: actor(res).name,
  });
  res.json({ campaign });
});
