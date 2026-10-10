import { describe, expect, it } from 'vitest';
import { MeshError, isPreviewable, parseMesh } from '../src/lib/mesh';

/* ---------- Testmodeller byggda i minnet ---------- */

const corners: Array<[number, number, number]> = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 10, 0],
  [0, 10, 0],
  [0, 0, 10],
  [10, 0, 10],
  [10, 10, 10],
  [0, 10, 10],
];

/** En kub på 10 mm med utåtvända normaler: tolv trianglar. */
const cubeFaces = [
  [0, 2, 1],
  [0, 3, 2],
  [4, 5, 6],
  [4, 6, 7],
  [0, 1, 5],
  [0, 5, 4],
  [2, 3, 7],
  [2, 7, 6],
  [0, 4, 7],
  [0, 7, 3],
  [1, 2, 6],
  [1, 6, 5],
];

const cubeQuads = [
  [0, 3, 2, 1],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [0, 4, 7, 3],
  [1, 2, 6, 5],
];

function triangles(faces: number[][]): Array<[number, number, number][]> {
  const out: Array<[number, number, number][]> = [];
  for (const face of faces) {
    for (let i = 1; i + 1 < face.length; i += 1) {
      out.push([corners[face[0]!]!, corners[face[i]!]!, corners[face[i + 1]!]!]);
    }
  }
  return out;
}

