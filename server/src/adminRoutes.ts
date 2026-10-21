import { Router } from 'express';
import { isThemeId, readAppearance, saveAppearance } from './appearance.ts';
import type { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pathParam } from './http.ts';
import { rateLimit } from './rateLimit.ts';
import { findOrder, listOrders, updateOrder, migrateOrderArticles } from './store.ts';
import { canTransition, isOrderStatus, nextStatuses, shouldRestoreStock } from './lifecycle.ts';
import { sendMail, statusUpdate, mailIsConfigured, orderConfirmationExample, passwordResetMail, customerMessage } from './mailer.ts';
import type { CustomerMessageInput } from './mailer.ts';
import { activateAccount, adminEmail, createReset, endSession, readAccount, resetPassword, startSession, validPassword, validSession, verifyPassword } from './adminAuth.ts';
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
import { filePathFor, listModelFiles, readMeta, storedFileName } from './uploads.ts';
import { storage } from './storage.ts';
import { minimizeCustomerData } from './privacyRetention.ts';
import { parseProduction, productionChecks } from './production.ts';
import { ValidationError } from './validation.ts';
import { readFileFolders, saveFileFolder, movePrintFile } from './fileFolders.ts';

export const admin = Router();
admin.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

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

export const requireAdmin: RequestHandler = async (req, res, next) => {
  if (req.get('authorization') === 'Bearer session' && validSession(req)) { next(); return; }
  const expected = adminToken();
  if (await readAccount()) {
    res.status(401).json({ error: 'Logga in med ditt adminlösenord.' });
    return;
  }
  if (!expected && !await readAccount()) {
    res.status(503).json({ error: 'Adminläget är inte aktiverat på den här servern.' });
    return;
  }
  const header = req.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!expected || !provided || !matches(provided, expected)) {
    adminLimit(req, res, () => {
      res.status(401).json({ error: 'Fel eller saknad adminnyckel.' });
    });
    return;
  }
  next();
};

admin.get('/admin/status', async (req, res) => {
  const account = await readAccount();
  res.set('Cache-Control', 'no-store').json({ enabled: !!account || adminToken() !== undefined, passwordConfigured: !!account, email: account?.email ?? adminEmail(), authenticated: validSession(req), recoveryByEmail: mailIsConfigured() });
});

admin.post('/admin/privacy/export', requireAdmin, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Ange kundens e-postadress.' }); return;
  }
  const orders = (await listOrders()).filter(order => order.customer.email.trim().toLowerCase() === email);
  const files = await Promise.all(orders.flatMap(order => order.type === 'custom' && order.fileId ? [readMeta(order.fileId)] : []));
  res.json({ exportedAt: new Date().toISOString(), controller: 'P.C Service & Säkerhet AB', orders, files: files.filter(Boolean) });
});

admin.post('/admin/privacy/minimize', requireAdmin, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (req.body?.confirmed !== true || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Bekräfta prövningen av begäran och ange kundens e-postadress.' }); return;
  }
  res.json(await minimizeCustomerData(email));
});

