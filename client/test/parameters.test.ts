import { describe, expect, it } from 'vitest';
import {
  defaultValues,
  describeValues,
  dimensionsFor,
  isParametric,
  parameterPrice,
  priceFor,
  printTimeFor,
  snap,
} from '../src/lib/parameters';
import type { Product, ProductParameter } from '../src/types';

/**
 * Siffrorna här är samma som i serverns parameters.test.ts. Glider de två
 * uträkningarna isär ska ett av testerna gå sönder – reglaget på produktsidan
 * får aldrig visa ett annat pris än det ordern landar på.
 */

const width: ProductParameter = {
  id: 'bredd',
  name: 'Bredd',
  unit: 'mm',
  min: 240,
  max: 600,
  step: 20,
  default: 360,
  pricePerUnit: 1.2,
  axis: 'width',
};

const height: ProductParameter = {
  id: 'hojd',
  name: 'Höjd',
  unit: 'mm',
  min: 100,
  max: 180,
  step: 10,
  default: 120,
  pricePerUnit: 0.8,
  axis: 'height',
};

const shelf: Product = {
  id: 'p-014',
  slug: 'shelf-kryddstall',
  name: 'Shelf kryddställ',
  tagline: 'Trappformad hylla',
  description: 'En hylla.',
  category: 'kok',
  price: 359,
  material: 'petg',
  finish: 'Matte',
  printTimeHours: 10,
  dimensions: { width: 360, depth: 130, height: 120 },
  weightGrams: 285,
  colors: ['Benvit'],
  parameters: [width, height],
  highlights: [],
  stock: 19,
  rating: 4.6,
  reviewCount: 26,
  featured: false,
  art: { shape: 'spiceShelf', tone: 'stal' },
};

describe('snap', () => {
  it('avrundar till närmaste steg', () => {
    expect(snap(width, 365)).toBe(360);
    expect(snap(width, 371)).toBe(380);
  });

  it('håller värdet inom spannet', () => {
    expect(snap(width, 10)).toBe(240);
    expect(snap(width, 99999)).toBe(600);
  });

  it('faller tillbaka på grundvärdet när siffran inte går att tolka', () => {
    expect(snap(width, 'bred')).toBe(360);
    expect(snap(width, undefined)).toBe(360);
    expect(snap(width, Number.NaN)).toBe(360);
  });

  it('tar emot en sträng från reglaget', () => {
    expect(snap(width, '420')).toBe(420);
  });
});

describe('pris', () => {
  it('grundmåttet ingår i priset', () => {
    expect(parameterPrice(shelf.parameters, defaultValues(shelf.parameters))).toBe(0);
    expect(priceFor(shelf, defaultValues(shelf.parameters))).toBe(359);
  });

  it('ett större mått kostar mer', () => {
    expect(priceFor(shelf, { bredd: 600, hojd: 120 })).toBe(359 + 288);
  });

  it('ett mindre mått kostar mindre', () => {
    expect(priceFor(shelf, { bredd: 240, hojd: 120 })).toBe(359 - 144);
  });

  it('lägger ihop flera mått', () => {
    expect(priceFor(shelf, { bredd: 400, hojd: 180 })).toBe(359 + 48 + 48);
  });

  it('priset går aldrig under noll', () => {
    const cheap: Product = { ...shelf, price: 10 };
    expect(priceFor(cheap, { bredd: 240, hojd: 100 })).toBe(0);
  });

  it('en produkt utan mått påverkas inte', () => {
    const plain: Product = { ...shelf, parameters: undefined };
    expect(parameterPrice(plain.parameters, {})).toBe(0);
    expect(priceFor(plain, { bredd: 600 })).toBe(359);
  });
});

describe('dimensionsFor', () => {
  it('skriver om måtten efter kundens val', () => {
    expect(dimensionsFor(shelf, { bredd: 500, hojd: 170 })).toEqual({
      width: 500,
      depth: 130,
      height: 170,
    });
  });

  it('lämnar måtten orörda för en produkt utan parametrar', () => {
    const plain: Product = { ...shelf, parameters: undefined };
    expect(dimensionsFor(plain, {})).toEqual(shelf.dimensions);
  });
});

describe('printTimeFor', () => {
  it('skalar tiden mot hur mycket större delen blivit', () => {
    expect(printTimeFor(shelf, { bredd: 600, hojd: 120 })).toBeCloseTo(18, 1);
  });

  it('grundmåttet ger grundtiden', () => {
    expect(printTimeFor(shelf, defaultValues(shelf.parameters))).toBe(10);
  });

  it('aldrig under en halvtimme', () => {
    const cheap: Product = { ...shelf, price: 10 };
    expect(printTimeFor(cheap, { bredd: 240, hojd: 100 })).toBe(0.5);
  });
});

describe('describeValues', () => {
  it('skriver måtten i klartext', () => {
    expect(describeValues(shelf.parameters, { bredd: 400, hojd: 140 })).toBe(
      'Bredd 400 mm · Höjd 140 mm',
    );
  });

  it('ger en tom sträng utan parametrar', () => {
    expect(describeValues(undefined, {})).toBe('');
  });
});

describe('isParametric', () => {
  it('ser skillnad på produkter med och utan mått', () => {
    expect(isParametric(shelf)).toBe(true);
    expect(isParametric({ ...shelf, parameters: undefined })).toBe(false);
    expect(isParametric({ ...shelf, parameters: [] })).toBe(false);
  });
});
