import { useEffect, useRef, useState } from 'react';
import type { LithophaneMesh } from '../lib/lithophane';

export function LithophanePreview({ mesh, backlight, min, max }: { mesh: LithophaneMesh; backlight: boolean; min: number; max: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [yaw, setYaw] = useState(-15), [pitch, setPitch] = useState(8), [zoom, setZoom] = useState(1);
  const view = useRef({ yaw, pitch, zoom, backlight, min, max });
  const draw = useRef<() => void>(() => undefined);
  const pointer = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  useEffect(() => { view.current = { yaw, pitch, zoom, backlight, min, max }; draw.current(); }, [yaw, pitch, zoom, backlight, min, max]);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const gl = element.getContext('webgl', { alpha: true, antialias: true });
    if (!gl || !gl.getExtension('OES_element_index_uint')) { setError('3D-visningen stöds inte av den här webbläsaren. Du kan fortfarande skapa och hämta STL-filen.'); return; }
    setError('');
    const shaders: WebGLShader[] = [], buffers: WebGLBuffer[] = [];
    const program = gl.createProgram()!;
    function shader(type: number, source: string) {
      const value = gl!.createShader(type)!; shaders.push(value); gl!.shaderSource(value, source); gl!.compileShader(value);
      if (!gl!.getShaderParameter(value, gl!.COMPILE_STATUS)) throw new Error('3D-visningen kunde inte starta.');
      gl!.attachShader(program, value);
    }
    try {
      shader(gl.VERTEX_SHADER, `attribute vec3 position; attribute vec3 normal; attribute float thickness;
        uniform vec3 center; uniform vec2 rotation; uniform vec2 extent; uniform vec2 limits; uniform float lit;
        varying vec3 color;
        vec3 turn(vec3 p) { float c=cos(rotation.x),s=sin(rotation.x); p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z); c=cos(rotation.y);s=sin(rotation.y);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z); }
        void main(){ vec3 p=turn(vec3(position.x,position.z,position.y)-center); vec3 n=normalize(turn(vec3(normal.x,normal.z,normal.y)));
          gl_Position=vec4(p.x/extent.x,p.y/extent.y,-p.z/(4.0*max(extent.x,extent.y)),1.0);
          float light=clamp((exp(-thickness*.8)-exp(-limits.y*.8))/(exp(-limits.x*.8)-exp(-limits.y*.8)),0.0,1.0);
          float shade=.45+.55*abs(dot(n,normalize(vec3(-.3,.55,1.0))));
          color=mix(vec3(.93,.91,.85)*shade,vec3(.12+light*.88,.10+light*.83,.08+light*.70),lit); }
      `);
      shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec3 color; void main(){gl_FragColor=vec4(color,1.0);}');
      gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('3D-visningen kunde inte starta.');
      gl.useProgram(program);
      for (const [name, data, size] of [['position', mesh.positions, 3], ['normal', mesh.normals, 3], ['thickness', mesh.thickness, 1]] as const) {
        const buffer = gl.createBuffer()!; buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const location = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      }
      const index = gl.createBuffer()!; buffers.push(index); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      const uniform = (name: string) => gl.getUniformLocation(program, name);
      const locations = { center: uniform('center'), rotation: uniform('rotation'), extent: uniform('extent'), limits: uniform('limits'), lit: uniform('lit') };
      const center = [(mesh.bounds.min[0]! + mesh.bounds.max[0]!) / 2, mesh.height / 2, (mesh.bounds.min[1]! + mesh.bounds.max[1]!) / 2];
      draw.current = () => {
        const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight), ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) { element.width = Math.round(width * ratio); element.height = Math.round(height * ratio); }
        gl.viewport(0, 0, element.width, element.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.useProgram(program);
        const state = view.current, aspect = width / height;
        const scale = Math.max(mesh.height, (mesh.bounds.max[0]! - mesh.bounds.min[0]!) / aspect, mesh.bounds.max[1]! - mesh.bounds.min[1]!) * .65 / state.zoom;
        gl.uniform3fv(locations.center, center); gl.uniform2f(locations.rotation, state.yaw * Math.PI / 180, state.pitch * Math.PI / 180);
        gl.uniform2f(locations.extent, scale * aspect, scale); gl.uniform2f(locations.limits, state.min, state.max); gl.uniform1f(locations.lit, state.backlight ? 1 : 0);
        gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
      };
      draw.current();
    } catch (error) { setError(error instanceof Error ? error.message : '3D-visningen kunde inte starta.'); }
    const observer = new ResizeObserver(() => draw.current()); observer.observe(element);
    return () => { observer.disconnect(); draw.current = () => undefined; for (const buffer of buffers) gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader)); };
  }, [mesh]);
  return <div className="litho-viewer">
    {error && <p className="notice">{error}</p>}
    <canvas ref={canvas} aria-label="Interaktiv 3D-förhandsvisning av din litofan" onPointerDown={event => { pointer.current = { x: event.clientX, y: event.clientY, yaw, pitch }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { const start = pointer.current; if (start) { setYaw(start.yaw + (event.clientX - start.x) * .5); if (event.pointerType !== 'touch') setPitch(Math.max(-80, Math.min(80, start.pitch + (event.clientY - start.y) * .4))); } }} onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }} />
    <div className="litho-view-controls"><label className="field">Vrid modellen<input type="range" min={-180} max={180} value={Math.max(-180, Math.min(180, yaw))} onChange={e => setYaw(Number(e.target.value))} /></label><label className="field">Zoom<input type="range" min={.6} max={2.5} step={.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label><button type="button" className="btn btn-ghost" onClick={() => { setYaw(-15); setPitch(8); setZoom(1); }}>Återställ vy</button></div>
  </div>;
}
