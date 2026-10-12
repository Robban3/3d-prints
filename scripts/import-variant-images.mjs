// Run from server/: node --env-file-if-exists=.env --experimental-strip-types ../scripts/import-variant-images.mjs
// Local catalogue maintenance; uses the same storage metadata and validation as image uploads.
import { readFile, copyFile, access } from 'node:fs/promises';
import { allProducts, allCategories, allMaterials, updateProduct } from '../server/src/catalog.ts';
import { parseProductInput } from '../server/src/catalogValidation.ts';
import { ensureUploadDir, generateUploadId, writeMeta, filePathFor, storedFileName } from '../server/src/uploads.ts';
import { storage } from '../server/src/storage.ts';

const jobs = JSON.parse(await readFile(new URL('../tmp/variant-jobs.json', import.meta.url), 'utf8'));
const products = await allProducts();
const options = { categoryIds: (await allCategories()).map(c => c.id), materialIds: (await allMaterials()).map(m => m.id) };
await ensureUploadDir();
for (const product of products) {
  const variants = jobs.filter(job => job.slug === product.slug);
  if (!variants.length) continue;
  const variantImages = [...(product.variantImages ?? [])];
  for (const job of variants) {
    if (variantImages.some(v => v.color === job.color && (v.size ?? '') === job.size)) continue;
    const source = new URL(`../client/public/images/variants/${job.file}.webp`, import.meta.url);
    try { await access(source); } catch { continue; }
    const bytes = await readFile(source);
    const id = generateUploadId();
    const fileName = `${job.file}-visualisering.webp`;
    const meta = { id, kind: 'image', originalName: fileName, extension: '.webp', size: bytes.length, createdAt: new Date().toISOString(), claimedBy: null };
    await copyFile(source, filePathFor(meta));
    await storage().put(storedFileName(id, '.webp'), filePathFor(meta), 'image/webp');
    await writeMeta(meta);
    variantImages.push({ color: job.color, ...(job.size ? { size: job.size } : {}), image: { id, url: `/api/uploads/${id}`, fileName } });
  }
  const input = parseProductInput({ ...product, variantImages }, options);
  const primary = variantImages.find(v => v.color === product.colors[0] && (v.size ?? '') === (product.sizes?.[0]?.id ?? ''))?.image;
  await updateProduct(product.id, { ...input, ...(primary ? { image: primary } : {}) });
  console.log(`${product.name}: ${variantImages.length}/${variants.length} variantbilder`);
}
