import { makeLithophane, lithophaneSTL } from './lithophane';
import type { LithophaneSettings } from './lithophane';
const scope = self as unknown as { onmessage: (event: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number; settings: LithophaneSettings; upright: boolean }>) => void; postMessage: (value: unknown, transfer?: Transferable[]) => void };
scope.onmessage = event => {
  try {
    const { pixels, width, height, settings, upright } = event.data;
    const mesh = makeLithophane(pixels, width, height, settings);
    const stl = lithophaneSTL(mesh, upright);
    scope.postMessage({ mesh, stl }, [mesh.positions.buffer, mesh.normals.buffer, mesh.thickness.buffer, mesh.indices.buffer, stl]);
  } catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : 'Modellen kunde inte skapas.' }); }
};
