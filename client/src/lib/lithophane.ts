export interface LithophaneSettings {
  width: number; minThickness: number; maxThickness: number; border: number;
  shape: 'flat' | 'curved'; angle: number; brightness: number; contrast: number; gamma: number;
  invert: boolean; mirror: boolean; smoothing: number;
}
export const defaultLithophane: LithophaneSettings = { width: 100, minThickness: .8, maxThickness: 3.2, border: 2, shape: 'flat', angle: 120, brightness: 0, contrast: 0, gamma: 1, invert: false, mirror: false, smoothing: 0 };
export interface LithophaneMesh {
  positions: Float32Array; normals: Float32Array; thickness: Float32Array; indices: Uint32Array;
  bounds: { min: number[]; max: number[] }; width: number; height: number; volumeCm3: number;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Independently implemented height field; front, back and perimeter share vertices. Units are mm. */
export function makeLithophane(rgba: Uint8ClampedArray, columns: number, rows: number, s: LithophaneSettings): LithophaneMesh {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2 || columns > 360 || rows > 360 || rgba.length !== columns * rows * 4) throw new Error('Bilden har ogiltig upplösning.');
  const values = [s.width, s.minThickness, s.maxThickness, s.border, s.angle, s.brightness, s.contrast, s.gamma, s.smoothing];
  if (values.some(n => !Number.isFinite(n)) || s.width < 20 || s.width > 250 || s.minThickness < .4 || s.maxThickness > 6 || s.maxThickness <= s.minThickness || s.border < 0 || s.border > 10 || s.brightness < -100 || s.brightness > 100 || Math.abs(s.contrast) > 80 || s.gamma < .3 || s.gamma > 3 || s.smoothing < 0 || s.smoothing > 3 || !Number.isInteger(s.smoothing) || !['flat', 'curved'].includes(s.shape) || s.angle < 30 || s.angle > 360) throw new Error('Kontrollera mått, tjocklek och bildinställningar.');
  const height = s.width * rows / columns;
  if (height > 400 || height < 10 || s.border * 2 >= Math.min(s.width, height)) throw new Error('Bildens proportioner ger en för hög eller smal modell. Beskär bilden eller ändra bredden.');
  const angle = s.angle * Math.PI / 180;
  const radius = s.width / angle;
  if (s.shape === 'curved' && radius <= s.maxThickness + .5) throw new Error('Öka bredden, minska böjningen eller minska tjockleken.');
  let gray = new Float32Array(columns * rows);
  for (let i = 0; i < gray.length; i++) {
    const alpha = rgba[i * 4 + 3]! / 255;
    gray[i] = alpha * (.2126 * rgba[i * 4]! + .7152 * rgba[i * 4 + 1]! + .0722 * rgba[i * 4 + 2]!) / 255 + 1 - alpha;
  }
  for (let pass = 0; pass < s.smoothing; pass++) {
    const next = new Float32Array(gray.length);
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += gray[Math.max(0, Math.min(rows - 1, y + dy)) * columns + Math.max(0, Math.min(columns - 1, x + dx))]!;
      next[y * columns + x] = sum / 9;
    }
    gray = next;
  }
  const periodic = s.shape === 'curved' && s.angle === 360;
  const count = columns * rows;
  const positions = new Float32Array(count * 6), normals = new Float32Array(count * 6), thickness = new Float32Array(count * 2);
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const contrast = (1 + s.contrast / 100) / (1 - s.contrast / 100);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const u = x / (periodic ? columns : columns - 1), v = y / (rows - 1);
    const px = s.mirror ? columns - 1 - x : x;
    let light = Math.pow(clamp((gray[(rows - 1 - y) * columns + px]! + s.brightness / 100 - .5) * contrast + .5), 1 / s.gamma);
    if (s.invert) light = 1 - light;
    let t = s.minThickness + (1 - light) * (s.maxThickness - s.minThickness);
    if (s.border > 0 && (v * height < s.border || (1 - v) * height < s.border || (!periodic && (u * s.width < s.border || (1 - u) * s.width < s.border)))) t = s.maxThickness;
    for (let side = 0; side < 2; side++) {
      const index = side * count + y * columns + x;
      const depth = side ? t : 0;
      const theta = (u - .5) * angle;
      const point = s.shape === 'curved' ? [(radius - depth) * Math.sin(theta), radius - (radius - depth) * Math.cos(theta), v * height] : [(u - .5) * s.width, depth, v * height];
      positions.set(point, index * 3); thickness[index] = t;
      for (let axis = 0; axis < 3; axis++) { bounds.min[axis] = Math.min(bounds.min[axis]!, point[axis]!); bounds.max[axis] = Math.max(bounds.max[axis]!, point[axis]!); }
    }
  }
  const triangles: number[] = [];
  const tri = (a: number, b: number, c: number) => { triangles.push(a, b, c); };
  for (let y = 0; y < rows - 1; y++) for (let x = 0; x < (periodic ? columns : columns - 1); x++) {
    const a = y * columns + x, b = y * columns + (x + 1) % columns, c = a + columns, d = b + columns;
    tri(a, b, c); tri(b, d, c);
    tri(a + count, c + count, b + count); tri(b + count, c + count, d + count);
  }
  const wall = (a: number, b: number) => { tri(a, a + count, b); tri(b, a + count, b + count); };
  for (let x = 0; x < (periodic ? columns : columns - 1); x++) { const next = (x + 1) % columns; wall(x, next); wall((rows - 1) * columns + next, (rows - 1) * columns + x); }
  if (!periodic) for (let y = 0; y < rows - 1; y++) { wall(y * columns + columns - 1, (y + 1) * columns + columns - 1); wall((y + 1) * columns, y * columns); }
  const indices = new Uint32Array(triangles);
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const index of [a, b, c]) { normals[index] = normals[index]! + nx; normals[index + 1] = normals[index + 1]! + ny; normals[index + 2] = normals[index + 2]! + nz; }
    volume += positions[a]! * (positions[b + 1]! * positions[c + 2]! - positions[b + 2]! * positions[c + 1]!) + positions[a + 1]! * (positions[b + 2]! * positions[c]! - positions[b]! * positions[c + 2]!) + positions[a + 2]! * (positions[b]! * positions[c + 1]! - positions[b + 1]! * positions[c]!);
  }
  for (let i = 0; i < normals.length; i += 3) { const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1; normals[i] = normals[i]! / length; normals[i + 1] = normals[i + 1]! / length; normals[i + 2] = normals[i + 2]! / length; }
  return { positions, normals, thickness, indices, bounds, width: s.width, height, volumeCm3: Math.abs(volume) / 6000 };
}

/** Binary STL, upright by default; flat mode rotates the same closed mesh onto its back. */
export function lithophaneSTL(mesh: LithophaneMesh, upright = true): ArrayBuffer {
  const triangles = mesh.indices.length / 3;
  const buffer = new ArrayBuffer(84 + triangles * 50), view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('Formlabb lithophane | mm | ' + (upright ? 'upright' : 'flat')));
  view.setUint32(80, triangles, true);
  for (let i = 0; i < triangles; i++) {
    const vertices = [0, 1, 2].map(offset => { const index = mesh.indices[i * 3 + offset]! * 3; const x = mesh.positions[index]!, y = mesh.positions[index + 1]!, z = mesh.positions[index + 2]!; return upright ? [x, y, z] : [x, -z, y]; });
    const [a, b, c] = vertices as [number[], number[], number[]];
    const u = b.map((n, axis) => n - a[axis]!), v = c.map((n, axis) => n - a[axis]!);
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const length = Math.hypot(...n) || 1;
    const values = [...n.map(value => value / length), ...a, ...b, ...c];
    values.forEach((value, index) => view.setFloat32(84 + i * 50 + index * 4, value, true));
  }
  return buffer;
}
