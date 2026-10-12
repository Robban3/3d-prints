import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  BUILD_PLATE,
  ModelParseError,
  WATERTIGHT_MAX_TRIANGLES,
  analyzeModel,
  isAnalyzableExtension,
} from '../src/modelAnalysis.ts';
import {
  asciiStl,
  binaryStl,
  box,
  flipped,
  flyttad,
  objFile,
  quadBox,
  tetrahedron,
  threeMf,
  threeMfModelXml,
  withoutFaces,
  zip,
} from './support/mesh.ts';

function codes(analysis: { warnings: Array<{ code: string }> }): string[] {
  return analysis.warnings.map((warning) => warning.code);
}

describe('format', () => {
  it('känner igen formaten som går att mäta upp', () => {
    assert.ok(isAnalyzableExtension('.stl'));
    assert.ok(isAnalyzableExtension('.STL'));
    assert.ok(isAnalyzableExtension('.obj'));
    assert.ok(isAnalyzableExtension('.3mf'));
  });

  it('säger nej till CAD-format utan färdig mesh', () => {
    assert.equal(isAnalyzableExtension('.step'), false);
    assert.equal(isAnalyzableExtension('.stp'), false);
    assert.equal(isAnalyzableExtension('.f3d'), false);
    assert.equal(isAnalyzableExtension('.png'), false);
  });
});

describe('binär STL', () => {
  it('mäter upp en kub på 10 mm till 1 cm³', () => {
    const analysis = analyzeModel(binaryStl(box(10, 10, 10)), '.stl');
    assert.equal(analysis.format, 'stl');
    assert.equal(analysis.volumeCm3, 1);
    assert.equal(analysis.surfaceAreaCm2, 6);
    assert.deepEqual(analysis.bounds, { width: 10, depth: 10, height: 10 });
    assert.equal(analysis.triangles, 12);
    assert.equal(analysis.openEdges, 0);
    assert.equal(analysis.watertight, true);
    assert.equal(analysis.invertedNormals, false);
    assert.equal(analysis.fitsBuildPlate, true);
    assert.deepEqual(analysis.warnings, []);
  });

  it('mäter en låda med olika sidor rätt', () => {
    const analysis = analyzeModel(binaryStl(box(40, 25, 12)), '.stl');
    assert.equal(analysis.volumeCm3, 12);
    assert.deepEqual(analysis.bounds, { width: 40, depth: 25, height: 12 });
    // 2(40·25 + 40·12 + 25·12) = 3560 mm² = 35.6 cm²
    assert.equal(analysis.surfaceAreaCm2, 35.6);
  });

  it('ger samma volym var modellen än ligger i rymden', () => {
    const vidOrigo = analyzeModel(binaryStl(box(20, 20, 20)), '.stl');
    const langtBort = analyzeModel(binaryStl(flyttad(box(20, 20, 20), 900, -400, 1500)), '.stl');
    assert.equal(vidOrigo.volumeCm3, 8);
    assert.equal(langtBort.volumeCm3, 8);
    assert.deepEqual(langtBort.bounds, vidOrigo.bounds);
  });

  it('räknar en tetraeder till a·b·c/6', () => {
    // 30·20·10/6 = 1000 mm³ = 1 cm³
    const analysis = analyzeModel(binaryStl(tetrahedron(30, 20, 10)), '.stl');
    assert.equal(analysis.volumeCm3, 1);
    assert.equal(analysis.triangles, 4);
    assert.equal(analysis.watertight, true);
  });

  it('läser en fil vars rubrik börjar på solid', () => {
    const analysis = analyzeModel(binaryStl(box(10, 10, 10), 'solid exporterad av CAD'), '.stl');
    assert.equal(analysis.volumeCm3, 1);
  });
});

