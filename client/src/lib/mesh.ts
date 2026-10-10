/**
 * Läser en modellfil i webbläsaren till trianglar som går att rita.
 *
 * Servern gör sin egen, noggrannare uppmätning – den är källan för volym och
 * pris. Den här parsern har ett annat jobb: få fram hörnen snabbt så att kunden
 * ser sin modell direkt, utan att filen behöver laddas ner igen.
 */

const PREVIEWABLE = ['.stl', '.obj', '.3mf'];

/** Över den här gränsen visar vi inga trianglar – då är filen för tung för en förhandsvisning. */
const MAX_TRIANGLES = 2_000_000;

export function isPreviewable(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return PREVIEWABLE.some((extension) => lower.endsWith(extension));
}

export interface PreviewMesh {
  /** Tre hörn per triangel, nio tal i rad. */
  positions: Float32Array;
  /** En normal per hörn, uträknad per triangel. */
  normals: Float32Array;
  triangles: number;
  center: [number, number, number];
  /** Längsta sidan i modellens omskrivna låda. */
  extent: number;
}

export class MeshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MeshError';
  }
}

/** Samlar trianglar och räknar ut normaler och omskriven låda på vägen. */
class Builder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private min: [number, number, number] = [Infinity, Infinity, Infinity];
  private max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  count = 0;

  add(a: number[], b: number[], c: number[]): void {
    if (this.count >= MAX_TRIANGLES) return;
    const ux = b[0]! - a[0]!;
    const uy = b[1]! - a[1]!;
    const uz = b[2]! - a[2]!;
    const vx = c[0]! - a[0]!;
    const vy = c[1]! - a[1]!;
    const vz = c[2]! - a[2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length > 0) {
      nx /= length;
      ny /= length;
      nz /= length;
    }

    for (const vertex of [a, b, c]) {
      this.positions.push(vertex[0]!, vertex[1]!, vertex[2]!);
      this.normals.push(nx, ny, nz);
      for (let axis = 0; axis < 3; axis += 1) {
        const value = vertex[axis]!;
        if (value < this.min[axis]!) this.min[axis] = value;
        if (value > this.max[axis]!) this.max[axis] = value;
      }
    }
    this.count += 1;
  }

  finish(): PreviewMesh {
    if (this.count === 0) throw new MeshError('Filen innehåller ingen geometri att visa.');
    const size = [0, 1, 2].map((axis) => this.max[axis]! - this.min[axis]!);
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      triangles: this.count,
      center: [
        (this.min[0]! + this.max[0]!) / 2,
        (this.min[1]! + this.max[1]!) / 2,
        (this.min[2]! + this.max[2]!) / 2,
      ],
      extent: Math.max(...size, 0.001),
    };
  }
}

export async function parseMesh(data: ArrayBuffer, fileName: string): Promise<PreviewMesh> {
  const lower = fileName.toLowerCase();
  const bytes = new Uint8Array(data);
  if (bytes.length === 0) throw new MeshError('Filen är tom.');

  const builder = new Builder();
  if (lower.endsWith('.stl')) parseStl(bytes, builder);
  else if (lower.endsWith('.obj')) parseObj(decode(bytes), builder);
  else if (lower.endsWith('.3mf')) parse3mf(await unzipModel(bytes), builder);
  else throw new MeshError('Det formatet går inte att förhandsvisa.');
  return builder.finish();
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/* ---------- STL ---------- */

function parseStl(bytes: Uint8Array, builder: Builder): void {
  if (bytes.length >= 84) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(80, true);
    // En binär STL är exakt 84 + 50 byte per triangel lång.
    if (bytes.length === 84 + count * 50 && count > 0) {
      for (let i = 0; i < count; i += 1) {
        const base = 84 + i * 50 + 12; // de tolv första byten är normalen
        const corner = (offset: number) => [
          view.getFloat32(offset, true),
          view.getFloat32(offset + 4, true),
          view.getFloat32(offset + 8, true),
        ];
        builder.add(corner(base), corner(base + 12), corner(base + 24));
      }
      return;
    }
  }
  parseAsciiStl(decode(bytes), builder);
}

