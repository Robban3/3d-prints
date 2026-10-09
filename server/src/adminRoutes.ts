import { Router } from 'express';
import type { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pathParam } from './http.ts';
import { rateLimit } from './rateLimit.ts';
import { findOrder, listOrders, updateOrder } from './store.ts';
import { canTransition, isOrderStatus, nextStatuses, shouldRestoreStock } from './lifecycle.ts';
import { sendMail, statusUpdate } from './mailer.ts';
import {
  CatalogError,
  allCategories,
  allProducts,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  findProduct,
  updateCategory,
  updateProduct,
} from './catalog.ts';
import { parseCategoryInput, parseProductInput } from './catalogValidation.ts';
import { release, removeStock, setStock, stockLevels } from './stock.ts';
import type { AnyOrder, StatusEvent } from './types.ts';

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

admin.patch('/admin/orders/:id/status', adminLimit, requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const id = pathParam(req.params.id);
  const target = body.status;

  if (!isOrderStatus(target)) {
    res.status(400).json({ error: 'Okänd status.' });
    return;
  }

  const existing = await findOrder(id);
  if (!existing) {
    res.status(404).json({ error: 'Ordern hittades inte' });
    return;
  }
  if (!canTransition(existing.status, target)) {
    res.status(409).json({
      error: `Går inte att flytta från ${existing.status} till ${target}.`,
      allowed: nextStatuses(existing.status),
    });
    return;
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : undefined;
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
  if (!updated) {
    res.status(404).json({ error: 'Ordern hittades inte' });
    return;
  }

  // En avbruten butiksorder ska lämna tillbaka sina exemplar till lagret.
  if (shouldRestoreStock(target) && updated.type === 'shop') {
    await release(updated.lines);
  }

  const mail = statusUpdate(updated);
  let mailResult: { delivered: boolean; path?: string } | undefined;
  if (mail) {
    try {
      mailResult = await sendMail(mail);
    } catch (error) {
      // Ett misslyckat utskick får inte rulla tillbaka statusbytet.
      console.error('Kunde inte skicka statusmejl', error);
    }
  }

  res.json({ order: updated, next: nextStatuses(updated.status), mail: mailResult });
});

/* ---------- Katalog ---------- */

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
  const categories = await allCategories();
  const input = parseProductInput(req.body, { categoryIds: categories.map((c) => c.id) });
  const product = await createProduct(input);
  // Lagersaldot är föränderligt och sätts i sin egen lagring.
  await setStock(product.id, input.stock);
  res.status(201).json({ product });
});

admin.patch('/admin/products/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const existing = await findProduct(id);
  if (!existing) {
    res.status(404).json({ error: 'Produkten finns inte' });
    return;
  }

  const categories = await allCategories();
  // Formuläret skickar hela produkten tillbaka, så den valideras i sin helhet.
  const input = parseProductInput({ ...existing, ...(req.body as object) }, {
    categoryIds: categories.map((c) => c.id),
  });
  const product = await updateProduct(id, input);
  await setStock(id, input.stock);
  res.json({ product });
});

admin.delete('/admin/products/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const product = await deleteProduct(id);
  await removeStock(id);
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
  res.status(201).json({ category });
});

admin.patch('/admin/categories/:id', adminLimit, requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const category = await updateCategory(id, parseCategoryInput(req.body, id));
  res.json({ category });
});

admin.delete('/admin/categories/:id', adminLimit, requireAdmin, async (req, res) => {
  const category = await deleteCategory(pathParam(req.params.id));
  res.json({ category });
});