describe('ASCII-STL', () => {
  it('ger samma mått som den binära motsvarigheten', () => {
    const analysis = analyzeModel(asciiStl(box(10, 20, 30)), '.stl');
    assert.equal(analysis.volumeCm3, 6);
    assert.deepEqual(analysis.bounds, { width: 10, depth: 20, height: 30 });
    assert.equal(analysis.triangles, 12);
    assert.equal(analysis.watertight, true);
  });

  it('klarar exponentform och negativa koordinater', () => {
    const text = `solid e
  facet normal 0 0 0
    outer loop
      vertex 0 0 0
      vertex 1.0e1 0 0
      vertex 0 1e+1 0
    endloop
  endfacet
endsolid e
`;
    const analysis = analyzeModel(Buffer.from(text, 'utf8'), '.stl');
    assert.equal(analysis.triangles, 1);
    assert.deepEqual(analysis.bounds, { width: 10, depth: 10, height: 0 });
  });
});

describe('OBJ', () => {
  it('trianglerar fyrhörningar och mäter volymen', () => {
    const analysis = analyzeModel(objFile(quadBox(10, 10, 10)), '.obj');
    assert.equal(analysis.format, 'obj');
    assert.equal(analysis.volumeCm3, 1);
    assert.equal(analysis.triangles, 12);
    assert.equal(analysis.watertight, true);
  });

  it('förstår hörnindex som räknas bakifrån', () => {
    const text = `v 0 0 0
v 10 0 0
v 0 10 0
f -3 -1 -2
`;
    const analysis = analyzeModel(Buffer.from(text, 'utf8'), '.obj');
    assert.equal(analysis.triangles, 1);
    assert.deepEqual(analysis.bounds, { width: 10, depth: 10, height: 0 });
  });

  it('hoppar över index som pekar utanför hörnlistan', () => {
    const text = `v 0 0 0
v 10 0 0
v 0 10 0
f 1 2 3
f 1 2 99
`;
    const analysis = analyzeModel(Buffer.from(text, 'utf8'), '.obj');
    assert.equal(analysis.triangles, 1);
  });

  it('ignorerar textur- och normalindex i f-raderna', () => {
    const text = `v 0 0 0
v 10 0 0
v 0 10 0
vt 0 0
vn 0 0 1
f 1/1/1 2/1/1 3/1/1
`;
    const analysis = analyzeModel(Buffer.from(text, 'utf8'), '.obj');
    assert.equal(analysis.triangles, 1);
  });
});

describe('3MF', () => {
  it('packar upp zipen och mäter modellen', () => {
    const analysis = analyzeModel(threeMf(box(10, 10, 10)), '.3mf');
    assert.equal(analysis.format, '3mf');
    assert.equal(analysis.volumeCm3, 1);
    assert.equal(analysis.triangles, 12);
    assert.equal(analysis.watertight, true);
  });

  it('läser även en post som ligger opackad i zipen', () => {
    const analysis = analyzeModel(threeMf(box(10, 10, 10), { stored: true }), '.3mf');
    assert.equal(analysis.volumeCm3, 1);
  });

  it('räknar om från filens enhet till millimeter', () => {
    const analysis = analyzeModel(threeMf(box(1, 1, 1), { unit: 'centimeter' }), '.3mf');
    assert.deepEqual(analysis.bounds, { width: 10, depth: 10, height: 10 });
    assert.equal(analysis.volumeCm3, 1);
  });

  it('räknar om tum', () => {
    const analysis = analyzeModel(threeMf(box(1, 1, 1), { unit: 'inch' }), '.3mf');
    assert.deepEqual(analysis.bounds, { width: 25.4, depth: 25.4, height: 25.4 });
  });

  it('följer skalningen i bygglistan', () => {
    const analysis = analyzeModel(
      threeMf(box(10, 10, 10), { transform: [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0] }),
      '.3mf',
    );
    assert.deepEqual(analysis.bounds, { width: 20, depth: 20, height: 20 });
    assert.equal(analysis.volumeCm3, 8);
  });

  it('följer förflyttningen i bygglistan utan att ändra volymen', () => {
    const analysis = analyzeModel(
      threeMf(box(10, 10, 10), { transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 120, 120, 5] }),
      '.3mf',
    );
    assert.equal(analysis.volumeCm3, 1);
    assert.deepEqual(analysis.bounds, { width: 10, depth: 10, height: 10 });
  });

  it('lägger ihop komponentens och postens transformer', () => {
    const analysis = analyzeModel(
      threeMf(box(10, 10, 10), {
        componentTransform: [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
        transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 100, 0, 0],
      }),
      '.3mf',
    );
    assert.deepEqual(analysis.bounds, { width: 20, depth: 20, height: 20 });
    assert.equal(analysis.volumeCm3, 8);
  });

  it('summerar volymen när samma del byggs flera gånger och säger till', () => {
    const analysis = analyzeModel(threeMf(box(10, 10, 10), { items: 3 }), '.3mf');
    assert.equal(analysis.volumeCm3, 3);
    assert.deepEqual(codes(analysis), ['flera-delar']);
    assert.match(analysis.warnings[0]!.message, /3 separata delar/);
  });

  it('mäter objekten även när bygglistan saknas', () => {
    const xml = threeMfModelXml(box(10, 10, 10)).replace(/<build>[\s\S]*?<\/build>/, '');
    const file = zip([{ name: '3D/3dmodel.model', data: Buffer.from(xml, 'utf8') }]);
    assert.equal(analyzeModel(file, '.3mf').volumeCm3, 1);
  });

  it('avvisar en zip utan modellfil', () => {
    const file = zip([{ name: 'readme.txt', data: Buffer.from('hej', 'utf8') }]);
    assert.throws(() => analyzeModel(file, '.3mf'), {
      name: 'ModelParseError',
      message: /ingen modellfil/,
    });
  });

  it('avvisar en fil som inte är en zip', () => {
    assert.throws(() => analyzeModel(Buffer.from('inte en zip alls', 'utf8'), '.3mf'), {
      name: 'ModelParseError',
    });
  });
});

