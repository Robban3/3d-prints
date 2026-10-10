import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  describeValues,
  dimensionsFor,
  isParametric,
  normalizeValues,
  parameterPrice,
  priceFor,
  printTimeFor,
  snap,
} from '../src/parameters.ts';
import type { Product, ProductParameter } from '../src/types.ts';

const width: ProductParameter = {
  id: 'bredd',
  name: 'Bredd',
  unit: 'mm',
  min: 240,
  max: 600,
  step: 20,
  default: 320,
  pricePerUnit: 1.2,
  axis: 'width',
};

const depth: ProductParameter = {
  id: 'djup',
  name: 'Djup',
  unit: 'mm',
  min: 80,
  max: 160,
  step: 10,
  default: 110,
  pricePerUnit: 2,
  axis: 'depth',
};

const product: Product = {
  id: 'p-100',
  slug: 'testhylla',
  name: 'Testhylla',
  tagline: 'En hylla för testerna',
  description: 'En hylla som används i testerna.',
  category: 'tillbehor',
  price: 400,
  material: 'pla',
  finish: 'Matte',
  printTimeHours: 8,
  dimensions: { width: 320, depth: 110, height: 60 },
  weightGrams: 300,
  colors: ['Grafit'],
  highlights: [],
  stock: 5,
  rating: 0,
  reviewCount: 0,
  featured: false,
  art: { shape: 'spiceShelf', tone: 'stal' },
  parameters: [width, depth],
};

const plain: Product = { ...product, parameters: undefined };

describe('snap', () => {
  it('avrundar till närmaste steg', () => {
    assert.equal(snap(width, 331), 340);
    assert.equal(snap(width, 329), 320);
  });

  it('håller värdet inom spannet', () => {
    assert.equal(snap(width, 50), 240);
    assert.equal(snap(width, 9000), 600);
  });

  it('går aldrig förbi taket på grund av steget', () => {
    // 240 + 18 steg om 20 är 600, men ett halvt steg till får inte ge 620.
    assert.equal(snap(width, 599), 600);
    assert.ok(snap(width, 600) <= width.max);
  });

  it('faller tillbaka på grundvärdet för skräp', () => {
    assert.equal(snap(width, 'bred'), 320);
    assert.equal(snap(width, undefined), 320);
    assert.equal(snap(width, Number.NaN), 320);
  });

  it('tar emot värden som strängar, vilket är vad formulär skickar', () => {
    assert.equal(snap(width, '360'), 360);
  });

  it('ger inga flyttalssvansar', () => {
    const fine: ProductParameter = { ...width, min: 0, step: 0.1, default: 1 };
    assert.equal(snap(fine, 2.3), 2.3);
  });
});

describe('normalizeValues', () => {
  it('fyller i grundvärden för det kunden inte satt', () => {
    assert.deepEqual(normalizeValues(product.parameters, { bredd: 400 }), {
      bredd: 400,
      djup: 110,
    });
  });

  it('kastar bort värden som inte hör till produkten', () => {
    const values = normalizeValues(product.parameters, { bredd: 400, hojd: 999 });
    assert.deepEqual(Object.keys(values).sort(), ['bredd', 'djup']);
  });

  it('svarar med ett tomt objekt för en produkt utan parametrar', () => {
    assert.deepEqual(normalizeValues(undefined, { bredd: 400 }), {});
    assert.deepEqual(normalizeValues([], { bredd: 400 }), {});
  });

  it('tål att få något som inte är ett objekt', () => {
    assert.deepEqual(normalizeValues(product.parameters, null), { bredd: 320, djup: 110 });
    assert.deepEqual(normalizeValues(product.parameters, 'bredd'), { bredd: 320, djup: 110 });
  });
});

