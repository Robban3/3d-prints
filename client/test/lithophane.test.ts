import { describe, expect, it } from 'vitest';
import { defaultLithophane, makeLithophane, lithophaneSTL } from '../src/lib/lithophane';
import type { LithophaneMesh } from '../src/lib/lithophane';

function image(width: number, height: number, light = 255) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(light);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  return pixels;
}
function closed(mesh: LithophaneMesh) {
  const edges = new Map<string, { count: number; direction: number }>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = mesh.indices[i + j]!, b = mesh.indices[i + (j + 1) % 3]!;
      expect(a).not.toBe(b);
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`, edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count++; edge.direction += a < b ? 1 : -1; edges.set(key, edge);
    }
  }
  expect([...edges.values()].every(edge => edge.count === 2 && edge.direction === 0)).toBe(true);
}
describe('independent lithophane geometry', () => {
  it('makes a closed solid with true mm dimensions and the expected volume', () => {
    const mesh = makeLithophane(image(8, 4), 8, 4, { ...defaultLithophane, width: 100, border: 0 });
    closed(mesh);
    expect(mesh.width).toBe(100); expect(mesh.height).toBe(50);
    expect(mesh.volumeCm3).toBeCloseTo(100 * 50 * .8 / 1000, 5);
    expect(mesh.bounds.max[2]).toBe(50);
  });
  it('makes dark pixels thicker and can invert and mirror the photo without changing the shell', () => {
    const pixels = image(4, 4); for (let y = 0; y < 4; y++) pixels.set([0, 0, 0, 255], y * 16);
    const mesh = makeLithophane(pixels, 4, 4, { ...defaultLithophane, border: 0 });
    const mirror = makeLithophane(pixels, 4, 4, { ...defaultLithophane, border: 0, mirror: true });
    const negative = makeLithophane(pixels, 4, 4, { ...defaultLithophane, border: 0, invert: true });
    expect(mesh.thickness[0]).toBeCloseTo(3.2);
    expect(mirror.thickness[0]).toBeCloseTo(.8);
    expect(negative.thickness[0]).toBeCloseTo(.8);
    closed(negative);
  });
  it.each([30, 120, 180, 300, 360])('closes a curved %s degree model including a periodic full cylinder', angle => {
    const mesh = makeLithophane(image(24, 12), 24, 12, { ...defaultLithophane, shape: 'curved', angle });
    closed(mesh); expect(mesh.volumeCm3).toBeGreaterThan(0);
    expect([...mesh.positions].every(Number.isFinite)).toBe(true);
  });
  it('exports a valid binary STL in upright and flat orientations', () => {
    const mesh = makeLithophane(image(4, 4), 4, 4, { ...defaultLithophane, border: 0 });
    for (const upright of [true, false]) {
      const stl = lithophaneSTL(mesh, upright), view = new DataView(stl);
      expect(view.getUint32(80, true)).toBe(mesh.indices.length / 3);
      expect(stl.byteLength).toBe(84 + mesh.indices.length / 3 * 50);
      let maxHeight = 0;
      for (let i = 0; i < mesh.indices.length / 3; i++) for (let v = 0; v < 3; v++) {
        const z = view.getFloat32(84 + i * 50 + 12 + v * 12 + 8, true);
        expect(z).toBeGreaterThanOrEqual(0); maxHeight = Math.max(maxHeight, z);
      }
      expect(maxHeight).toBeCloseTo(upright ? 100 : .8, 4);
    }
  });
  it('rejects broken settings, oversized grids and self-intersecting tiny cylinders', () => {
    expect(() => makeLithophane(image(4, 4), 4, 4, { ...defaultLithophane, minThickness: 4 })).toThrow();
    expect(() => makeLithophane(image(4, 4), 4, 4, { ...defaultLithophane, shape: 'curved', angle: 360, width: 20, maxThickness: 6 })).toThrow();
    expect(() => makeLithophane(image(4, 4), 400, 4, defaultLithophane)).toThrow();
    expect(() => makeLithophane(image(4, 4), 4, 4, { ...defaultLithophane, gamma: NaN })).toThrow();
  });
});