describe('varningar', () => {
  it('flaggar en modell som inte får plats på byggplattan', () => {
    const over = BUILD_PLATE.width + 40;
    const analysis = analyzeModel(binaryStl(box(over, 10, 10)), '.stl');
    assert.equal(analysis.fitsBuildPlate, false);
    assert.ok(codes(analysis).includes('for-stor'));
    const warning = analysis.warnings.find((entry) => entry.code === 'for-stor')!;
    assert.equal(warning.severity, 'error');
    assert.match(warning.message, /bredden/);
    assert.doesNotMatch(warning.message, /djupet/);
  });

  it('nämner varje mått som går utanför', () => {
    const over = Math.max(BUILD_PLATE.width, BUILD_PLATE.depth, BUILD_PLATE.height) + 10;
    const analysis = analyzeModel(binaryStl(box(over, over, over)), '.stl');
    const warning = analysis.warnings.find((entry) => entry.code === 'for-stor')!;
    assert.match(warning.message, /bredden/);
    assert.match(warning.message, /djupet/);
    assert.match(warning.message, /höjden/);
  });

  it('flaggar hål i meshen och räknar de öppna kanterna', () => {
    // En saknad sida är två trianglar och lämnar fyra kanter öppna.
    const analysis = analyzeModel(binaryStl(withoutFaces(box(10, 10, 10), 2)), '.stl');
    assert.equal(analysis.openEdges, 4);
    assert.equal(analysis.watertight, false);
    assert.ok(codes(analysis).includes('inte-tat'));
    assert.match(analysis.warnings.find((e) => e.code === 'inte-tat')!.message, /4 öppna kanter/);
  });

  it('flaggar inverterade normaler men behåller volymen', () => {
    const analysis = analyzeModel(binaryStl(flipped(box(10, 10, 10))), '.stl');
    assert.equal(analysis.volumeCm3, 1);
    assert.equal(analysis.invertedNormals, true);
    assert.equal(analysis.watertight, true);
    const warning = analysis.warnings.find((entry) => entry.code === 'inverterade-normaler')!;
    assert.equal(warning.severity, 'info');
  });

  it('skiljer dubblerad geometri från hål i ytan', () => {
    // Samma kub två gånger i samma mesh: inga hål, men varje kant delas av fyra
    // trianglar i stället för två.
    const cube = box(10, 10, 10);
    const doubled = { vertices: cube.vertices, faces: [...cube.faces, ...cube.faces] };
    const analysis = analyzeModel(binaryStl(doubled), '.stl');
    assert.equal(analysis.openEdges, 0);
    assert.equal(analysis.nonManifoldEdges, 18);
    assert.equal(analysis.watertight, false);
    assert.deepEqual(codes(analysis), ['icke-manifold']);
    assert.match(analysis.warnings[0]!.message, /18 kanter/);
  });

  it('hoppar över täthetskontrollen för mycket tunga meshar', () => {
    // Kantbokföringen kostar minne per kant, så över gränsen rapporteras måtten
    // men inte tätheten. Trianglarna bildar en trappa så måtten blir rimliga.
    const count = WATERTIGHT_MAX_TRIANGLES + 1;
    const buffer = Buffer.alloc(84 + count * 50);
    buffer.writeUInt32LE(count, 80);
    for (let i = 0; i < count; i += 1) {
      const base = 84 + i * 50 + 12;
      const z = (i % 100) * 0.1;
      buffer.writeFloatLE(0, base);
      buffer.writeFloatLE(0, base + 4);
      buffer.writeFloatLE(z, base + 8);
      buffer.writeFloatLE(10, base + 12);
      buffer.writeFloatLE(0, base + 16);
      buffer.writeFloatLE(z, base + 20);
      buffer.writeFloatLE(0, base + 24);
      buffer.writeFloatLE(10, base + 28);
      buffer.writeFloatLE(z, base + 32);
    }
    const analysis = analyzeModel(buffer, '.stl');
    assert.equal(analysis.triangles, count);
    assert.equal(analysis.openEdges, null);
    assert.equal(analysis.nonManifoldEdges, null);
    assert.equal(analysis.watertight, null);
    // Vi får inte påstå något om tätheten när vi inte har mätt den.
    assert.equal(codes(analysis).includes('inte-tat'), false);
    assert.equal(codes(analysis).includes('icke-manifold'), false);
  });

  it('varnar för en modell som verkar exporterad i fel enhet', () => {
    const analysis = analyzeModel(binaryStl(box(0.4, 0.4, 0.4)), '.stl');
    assert.deepEqual(codes(analysis), ['misstankt-liten']);
    assert.match(analysis.warnings[0]!.message, /millimeter/);
    // Volymen får inte avrundas bort – 0.4³ mm³ är 0.000064 cm³.
    assert.equal(analysis.volumeCm3, 0.000064);
  });

  it('flaggar lösa ytor utan mätbar volym', () => {
    // En enda triangel har ingen kropp.
    const flat = { vertices: box(10, 10, 10).vertices, faces: [[0, 1, 2]] };
    const analysis = analyzeModel(binaryStl(flat), '.stl');
    assert.equal(analysis.volumeCm3, 0);
    const warning = analysis.warnings.find((entry) => entry.code === 'tom-volym')!;
    assert.equal(warning.severity, 'error');
  });
});