const loginLimit = rateLimit({ name: 'admin-login', windowMs: 15 * 60 * 1000, max: 10, message: 'För många inloggningsförsök. Försök igen om 15 minuter.' });
const recoveryLimit = rateLimit({ name: 'admin-recovery', windowMs: 15 * 60 * 1000, max: 5, message: 'För många försök. Försök igen om 15 minuter.' });
admin.use('/admin/auth', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const origin = req.get('origin');
  const allowed = process.env.PUBLIC_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  if (origin && origin !== `${req.protocol}://${req.get('host')}` && origin !== allowed) { res.status(403).json({ error: 'Ogiltigt ursprung.' }); return; }
  next();
});
admin.post('/admin/auth/setup', loginLimit, requireAdmin, async (req, res) => {
  if (!validPassword(req.body?.password)) { res.status(400).json({ error: 'Välj ett lösenord med 12–128 tecken.' }); return; }
  if (!await activateAccount(req.body.password)) { res.status(409).json({ error: 'Kontot är redan aktiverat. Logga in med ditt lösenord.' }); return; }
  startSession(res); res.status(201).json({ email: adminEmail() });
});
admin.post('/admin/auth/login', loginLimit, async (req, res) => {
  if (!await verifyPassword(req.body?.email, req.body?.password)) { res.status(401).json({ error: 'Fel e-postadress eller lösenord.' }); return; }
  startSession(res); res.json({ success: true });
});
admin.post('/admin/auth/logout', (_req, res) => { endSession(_req, res); res.json({ success: true }); });
admin.post('/admin/auth/forgot', recoveryLimit, async (req, res) => {
  if (process.env.NODE_ENV === 'production' && !process.env.PUBLIC_URL) { res.status(503).json({ error: 'Återställning är inte konfigurerad. Kontakta administratören.' }); return; }
  const reset = await createReset(req.body?.email);
  if (reset) {
    const base = process.env.PUBLIC_URL ?? 'http://localhost:5173';
    await sendMail(passwordResetMail(reset.email, `${base}/verkstad#aterstall=${reset.token}`));
  }
  res.json({ success: true });
});
admin.post('/admin/auth/reset', recoveryLimit, async (req, res) => {
  if (!validPassword(req.body?.password)) { res.status(400).json({ error: 'Välj ett lösenord med 12–128 tecken.' }); return; }
  if (!await resetPassword(req.body?.token, req.body.password)) { res.status(400).json({ error: 'Länken är ogiltig eller har gått ut. Begär en ny återställningslänk.' }); return; }
  startSession(res); res.json({ success: true });
});

admin.get('/admin/appearance', requireAdmin, async (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ appearance: await readAppearance() });
});

admin.put('/admin/appearance', requireAdmin, async (req, res) => {
  const theme: unknown = req.body?.theme;
  if (!isThemeId(theme)) {
    res.status(400).json({ error: 'Välj ett av de fyra tillgängliga temana.' });
    return;
  }
  const appearance = await saveAppearance(theme);
  await record({ action: 'ändrad', entity: 'tema', entityId: theme, summary: `Butikens tema ändrades till ${theme}.`, changed: ['theme'] });
  res.json({ appearance });
});

admin.get('/admin/orders', requireAdmin, async (_req, res) => {
  await migrateOrderArticles(await allProducts());
  const orders = await listOrders();
  res.json({
    orders: orders.map((order) => ({ ...order, next: nextStatuses(order.status) })),
    total: orders.length,
  });
});

admin.get('/admin/operations', requireAdmin, async (_req, res) => {
  res.json({ emailConfigured: mailIsConfigured(), paymentConfigured: Boolean(process.env.KLARNA_USERNAME && process.env.KLARNA_PASSWORD), paymentEnvironment: process.env.KLARNA_ENV === 'production' ? 'production' : 'test', storage: process.env.STATE_BUCKET ? 'r2' : 'local' });
});

admin.post('/admin/email/test', requireAdmin, recoveryLimit, async (req, res) => {
  if (!mailIsConfigured()) { res.status(503).json({ error: 'E-post är inte aktiverad.' }); return; }
  const to = typeof req.body?.to === 'string' ? req.body.to.trim() : 'support@formlabb.se';
  if (to.length > 254 || !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(to)) { res.status(400).json({ error: 'Ange en giltig e-postadress.' }); return; }
  const result = await sendMail(orderConfirmationExample(to));
  res.json({ accepted: result.delivered });
});

admin.get('/admin/orders/:id/production-check', requireAdmin, async (req, res) => {
  const order = await findOrder(pathParam(req.params.id));
  if (!order) { res.status(404).json({ error: 'Ordern hittades inte.' }); return; }
  const ids = [...(order.production?.modelIds ?? []), ...(order.type === 'custom' && order.fileId ? [order.fileId] : [])];
  const files = await Promise.all(ids.map(async id => {
    const meta = await readMeta(id);
    const authorized = meta && (meta.kind === 'library' || (meta.kind !== 'image' && meta.claimedBy === order.id));
    const object = authorized ? await storage().get(storedFileName(id, meta.extension), filePathFor(meta)) : undefined;
    const present = Boolean(object && meta && object.size > 0 && object.size === meta.size);
    object?.body.destroy();
    return { id, present };
  }));
  res.json({ checks: productionChecks(order, files), checkedAt: new Date().toISOString(), revision: order.production?.revision ?? 0 });
});

