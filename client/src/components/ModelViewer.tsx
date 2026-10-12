import { useEffect, useRef, useState } from 'react';
import { MeshError, isPreviewable, parseMesh } from '../lib/mesh';
import type { PreviewMesh } from '../lib/mesh';

/**
 * Visar kundens uppladdade modell i 3D direkt i formuläret, så att det syns på
 * en gång att rätt fil kommit fram och hur den ser ut.
 *
 * Ritas med WebGL utan något grafikbibliotek: modellen centreras, skalas till
 * vyn och roteras med en 3×3-matris som räknas fram här. Normalen vänds mot
 * kameran i fragmentsteget, så en modell med inåtvända normaler – vilket
 * uppmätningen ofta flaggar – ändå ser hel ut.
 */

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat3 uRotation;
uniform vec3 uCenter;
uniform float uScale;
uniform float uAspect;
uniform float uZoom;
varying vec3 vNormal;
varying float vHeight;
void main() {
  vec3 local = (aPosition - uCenter) * uScale;
  vec3 placed = uRotation * local;
  vNormal = uRotation * aNormal;
  vHeight = local.z;
  gl_Position = vec4(placed.x * uZoom / uAspect, placed.y * uZoom, placed.z * 0.5, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vNormal;
varying float vHeight;
uniform vec3 uColor;
void main() {
  // Positiv z pekar bort från kameran. Vänd normalen hitåt så att både ut- och
  // inåtvända trianglar lyses upp likadant.
  vec3 n = normalize(vNormal);
  if (n.z > 0.0) n = -n;

  float key = max(dot(n, normalize(vec3(-0.35, 0.5, -0.79))), 0.0);
  float fill = max(dot(n, normalize(vec3(0.6, -0.3, -0.74))), 0.0);
  // Ljus kant där ytan vänder bort, så silhuetten syns mot den mörka bakgrunden.
  float rim = pow(1.0 - abs(n.z), 3.0);
  // Antydan till lagerlinjer, som på en riktig utskrift.
  float layers = sin(vHeight * 240.0) * 0.025;

  vec3 shade = uColor * (0.2 + key * 0.72 + fill * 0.26 + layers);
  shade += vec3(0.17, 0.5, 1.0) * rim * 0.3;
  gl_FragColor = vec4(clamp(shade, 0.0, 1.0), 1.0);
}
`;

interface Renderer {
  draw(yaw: number, pitch: number, zoom: number): void;
  dispose(): void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Kunde inte skapa shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'okänt fel';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createRenderer(canvas: HTMLCanvasElement, mesh: PreviewMesh): Renderer {
  const gl = (canvas.getContext('webgl', { antialias: true, alpha: false }) ??
    canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) throw new Error('WebGL saknas');

  const program = gl.createProgram();
  if (!program) throw new Error('Kunde inte skapa program');
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'länkningen misslyckades');
  }
  gl.useProgram(program);

  function bind(name: string, data: Float32Array): WebGLBuffer {
    const buffer = gl!.createBuffer();
    if (!buffer) throw new Error('Kunde inte skapa buffert');
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
    const location = gl!.getAttribLocation(program!, name);
    gl!.enableVertexAttribArray(location);
    gl!.vertexAttribPointer(location, 3, gl!.FLOAT, false, 0, 0);
    return buffer;
  }

  const positions = bind('aPosition', mesh.positions);
  const normals = bind('aNormal', mesh.normals);

  const uRotation = gl.getUniformLocation(program, 'uRotation');
  const uCenter = gl.getUniformLocation(program, 'uCenter');
  const uScale = gl.getUniformLocation(program, 'uScale');
  const uAspect = gl.getUniformLocation(program, 'uAspect');
  const uZoom = gl.getUniformLocation(program, 'uZoom');
  const uColor = gl.getUniformLocation(program, 'uColor');

  gl.uniform3f(uCenter, mesh.center[0], mesh.center[1], mesh.center[2]);
  // Längsta sidan fyller 1,6 av vyns 2,0, så det blir luft runt modellen.
  gl.uniform1f(uScale, 1.6 / mesh.extent);
  gl.uniform3f(uColor, 0.63, 0.69, 0.79);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  // Ingen baksidesgallring: trianglar kan vara vridna åt fel håll i kundens fil.
  gl.disable(gl.CULL_FACE);
  gl.clearColor(21 / 255, 25 / 255, 32 / 255, 1);

  const rotation = new Float32Array(9);
  const vertexCount = mesh.triangles * 3;

  return {
    draw(yaw, pitch, zoom) {
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) return;
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const ca = Math.cos(yaw);
      const sa = Math.sin(yaw);
      const ce = Math.cos(pitch);
      const se = Math.sin(pitch);
      // Raderna är skärmens x, skärmens y (modellens höjd) och djupet.
      // Matrisen skickas kolumnvis, som WebGL vill ha den.
      rotation[0] = ca;
      rotation[1] = -sa * se;
      rotation[2] = sa * ce;
      rotation[3] = -sa;
      rotation[4] = -ca * se;
      rotation[5] = ca * ce;
      rotation[6] = 0;
      rotation[7] = ce;
      rotation[8] = se;
      gl.uniformMatrix3fv(uRotation, false, rotation);
      gl.uniform1f(uAspect, width / height);
      gl.uniform1f(uZoom, zoom);
      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    },
    dispose() {
      gl.deleteBuffer(positions);
      gl.deleteBuffer(normals);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      // Släpper grafikminnet direkt i stället för att vänta på webbläsaren.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

interface Props {
  /** Filen kunden valde. Finns den behövs ingen nedladdning. */
  file?: File | null;
  /** Adress att hämta filen från, när filen inte finns kvar i webbläsaren. */
  url?: string;
  fileName: string;
}

export function ModelViewer({ file, url, fileName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mesh, setMesh] = useState<PreviewMesh | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState(true);

  // Läser in filen och tolkar den till trianglar.
  useEffect(() => {
    if (!isPreviewable(fileName)) {
      setMesh(null);
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    setError('');

    const load = async (): Promise<ArrayBuffer> => {
      if (file) return file.arrayBuffer();
      if (!url) throw new MeshError('Filen finns inte att visa.');
      const response = await fetch(url);
      if (!response.ok) throw new MeshError('Filen kunde inte hämtas.');
      return response.arrayBuffer();
    };

    load()
      .then((data) => parseMesh(data, fileName))
      .then((parsed) => {
        if (active) setMesh(parsed);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setMesh(null);
        setError(caught instanceof MeshError ? caught.message : 'Modellen kunde inte visas i 3D.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [file, url, fileName]);

  // Ritar modellen och håller den snurrande.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mesh) return;

    let renderer: Renderer;
    try {
      renderer = createRenderer(canvas, mesh);
    } catch {
      setError('Din webbläsare kan inte visa 3D, men filen är uppladdad och klar.');
      return;
    }

    let yaw = 0.6;
    let pitch = 0.32;
    let zoom = 1;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let frame = 0;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const size = () => {
      // Ritas i skärmens riktiga upplösning, annars blir kanterna grova.
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const render = () => renderer.draw(yaw, pitch, zoom);

    // Storleken läses bara om när rutan faktiskt ändras. Att mäta i varje
    // bildruta tvingar webbläsaren att räkna om layouten sextio gånger i sekunden.
    const resize = () => {
      size();
      render();
    };

    const tick = () => {
      if (!dragging && !still) yaw += 0.004;
      render();
      frame = window.requestAnimationFrame(tick);
    };

    const down = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      setHint(false);
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      yaw += (event.clientX - lastX) * 0.01;
      // Begränsad lutning, annars tippar modellen runt och blir svår att läsa.
      pitch = Math.max(-1.2, Math.min(1.4, pitch + (event.clientY - lastY) * 0.008));
      lastX = event.clientX;
      lastY = event.clientY;
      if (still) render();
    };
    const up = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom = Math.max(0.5, Math.min(3, zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
      if (still) render();
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(canvas);

    resize();
    if (!still) frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      renderer.dispose();
    };
  }, [mesh]);

  if (!isPreviewable(fileName)) return null;

  return (
    <div className="model-viewer">
      {mesh && (
        <canvas
          ref={canvasRef}
          className="model-canvas"
          aria-label={`3D-förhandsvisning av ${fileName}`}
          role="img"
        />
      )}
      {loading && <p className="model-viewer-message">Läser in modellen…</p>}
      {error && !loading && <p className="model-viewer-message">{error}</p>}
      {mesh && hint && (
        <span className="model-viewer-hint" aria-hidden="true">
          Dra för att vrida · rulla för att zooma
        </span>
      )}
    </div>
  );
}
