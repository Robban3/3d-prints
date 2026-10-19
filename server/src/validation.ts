import { findMaterial, findQuality } from './catalog.ts';
import { QUOTE_LIMITS } from './pricing.ts';
import type { CustomQuoteRequest, CustomerDetails, OrderLine } from './types.ts';
import { findProduct } from './catalog.ts';
import { productPrice } from './productPrice.ts';
import { productArticle } from './articles.ts';

export class ValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('Valideringen misslyckades');
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec {
  return value && typeof value === 'object' ? (value as Rec) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : Number.NaN;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseCustomer(input: unknown): CustomerDetails {
  const raw = asRecord(input);
  const errors: Record<string, string> = {};

  const name = text(raw.name);
  const email = text(raw.email);
  const address = text(raw.address);
  const postalCode = text(raw.postalCode).replace(/\s+/g, '');
  const city = text(raw.city);

  if (name.length < 2) errors['customer.name'] = 'Ange för- och efternamn.';
  if (!EMAIL.test(email)) errors['customer.email'] = 'Ange en giltig e-postadress.';
  if (address.length < 3) errors['customer.address'] = 'Ange gatuadress.';
  if (!/^\d{5}$/.test(postalCode))
    errors['customer.postalCode'] = 'Postnumret ska vara fem siffror.';
  if (city.length < 2) errors['customer.city'] = 'Ange ort.';

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  return {
    name,
    email,
    phone: text(raw.phone) || undefined,
    address,
    postalCode,
    city,
    note: text(raw.note).slice(0, 1000) || undefined,
  };
}

export async function parseOrderLines(input: unknown): Promise<OrderLine[]> {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError({ lines: 'Varukorgen är tom.' });
  }
  const errors: Record<string, string> = {};
  const lines: OrderLine[] = [];

  for (const [index, entry] of input.entries()) {
    const raw = asRecord(entry);
    const product = await findProduct(text(raw.productId));
    if (!product || product.published === false) {
      errors[`lines.${index}`] = 'Produkten finns inte.';
      continue;
    }
    const quantity = num(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      errors[`lines.${index}.quantity`] = 'Antal måste vara mellan 1 och 99.';
      continue;
    }
    const color = text(raw.color) || product.colors[0]!;
    if (!product.colors.includes(color)) {
      errors[`lines.${index}.color`] = 'Ogiltig färg för produkten.';
      continue;
    }
    const sizeId = text(raw.size);
    let size: string | undefined;
    let priceDelta = 0;
    if (product.sizes && product.sizes.length > 0) {
      const match = sizeId ? product.sizes.find((s) => s.id === sizeId) : product.sizes[0];
      if (!match) { errors[`lines.${index}.size`] = 'Ogiltig storlek för produkten.'; continue; }
      size = match.id;
      priceDelta = match.priceDelta;
    } else if (sizeId) {
      errors[`lines.${index}.size`] = 'Produkten har inga storleksval.';
      continue;
    }

    let personalization: string | undefined;
    if (product.slug === 'namnornament') {
      personalization = text(raw.personalization).normalize('NFC').replace(/\s+/g, ' ');
      if (!personalization || personalization.length > 24 || !/^\p{L}[\p{L}\p{M}]*(?:[ '\u2019-]\p{L}[\p{L}\p{M}]*)*$/u.test(personalization)) {
        errors[`lines.${index}.personalization`] = 'Ange namn på ornamentet: 1–24 tecken, med bokstäver, mellanslag, bindestreck eller apostrof.';
        continue;
      }
    }
    if (product.slug === 'var-forsta-jul') {
      personalization = (raw.personalization === undefined ? 'Vår första / jul' : text(raw.personalization)).normalize('NFC').replace(/\s+/g, ' ');
      const messageLines = personalization.split(' / ');
      if (messageLines.length !== 2 || messageLines.some(line => !line.trim() || line.trim().length > 24 || !/^[\p{L}\p{M}\p{N} &'’.,!?-]+$/u.test(line))) {
        errors[`lines.${index}.personalization`] = 'Ange två textrader med högst 24 tecken per rad, avskilda med /.';
        continue;
      }
    }
    // Priset hämtas alltid från katalogen, aldrig från klienten.
    lines.push({
      articleNumber: productArticle(product, color, size),
      productionSpecs: {
        material: [product.material.toUpperCase(), product.finish].filter(Boolean).join(' '),
        dimensions: product.sizes?.find(value => value.id === size)?.dimensions ?? product.dimensions,
        weightGrams: product.sizes?.find(value => value.id === size)?.weightGrams ?? product.weightGrams,
        printTimeHours: product.sizes?.find(value => value.id === size)?.printTimeHours ?? product.printTimeHours,
        estimated: product.productionEstimated !== false || product.dimensionsEstimated === true || product.specificationsPending === true,
      },
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: productPrice(product, priceDelta).price,
      color,
      size,
      ...(personalization ? { personalization } : {}),
    });
  }

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return lines;
}

export async function parseQuoteRequest(input: unknown): Promise<CustomQuoteRequest> {
  const raw = asRecord(input);
  const errors: Record<string, string> = {};

  const material = text(raw.material);
  const quality = text(raw.quality);
  const volumeCm3 = num(raw.volumeCm3);
  const infill = num(raw.infill);
  const quantity = num(raw.quantity);

  if (!(await findMaterial(material))) errors.material = 'Välj ett material.';
  if (!(await findQuality(quality))) errors.quality = 'Välj en utskriftskvalitet.';
  const v = QUOTE_LIMITS.volumeCm3;
  if (!(volumeCm3 >= v.min && volumeCm3 <= v.max)) {
    errors.volumeCm3 = `Volymen ska vara mellan ${v.min} och ${v.max} cm³.`;
  }
  const i = QUOTE_LIMITS.infill;
  if (!(infill >= i.min && infill <= i.max)) {
    errors.infill = `Fyllnadsgraden ska vara mellan ${i.min} och ${i.max} %.`;
  }
  const q = QUOTE_LIMITS.quantity;
  if (!(Number.isInteger(quantity) && quantity >= q.min && quantity <= q.max)) {
    errors.quantity = `Antalet ska vara mellan ${q.min} och ${q.max}.`;
  }

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  return {
    material: material as CustomQuoteRequest['material'],
    quality: quality as CustomQuoteRequest['quality'],
    volumeCm3,
    infill,
    quantity,
    rush: raw.rush === true || raw.rush === 'true',
    postProcessing: raw.postProcessing === true || raw.postProcessing === 'true',
  };
}
