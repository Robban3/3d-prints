import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  ValidationError,
  parseCustomer,
  parseOrderLines,
  parseQuoteRequest,
  withMeasuredVolume,
} from '../src/validation.ts';
import { products } from '../src/data/products.ts';
import { analyzeModel } from '../src/modelAnalysis.ts';
import { binaryStl, box } from './support/mesh.ts';

const validCustomer = {
  name: 'Anna Andersson',
  email: 'anna@example.com',
  address: 'Storgatan 1',
  postalCode: '112 34',
  city: 'Stockholm',
};

describe('parseCustomer', () => {
  it('normaliserar postnummer och behåller uppgifterna', () => {
    const customer = parseCustomer(validCustomer);
    assert.equal(customer.postalCode, '11234');
    assert.equal(customer.name, 'Anna Andersson');
  });

  it('pekar ut felaktiga fält', () => {
    try {
      parseCustomer({
        ...validCustomer,
        email: 'inte-en-mejl',
        postalCode: '12',
      });
      assert.fail('förväntade ValidationError');
    } catch (error) {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.fields['customer.email']);
      assert.ok(error.fields['customer.postalCode']);
    }
  });
});

describe('parseOrderLines', () => {
  const product = products[0]!;

  it('hämtar priset från katalogen och ignorerar klientens pris', async () => {
    const lines = await parseOrderLines([
      {
        productId: product.id,
        quantity: 2,
        color: product.colors[0],
        unitPrice: 1,
      },
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.unitPrice, product.price + product.sizes![0]!.priceDelta);
  });

  it('lägger till storlekstillägg', async () => {
    const large = product.sizes!.at(-1)!;
    const lines = await parseOrderLines([
      {
        productId: product.id,
        quantity: 1,
        color: product.colors[0],
        size: large.id,
      },
    ]);
    assert.equal(lines[0]!.unitPrice, product.price + large.priceDelta);
  });

  it('avvisar tom varukorg', async () => {
    await assert.rejects(() => parseOrderLines([]), ValidationError);
  });

  it('avvisar okänd produkt och ogiltig färg', async () => {
    await assert.rejects(
      () => parseOrderLines([{ productId: 'saknas', quantity: 1 }]),
      ValidationError,
    );
    await assert.rejects(
      () => parseOrderLines([{ productId: product.id, quantity: 1, color: 'Neonrosa' }]),
      ValidationError,
    );
  });

  it('prissätter valbara mått själv och skriver ut dem i klartext', async () => {
    const shelf = products.find((entry) => (entry.parameters?.length ?? 0) > 0)!;
    const width = shelf.parameters![0]!;
    const lines = await parseOrderLines([
      {
        productId: shelf.id,
        quantity: 1,
        color: shelf.colors[0],
        parameters: { [width.id]: width.max },
      },
    ]);
    const expected = Math.round((width.max - width.default) * width.pricePerUnit);
    assert.equal(lines[0]!.unitPrice, shelf.price + expected);
    assert.equal(lines[0]!.parameters?.[width.id], width.max);
    assert.match(lines[0]!.parameterText ?? '', new RegExp(`${width.name} ${width.max}`));
  });

  it('snäpper måtten till spannet och struntar i påhittade mått', async () => {
    const shelf = products.find((entry) => (entry.parameters?.length ?? 0) > 0)!;
    const width = shelf.parameters![0]!;
    const lines = await parseOrderLines([
      {
        productId: shelf.id,
        quantity: 1,
        color: shelf.colors[0],
        parameters: { [width.id]: 99999, pahittat: 12 },
      },
    ]);
    assert.equal(lines[0]!.parameters?.[width.id], width.max);
    assert.equal(lines[0]!.parameters?.pahittat, undefined);
  });

  it('lämnar måtten tomma för en produkt utan valbara mått', async () => {
    const lines = await parseOrderLines([
      { productId: product.id, quantity: 1, color: product.colors[0], parameters: { bredd: 400 } },
    ]);
    assert.equal(lines[0]!.parameterText, undefined);
    assert.equal(lines[0]!.parameters, undefined);
  });

  it('avvisar orimliga antal', async () => {
    await assert.rejects(
      () => parseOrderLines([{ productId: product.id, quantity: 0 }]),
      ValidationError,
    );
    await assert.rejects(
      () => parseOrderLines([{ productId: product.id, quantity: 500 }]),
      ValidationError,
    );
  });
});

describe('parseQuoteRequest', () => {
  const valid = {
    material: 'petg',
    quality: 'fin',
    volumeCm3: 80,
    infill: 30,
    quantity: 3,
    rush: false,
    postProcessing: true,
  };

  it('tar emot en giltig förfrågan', async () => {
    const request = await parseQuoteRequest(valid);
    assert.equal(request.material, 'petg');
    assert.equal(request.postProcessing, true);
  });

  it('avvisar värden utanför gränserna', async () => {
    await assert.rejects(() => parseQuoteRequest({ ...valid, volumeCm3: 99999 }), ValidationError);
    await assert.rejects(() => parseQuoteRequest({ ...valid, infill: 300 }), ValidationError);
    await assert.rejects(() => parseQuoteRequest({ ...valid, material: 'guld' }), ValidationError);
  });
});

describe('withMeasuredVolume', () => {
  const request = {
    material: 'pla',
    quality: 'standard',
    volumeCm3: 40,
    infill: 20,
    quantity: 2,
    rush: false,
    postProcessing: false,
  };

  it('lämnar förfrågan orörd när ingen fil är uppmätt', () => {
    assert.deepEqual(withMeasuredVolume(request, undefined), request);
  });

  it('låter filens volym gå före den som skickats in', () => {
    // En kub på 30 mm är 27 cm³, oavsett vad anropet påstår.
    const analysis = analyzeModel(binaryStl(box(30, 30, 30)), '.stl');
    const result = withMeasuredVolume({ ...request, volumeCm3: 2 }, analysis);
    assert.equal(result.volumeCm3, 27);
    // Resten av valen är kundens och ska inte röras.
    assert.equal(result.infill, 20);
    assert.equal(result.quantity, 2);
    assert.equal(result.material, 'pla');
  });

  it('höjer en mycket liten modell till minimivolymen', () => {
    const analysis = analyzeModel(binaryStl(box(4, 4, 4)), '.stl');
    assert.equal(analysis.volumeCm3, 0.064);
    assert.equal(withMeasuredVolume(request, analysis).volumeCm3, 1);
  });

  it('avvisar en modell som är större än vad vi prissätter automatiskt', () => {
    // 300 mm kub = 27 000 cm³, långt över taket på 8 000.
    const analysis = analyzeModel(binaryStl(box(300, 300, 300)), '.stl');
    assert.throws(
      () => withMeasuredVolume(request, analysis),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.fields.fileId!, /27000 cm³/);
        assert.match(error.fields.fileId!, /för hand/);
        return true;
      },
    );
  });
});