describe('trasiga filer', () => {
  it('avvisar en tom fil', () => {
    assert.throws(() => analyzeModel(Buffer.alloc(0), '.stl'), {
      name: 'ModelParseError',
      message: /tom/,
    });
  });

  it('avvisar skräp som påstår sig vara STL', () => {
    assert.throws(() => analyzeModel(Buffer.from('det här är inte en modell', 'utf8'), '.stl'), {
      name: 'ModelParseError',
      message: /ser inte ut som en STL/,
    });
  });

  it('avvisar en STL utan trianglar', () => {
    const empty = Buffer.alloc(84);
    empty.write('solid tom', 0, 'latin1');
    empty.writeUInt32LE(0, 80);
    assert.throws(() => analyzeModel(empty, '.stl'), { message: /ingen geometri/ });
  });

  it('avvisar en OBJ utan hörn', () => {
    assert.throws(() => analyzeModel(Buffer.from('# bara en kommentar\n', 'utf8'), '.obj'), {
      message: /saknar hörn/,
    });
  });

  it('avvisar format vi inte mäter', () => {
    assert.throws(() => analyzeModel(binaryStl(box(10, 10, 10)), '.step'), {
      name: 'ModelParseError',
      message: /kan vi inte mäta upp/,
    });
  });

  it('är ett eget feltyp så anroparen kan skilja det från en bugg', () => {
    try {
      analyzeModel(Buffer.alloc(0), '.stl');
      assert.fail('skulle ha kastat');
    } catch (error) {
      assert.ok(error instanceof ModelParseError);
      assert.ok(error instanceof Error);
    }
  });
});
