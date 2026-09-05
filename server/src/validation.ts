import { materialById, qualityById } from './data/materials.ts';
import { QUOTE_LIMITS } from './pricing.ts';
import type { CustomQuoteRequest, CustomerDetails, OrderLine } from './types.ts';
import { productById } from './data/products.ts';

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
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
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

export function parseOrderLines(input: unknown): OrderLine[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError({ lines: 'Varukorgen är tom.' });
  }
  const errors: Record<string, string> = {};
  const lines: OrderLine[] = [];

  input.forEach((entry, index) => {
    const raw = asRecord(entry);
    const product = productById.get(text(raw.productId));
    if (!product) {
      errors[`lines.${index}`] = 'Produkten finns inte.';
      return;
    }
    const quantity = Math.round(num(raw.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      errors[`lines.${index}.quantity`] = 'Antal måste vara mellan 1 och 99.';
      return;
    }
    const color = text(raw.color) || product.colors[0]!;
    if (!product.colors.includes(color)) {
      errors[`lines.${index}.color`] = 'Ogiltig färg för produkten.';
      return;
    }
    const sizeId = text(raw.size);
    let size: string | undefined;
    let priceDelta = 0;
    if (product.sizes && product.sizes.length > 0) {
      const match = product.sizes.find((s) => s.id === sizeId) ?? product.sizes[0]!;
      size = match.id;
      priceDelta = match.priceDelta;
    } else if (sizeId) {
      errors[`lines.${index}.size`] = 'Produkten har inga storleksval.';
      return;
    }

    // Priset hämtas alltid från katalogen, aldrig från klienten.
    lines.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price + priceDelta,
      color,
      size,
    });
  });

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return lines;
}

export function parseQuoteRequest(input: unknown): CustomQuoteRequest {
  const raw = asRecord(input);
  const errors: Record<string, string> = {};

  const material = text(raw.material);
  const quality = text(raw.quality);
  const volumeCm3 = num(raw.volumeCm3);
  const infill = num(raw.infill);
  const quantity = Math.round(num(raw.quantity));

  if (!materialById.has(material as never)) errors.material = 'Välj ett material.';
  if (!qualityById.has(quality as never)) errors.quality = 'Välj en utskriftskvalitet.';
  const v = QUOTE_LIMITS.volumeCm3;
  if (!(volumeCm3 >= v.min && volumeCm3 <= v.max)) {
    errors.volumeCm3 = `Volymen ska vara mellan ${v.min} och ${v.max} cm³.`;
  }
  const i = QUOTE_LIMITS.infill;
  if (!(infill >= i.min && infill <= i.max)) {
    errors.infill = `Fyllnadsgraden ska vara mellan ${i.min} och ${i.max} %.`;
  }
  const q = QUOTE_LIMITS.quantity;
  if (!(quantity >= q.min && quantity <= q.max)) {
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