admin.patch('/admin/orders/:id/production', requireAdmin, async (req, res) => {
  const plan = parseProduction(req.body?.production);
  const revision = req.body?.expectedRevision;
  if (!Number.isInteger(revision) || revision < 0) throw new ValidationError({ production: 'Ladda om ordern innan du sparar.' });
  for (const id of plan.modelIds) {
    if ((await readMeta(id))?.kind !== 'library') throw new ValidationError({ 'production.modelIds': 'En vald fil finns inte i ert eget bibliotek.' });
  }
  const order = await updateOrder(pathParam(req.params.id), current => {
    if ((current.production?.revision ?? 0) !== revision) throw new CatalogError({ production: 'Produktionskortet har ändrats. Ladda om för att se senaste versionen.' }, 409);
    return { ...current, production: { ...plan, revision: revision + 1 } };
  });
  if (!order) { res.status(404).json({ error: 'Ordern hittades inte.' }); return; }
  await record({ action: 'ändrad', entity: 'order', entityId: order.id, summary: 'Produktionskort uppdaterat', changed: ['production'] });
  res.json({ order, next: nextStatuses(order.status) });
});

admin.get('/admin/files', requireAdmin, async (_req, res) => {
  const [files, orders, organization] = await Promise.all([listModelFiles(), listOrders(), readFileFolders()]);
  res.json({ folders: organization.folders, files: files.map(file => {
    const order = orders.find(order => order.id === file.claimedBy);
    return { id: file.id, fileName: file.originalName, size: file.size, createdAt: file.createdAt,
      source: file.kind === 'library' ? 'own' : 'customer', orderId: file.claimedBy, folderId: organization.assignments[file.id] ?? null,
      projectName: order?.type === 'custom' ? order.projectName : undefined };
  }) });
});

admin.post('/admin/file-folders', requireAdmin, async (req, res) => {
  res.status(201).json({ folder: await saveFileFolder(req.body?.name) });
});
admin.patch('/admin/file-folders/:id', requireAdmin, async (req, res) => {
  res.json({ folder: await saveFileFolder(req.body?.name, pathParam(req.params.id)) });
});
admin.patch('/admin/files/:id/folder', requireAdmin, async (req, res) => {
  await movePrintFile(pathParam(req.params.id), req.body?.folderId);
  res.json({ ok: true });
});

admin.get('/admin/files/:id/download', requireAdmin, async (req, res, next) => {
  try {
    const meta = await readMeta(pathParam(req.params.id));
    if (!meta || meta.kind === 'image') { res.status(404).json({ error: 'Printfilen hittades inte.' }); return; }
    const object = await storage().get(storedFileName(meta.id, meta.extension), filePathFor(meta));
    if (!object) { res.status(404).json({ error: 'Printfilen hittades inte.' }); return; }
    res.attachment(meta.originalName);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(object.size));
    object.body.on('error', next).pipe(res);
  } catch (error) { next(error); }
});

admin.post('/admin/orders/:id/message', requireAdmin, async (req, res) => {
  const order = await findOrder(pathParam(req.params.id));
  if (!order) { res.status(404).json({error:'Ordern hittades inte.'}); return; }
  let mail;
  try { mail = customerMessage(order, (req.body ?? {}) as CustomerMessageInput); }
  catch (error) { res.status(400).json({error:error instanceof Error ? error.message : 'Ogiltigt meddelande.'}); return; }
  if (req.body.preview === true) { res.json({mail}); return; }
  if (req.body.send !== true) { res.status(400).json({error:'Förhandsgranska och bekräfta utskicket.'}); return; }
  try {
    const result = await sendMail(mail);
    try { await record({action:'ändrad',entity:'order',entityId:order.id,summary:`Kundmejl: ${req.body.kind} · ${result.delivered ? 'accepterat av e-posttjänsten' : 'lokal utkorg'}`}); }
    catch { console.error('Kundmejl hanterat men händelseloggen kunde inte sparas',order.id); }
    res.json({mail:result});
  } catch { res.status(502).json({error:'Mejlet kunde inte skickas. Kontrollera e-posttjänsten innan du försöker igen.'}); }
});