function binaryStl(faces = cubeFaces): ArrayBuffer {
  const list = triangles(faces);
  const buffer = new ArrayBuffer(84 + list.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, list.length, true);
  list.forEach((triangle, index) => {
    let offset = 84 + index * 50 + 12;
    for (const vertex of triangle) {
      for (const value of vertex) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
  });
  return buffer;
}

function text(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

function asciiStl(): ArrayBuffer {
  const rows = ['solid kub'];
  for (const triangle of triangles(cubeFaces)) {
    rows.push('facet normal 0 0 0', 'outer loop');
    for (const [x, y, z] of triangle) rows.push(`vertex ${x} ${y} ${z}`);
    rows.push('endloop', 'endfacet');
  }
  rows.push('endsolid kub');
  return text(rows.join('\n'));
}

function objFile(): ArrayBuffer {
  const rows = corners.map(([x, y, z]) => `v ${x} ${y} ${z}`);
  rows.push(...cubeQuads.map((face) => `f ${face.map((i) => i + 1).join(' ')}`));
  return text(rows.join('\n'));
}

function modelXml(unit = 'millimeter', transform?: string): string {
  const vertices = corners.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('');
  const faces = cubeFaces.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('');
  const item = transform ? `<item objectid="1" transform="${transform}"/>` : '<item objectid="1"/>';
  return `<?xml version="1.0"?><model unit="${unit}"><resources><object id="1" type="model"><mesh><vertices>${vertices}</vertices><triangles>${faces}</triangles></mesh></object></resources><build>${item}</build></model>`;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Skriver en riktig zip. Kontrollsumman lämnas som noll – läsaren bryr sig inte
 * om den, och poängen här är att zip-strukturen ska tolkas rätt.
 */
async function threeMf(xml: string, compress = true): Promise<ArrayBuffer> {
  const name = new TextEncoder().encode('3D/3dmodel.model');
  const raw = new TextEncoder().encode(xml);
  const payload = compress ? await deflateRaw(raw) : raw;
  const method = compress ? 8 : 0;

  const local = new Uint8Array(30 + name.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(8, method, true);
  localView.setUint32(18, payload.length, true);
  localView.setUint32(22, raw.length, true);
  localView.setUint16(26, name.length, true);
  local.set(name, 30);

  const central = new Uint8Array(46 + name.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(10, method, true);
  centralView.setUint32(20, payload.length, true);
  centralView.setUint32(24, raw.length, true);
  centralView.setUint16(28, name.length, true);
  centralView.setUint32(42, 0, true);
  central.set(name, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, local.length + payload.length, true);

  const blob = new Blob([
    local as BlobPart,
    payload as BlobPart,
    central as BlobPart,
    end as BlobPart,
  ]);
  return blob.arrayBuffer();
}

/* ---------- Testerna ---------- */

describe('isPreviewable', () => {
  it('känner igen formaten vi kan rita', () => {
    expect(isPreviewable('del.stl')).toBe(true);
    expect(isPreviewable('DEL.STL')).toBe(true);
    expect(isPreviewable('del.obj')).toBe(true);
    expect(isPreviewable('del.3mf')).toBe(true);
  });

  it('säger nej till CAD-format', () => {
    expect(isPreviewable('del.step')).toBe(false);
    expect(isPreviewable('del.f3d')).toBe(false);
    expect(isPreviewable('del')).toBe(false);
  });
});

describe('parseMesh', () => {
  it('läser en binär STL', async () => {
    const mesh = await parseMesh(binaryStl(), 'kub.stl');
    expect(mesh.triangles).toBe(12);
    expect(mesh.positions).toHaveLength(12 * 9);
    expect(mesh.normals).toHaveLength(12 * 9);
    expect(mesh.extent).toBe(10);
    expect(mesh.center).toEqual([5, 5, 5]);
  });

  it('läser en ASCII-STL likadant', async () => {
    const mesh = await parseMesh(asciiStl(), 'kub.stl');
    expect(mesh.triangles).toBe(12);
    expect(mesh.extent).toBe(10);
    expect(mesh.center).toEqual([5, 5, 5]);
  });

  it('räknar ut normaler som pekar utåt', async () => {
    const mesh = await parseMesh(binaryStl(), 'kub.stl');
    // Första triangeln är kubens botten, så normalen ska peka rakt nedåt.
    expect(mesh.normals[0]).toBeCloseTo(0, 5);
    expect(mesh.normals[1]).toBeCloseTo(0, 5);
    expect(mesh.normals[2]).toBeCloseTo(-1, 5);
  });

  it('trianglerar fyrhörningar i en OBJ', async () => {
    const mesh = await parseMesh(objFile(), 'kub.obj');
    expect(mesh.triangles).toBe(12);
    expect(mesh.extent).toBe(10);
  });

  it('packar upp och läser en 3MF', async () => {
    const mesh = await parseMesh(await threeMf(modelXml()), 'kub.3mf');
    expect(mesh.triangles).toBe(12);
    expect(mesh.extent).toBe(10);
  });

  it('läser en 3MF som ligger opackad i zipen', async () => {
    const mesh = await parseMesh(await threeMf(modelXml(), false), 'kub.3mf');
    expect(mesh.triangles).toBe(12);
  });

  it('räknar om från filens enhet', async () => {
    const mesh = await parseMesh(await threeMf(modelXml('centimeter')), 'kub.3mf');
    expect(mesh.extent).toBe(100);
  });

  it('följer bygglistans skalning', async () => {
    const mesh = await parseMesh(
      await threeMf(modelXml('millimeter', '2 0 0 0 2 0 0 0 2 0 0 0')),
      'kub.3mf',
    );
    expect(mesh.extent).toBe(20);
  });

  it('avvisar en tom fil', async () => {
    await expect(parseMesh(new ArrayBuffer(0), 'kub.stl')).rejects.toThrow(MeshError);
  });

  it('avvisar ett format vi inte ritar', async () => {
    await expect(parseMesh(binaryStl(), 'kub.step')).rejects.toThrow(/går inte att förhandsvisa/);
  });

  it('avvisar skräp som påstår sig vara STL', async () => {
    await expect(parseMesh(text('inte en modell'), 'kub.stl')).rejects.toThrow(MeshError);
  });

  it('avvisar en 3MF utan modellfil', async () => {
    await expect(parseMesh(text('inte en zip'), 'kub.3mf')).rejects.toThrow(MeshError);
  });
});