const NUMBERS = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function parseAsciiStl(text: string, builder: Builder): void {
  const pattern = /vertex\s+([^\r\n]+)/gi;
  const corners: number[][] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const parts = match[1]!.match(NUMBERS);
    if (!parts || parts.length < 3) continue;
    corners.push([Number(parts[0]), Number(parts[1]), Number(parts[2])]);
    if (corners.length === 3) {
      builder.add(corners[0]!, corners[1]!, corners[2]!);
      corners.length = 0;
    }
  }
  if (builder.count === 0) throw new MeshError('STL-filen gick inte att läsa.');
}

/* ---------- OBJ ---------- */

function parseObj(text: string, builder: Builder): void {
  const vertices: number[][] = [];
  const faces: number[][] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ') || line.startsWith('v\t')) {
      const parts = line.slice(2).match(NUMBERS);
      if (parts && parts.length >= 3) {
        vertices.push([Number(parts[0]), Number(parts[1]), Number(parts[2])]);
      }
    } else if (line.startsWith('f ') || line.startsWith('f\t')) {
      const corners: number[] = [];
      for (const token of line.slice(2).trim().split(/\s+/)) {
        // Hörnet är alltid första talet; resten är textur- och normalindex.
        const index = Number.parseInt(token.split('/')[0]!, 10);
        if (!Number.isFinite(index) || index === 0) continue;
        corners.push(index > 0 ? index - 1 : vertices.length + index);
      }
      if (corners.length >= 3) faces.push(corners);
    }
  }

  if (vertices.length === 0) throw new MeshError('OBJ-filen saknar hörn.');
  for (const face of faces) {
    // Polygoner delas som en fläkt från första hörnet.
    for (let i = 1; i + 1 < face.length; i += 1) {
      const a = vertices[face[0]!];
      const b = vertices[face[i]!];
      const c = vertices[face[i + 1]!];
      if (a && b && c) builder.add(a, b, c);
    }
  }
}

/* ---------- 3MF ---------- */

const UNIT_SCALE: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attributes)?.[1];
}

function matrix(raw: string | undefined): number[] {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  if (!raw) return identity;
  const numbers = raw.trim().split(/\s+/).map(Number);
  return numbers.length === 12 && numbers.every(Number.isFinite) ? numbers : identity;
}

function multiply(outer: number[], inner: number[]): number[] {
  const result = new Array<number>(12).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) sum += inner[row * 3 + k]! * outer[k * 3 + col]!;
      result[row * 3 + col] = sum;
    }
  }
  for (let col = 0; col < 3; col += 1) {
    let sum = outer[9 + col]!;
    for (let k = 0; k < 3; k += 1) sum += inner[9 + k]! * outer[k * 3 + col]!;
    result[9 + col] = sum;
  }
  return result;
}

function apply(m: number[], v: number[]): number[] {
  return [
    v[0]! * m[0]! + v[1]! * m[3]! + v[2]! * m[6]! + m[9]!,
    v[0]! * m[1]! + v[1]! * m[4]! + v[2]! * m[7]! + m[10]!,
    v[0]! * m[2]! + v[1]! * m[5]! + v[2]! * m[8]! + m[11]!,
  ];
}

interface ThreeMfObject {
  vertices: number[][];
  triangles: number[][];
  components: Array<{ id: string; transform: number[] }>;
}

function parse3mf(xml: string, builder: Builder): void {
  const unit = attribute(/<model\b[^>]*>/i.exec(xml)?.[0] ?? '', 'unit')?.toLowerCase();
  const scale = UNIT_SCALE[unit ?? 'millimeter'] ?? 1;

  const objects = new Map<string, ThreeMfObject>();
  const objectPattern = /<object\b([^>]*)>([\s\S]*?)<\/object>/gi;
  let found: RegExpExecArray | null;
  while ((found = objectPattern.exec(xml)) !== null) {
    const id = attribute(found[1]!, 'id');
    if (id) objects.set(id, readObject(found[2]!));
  }

  const items: Array<{ id: string; transform: number[] }> = [];
  const build = /<build\b[^>]*>([\s\S]*?)<\/build>/i.exec(xml);
  if (build) {
    const itemPattern = /<item\b([^>]*)\/?>/gi;
    while ((found = itemPattern.exec(build[1]!)) !== null) {
      const id = attribute(found[1]!, 'objectid');
      if (id) items.push({ id, transform: matrix(attribute(found[1]!, 'transform')) });
    }
  }
  if (items.length === 0) {
    for (const id of objects.keys()) items.push({ id, transform: matrix(undefined) });
  }

  const unitMatrix = [scale, 0, 0, 0, scale, 0, 0, 0, scale, 0, 0, 0];
  for (const item of items) {
    emit(item.id, multiply(unitMatrix, item.transform), objects, builder, 0);
  }
  if (builder.count === 0) throw new MeshError('3MF-filen innehåller ingen geometri.');
}

