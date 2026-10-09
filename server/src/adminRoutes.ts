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
import {
  parseCategoryInput,
  parseMaterialInput,
  parseProductInput,
  parseQualityInput,
} from './catalogValidation.ts';
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

  await record({
    action: 'status',
    entity: 'order',
    entityId: updated.id,
    summary: `${existing.status} → ${target}`,
  });

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
  const product = await updateProduct(id, input);
  await setStock(id, input.stock);
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
  res.json({ product });
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
  for (const entry of plan.products) {
    if (entry.existingId) {
      await updateProduct(entry.existingId, entry.input);
      await setStock(entry.existingId, entry.input.stock);
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

  res.json({ applied: true, rows: plan.rows, created, updated, ok: plan.ok, failed: 0 });
});

admin.get('/admin/history', adminLimit, requireAdmin, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100) || 100));
  res.json({ entries: await history(limit) });
});