describe('pris', () => {
  it('kostar inget extra på grundmåtten', () => {
    assert.equal(parameterPrice(product.parameters, { bredd: 320, djup: 110 }), 0);
    assert.equal(priceFor(product, { bredd: 320, djup: 110 }), 400);
  });

  it('lägger på för ett större mått', () => {
    // 80 mm bredare × 1,20 kr = 96 kr
    assert.equal(parameterPrice(product.parameters, { bredd: 400, djup: 110 }), 96);
    assert.equal(priceFor(product, { bredd: 400, djup: 110 }), 496);
  });

  it('drar av för ett mindre mått', () => {
    assert.equal(parameterPrice(product.parameters, { bredd: 240, djup: 110 }), -96);
    assert.equal(priceFor(product, { bredd: 240, djup: 110 }), 304);
  });

  it('summerar flera mått', () => {
    // 80 mm bredare (96 kr) och 50 mm djupare (100 kr)
    assert.equal(parameterPrice(product.parameters, { bredd: 400, djup: 160 }), 196);
  });

  it('räknar i hela kronor', () => {
    assert.ok(Number.isInteger(parameterPrice(product.parameters, { bredd: 340, djup: 115 })));
  });

  it('går aldrig under noll', () => {
    const cheap: Product = { ...product, price: 10 };
    assert.equal(priceFor(cheap, { bredd: 240, djup: 80 }), 0);
  });

  it('lämnar produkter utan parametrar i fred', () => {
    assert.equal(parameterPrice(plain.parameters, {}), 0);
    assert.equal(priceFor(plain, {}), 400);
  });

  it('använder grundvärdet för ett mått som saknas i valet', () => {
    assert.equal(parameterPrice(product.parameters, { bredd: 400 }), 96);
  });
});

describe('dimensionsFor', () => {
  it('skriver in de valda måtten på rätt axel', () => {
    assert.deepEqual(dimensionsFor(product, { bredd: 480, djup: 140 }), {
      width: 480,
      depth: 140,
      height: 60,
    });
  });

  it('rör inte mått som ingen parameter styr', () => {
    assert.equal(dimensionsFor(product, { bredd: 480, djup: 140 }).height, 60);
  });

  it('hoppar över parametrar utan axel', () => {
    const extra: Product = {
      ...product,
      parameters: [{ ...width, axis: undefined }],
    };
    assert.deepEqual(dimensionsFor(extra, { bredd: 600 }), product.dimensions);
  });

  it('ger produktens egna mått när parametrar saknas', () => {
    assert.deepEqual(dimensionsFor(plain, {}), product.dimensions);
  });
});

describe('printTimeFor', () => {
  it('skalar tiden mot hur mycket större delen blivit', () => {
    // Priset går från 400 till 496, alltså 1,24 gånger: 8 h blir 9,9 h.
    assert.equal(printTimeFor(product, { bredd: 400, djup: 110 }), 9.9);
  });

  it('kortar tiden för en mindre del', () => {
    assert.ok(printTimeFor(product, { bredd: 240, djup: 80 }) < 8);
  });

  it('håller grundtiden på grundmåtten', () => {
    assert.equal(printTimeFor(product, { bredd: 320, djup: 110 }), 8);
  });

  it('går aldrig under en halvtimme', () => {
    const cheap: Product = { ...product, price: 10, printTimeHours: 1 };
    assert.ok(printTimeFor(cheap, { bredd: 240, djup: 80 }) >= 0.5);
  });

  it('lämnar produkter utan parametrar i fred', () => {
    assert.equal(printTimeFor(plain, {}), 8);
  });
});

describe('describeValues', () => {
  it('skriver måtten i klartext', () => {
    assert.equal(
      describeValues(product.parameters, { bredd: 400, djup: 140 }),
      'Bredd 400 mm · Djup 140 mm',
    );
  });

  it('använder grundvärdet för det som saknas', () => {
    assert.equal(describeValues(product.parameters, {}), 'Bredd 320 mm · Djup 110 mm');
  });

  it('svarar med tom sträng för produkter utan parametrar', () => {
    assert.equal(describeValues(undefined, {}), '');
    assert.equal(describeValues([], {}), '');
  });
});

describe('isParametric', () => {
  it('skiljer produkter med valbara mått från övriga', () => {
    assert.equal(isParametric(product), true);
    assert.equal(isParametric(plain), false);
    assert.equal(isParametric({ ...product, parameters: [] }), false);
  });
});