function readObject(body: string): ThreeMfObject {
  const vertices: number[][] = [];
  const pattern = /<vertex\b([^>]*)\/?>/gi;
  let found: RegExpExecArray | null;
  while ((found = pattern.exec(body)) !== null) {
    vertices.push([
      Number(attribute(found[1]!, 'x')),
      Number(attribute(found[1]!, 'y')),
      Number(attribute(found[1]!, 'z')),
    ]);
  }

  const triangles: number[][] = [];
  const trianglePattern = /<triangle\b([^>]*)\/?>/gi;
  while ((found = trianglePattern.exec(body)) !== null) {
    triangles.push([
      Number.parseInt(attribute(found[1]!, 'v1') ?? '', 10),
      Number.parseInt(attribute(found[1]!, 'v2') ?? '', 10),
      Number.parseInt(attribute(found[1]!, 'v3') ?? '', 10),
    ]);
  }

  const components: ThreeMfObject['components'] = [];
  const componentPattern = /<component\b([^>]*)\/?>/gi;
  while ((found = componentPattern.exec(body)) !== null) {
    const id = attribute(found[1]!, 'objectid');
    if (id) components.push({ id, transform: matrix(attribute(found[1]!, 'transform')) });
  }

  return { vertices, triangles, components };
}

function emit(
  id: string,
  transform: number[],
  objects: Map<string, ThreeMfObject>,
  builder: Builder,
  depth: number,
): void {
  // Komponenter kan peka i ring, så djupet begränsas.
  if (depth > 8) return;
  const object = objects.get(id);
  if (!object) return;

  for (const [i, j, k] of object.triangles) {
    const a = object.vertices[i!];
    const b = object.vertices[j!];
    const c = object.vertices[k!];
    if (!a || !b || !c) continue;
    const corners = [apply(transform, a), apply(transform, b), apply(transform, c)];
    if (corners.some((corner) => corner.some((value) => !Number.isFinite(value)))) continue;
    builder.add(corners[0]!, corners[1]!, corners[2]!);
  }

  for (const component of object.components) {
    emit(component.id, multiply(transform, component.transform), objects, builder, depth + 1);
  }
}

/** Plockar ut modellen ur 3MF-zipen och packar upp den med webbläsarens egen avkodare. */
async function unzipModel(bytes: Uint8Array): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new MeshError('3MF-filen går inte att läsa.');

  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  let best: { method: number; size: number; local: number } | undefined;

  for (let i = 0; i < entries; i += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).toLowerCase();
    if (name.endsWith('.model') && (!best || name === '3d/3dmodel.model')) {
      best = { method, size, local };
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (!best) throw new MeshError('3MF-filen innehåller ingen modell.');
  if (view.getUint32(best.local, true) !== 0x04034b50) {
    throw new MeshError('3MF-filen är skadad.');
  }
  const start =
    best.local + 30 + view.getUint16(best.local + 26, true) + view.getUint16(best.local + 28, true);
  const payload = bytes.subarray(start, start + best.size);

  if (best.method === 0) return decode(payload);
  if (best.method !== 8) throw new MeshError('3MF-filen är packad på ett sätt vi inte läser.');
  try {
    const stream = new Blob([payload as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return decode(new Uint8Array(await new Response(stream).arrayBuffer()));
  } catch {
    throw new MeshError('3MF-filen gick inte att packa upp.');
  }
}