let statusQueue: Promise<unknown> = Promise.resolve();
admin.patch('/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const run = statusQueue.then(async () => {
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
      console.error('Kunde inte skicka statusmejl');
    }
  }

  res.json({ order: updated, next: nextStatuses(updated.status), mail: mailResult });
  });
  statusQueue = run.catch(() => undefined);
  await run;
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

admin.get('/admin/products', requireAdmin, async (_req, res) => {
  const products = await withLiveStock();
  res.json({ products, total: products.length });
});

admin.post('/admin/products', requireAdmin, async (req, res) => {
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

admin.patch('/admin/products/:id', requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const existing = await findProduct(id);
  if (!existing) {
    res.status(404).json({ error: 'Produkten finns inte' });
    return;
  }

  // Formuläret skickar hela produkten tillbaka, så den valideras i sin helhet.
  const input = parseProductInput({ ...existing, ...(req.body as object) }, await inputOptions());
  const product = await updateProduct(id, input);
  // Bild-/kategoriuppdateringar ska inte återställa ett lager som ändrats av köp.
  if (Object.hasOwn(req.body ?? {}, 'stock')) await setStock(id, input.stock);
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

admin.delete('/admin/products/:id', requireAdmin, async (req, res) => {
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

admin.get('/admin/categories', requireAdmin, async (_req, res) => {
  const [categories, products] = await Promise.all([allCategories(), allProducts()]);
  res.json({
    categories: categories.map((category) => ({
      ...category,
      productCount: products.filter((product) => product.category === category.id).length,
    })),
  });
});

admin.post('/admin/categories', requireAdmin, async (req, res) => {
  const category = await createCategory(parseCategoryInput(req.body));
  await record({
    action: 'skapad',
    entity: 'kategori',
    entityId: category.id,
    summary: category.name,
  });
  res.status(201).json({ category });
});

admin.patch('/admin/categories/:id', requireAdmin, async (req, res) => {
  const id = pathParam(req.params.id);
  const category = await updateCategory(id, parseCategoryInput(req.body, id));
  await record({ action: 'ändrad', entity: 'kategori', entityId: id, summary: category.name });
  res.json({ category });
});

admin.delete('/admin/categories/:id', requireAdmin, async (req, res) => {
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

admin.get('/admin/materials', requireAdmin, async (_req, res) => {
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

admin.post('/admin/materials', requireAdmin, async (req, res) => {
  const material = await saveMaterial(parseMaterialInput(req.body));
  await record({
    action: 'skapad',
    entity: 'material',
    entityId: material.id,
    summary: material.name,
  });
  res.status(201).json({ material });
});

admin.patch('/admin/materials/:id', requireAdmin, async (req, res) => {
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

admin.delete('/admin/materials/:id', requireAdmin, async (req, res) => {
  const material = await deleteMaterial(pathParam(req.params.id));
  await record({
    action: 'borttagen',
    entity: 'material',
    entityId: material.id,
    summary: material.name,
  });
  res.json({ material });
});

admin.post('/admin/qualities', requireAdmin, async (req, res) => {
  const quality = await saveQuality(parseQualityInput(req.body));
  res.status(201).json({ quality });
});

admin.patch('/admin/qualities/:id', requireAdmin, async (req, res) => {
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

admin.delete('/admin/qualities/:id', requireAdmin, async (req, res) => {
  const quality = await deleteQuality(pathParam(req.params.id));
  res.json({ quality });
});

/* ---------- Export, import och historik ---------- */

admin.get('/admin/catalog/export', requireAdmin, async (_req, res) => {
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
admin.post('/admin/catalog/import', requireAdmin, async (req, res) => {
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

admin.get('/admin/history', requireAdmin, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100) || 100));
  res.json({ entries: await history(limit) });
});
