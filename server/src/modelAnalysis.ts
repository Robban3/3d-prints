import { inflateRawSync } from 'node:zlib';

/**
 * Mäter upp en uppladdad modellfil i stället för att låta kunden gissa.
 *
 * Volymen är det som styr priset, så den räknas ut ur själva geometrin med
 * tetraedersumman: varje triangel bildar en tetraeder mot origo, och summan av
 * deras signerade volymer är kroppens volym oavsett var modellen ligger. Samma
 * genomgång ger måtten, ytan och antalet öppna kanter – det senare avgör om
 * meshen går att slica alls.
 *
 * Modulen är avsiktligt fri från beroenden och läser aldrig från disk själv;
 * den får en buffert och svarar med siffror.
 */

/** STL och OBJ saknar enhet. Branschen skriver millimeter, så vi gör det också. */
export const MODEL_UNIT = 'mm';

/** Större filer än så här mäter vi inte upp – de går till manuell hantering. */
export const MAX_ANALYSIS_BYTES = 120 * 1024 * 1024;

/**
 * Täthetskontrollen håller en karta över alla kanter, så den kostar minne.
 * Över den här gränsen rapporterar vi måtten men hoppar över kontrollen.
 */
export const WATERTIGHT_MAX_TRIANGLES = 250_000;

/** Byggvolymen i verkstaden. Allt som inte får plats måste delas eller skalas. */
export const BUILD_PLATE = buildPlate();

function buildPlate(): { width: number; depth: number; height: number } {
  const raw = process.env.BUILD_PLATE_MM?.split('x').map((part) => Number(part.trim()));
  if (raw && raw.length === 3 && raw.every((n) => Number.isFinite(n) && n > 0)) {
    return { width: raw[0]!, depth: raw[1]!, height: raw[2]! };
  }
  return { width: 256, depth: 256, height: 256 };
}

export type ModelFormat = 'stl' | 'obj' | '3mf';

/** Format vi kan räkna på. STEP och F3D är CAD-format utan färdig mesh. */
const ANALYZABLE: Record<string, ModelFormat> = {
  '.stl': 'stl',
  '.obj': 'obj',
  '.3mf': '3mf',
};

export function isAnalyzableExtension(extension: string): boolean {
  return extension.toLowerCase() in ANALYZABLE;
}

export type WarningSeverity = 'info' | 'warning' | 'error';

export interface ModelWarning {
  code:
    | 'inte-tat'
    | 'icke-manifold'
    | 'for-stor'
    | 'misstankt-liten'
    | 'inverterade-normaler'
    | 'tom-volym'
    | 'tung-mesh'
    | 'flera-delar';
  severity: WarningSeverity;
  message: string;
}

export interface ModelAnalysis {
  format: ModelFormat;
  /** Volymen på själva kroppen, innan fyllnadsgraden räknas in. */
  volumeCm3: number;
  surfaceAreaCm2: number;
  /** Modellens yttermått i millimeter. */
  bounds: { width: number; depth: number; height: number };
  triangles: number;
  /** Antal kanter som bara hör till en triangel, dvs. hål i ytan. */
  openEdges: number | null;
  /** Antal kanter som delas av fler än två trianglar, t.ex. dubblerad geometri. */
  nonManifoldEdges: number | null;
  watertight: boolean | null;
  /** True när tetraedersumman blev negativ, dvs. normalerna pekar inåt. */
  invertedNormals: boolean;
  fitsBuildPlate: boolean;
  warnings: ModelWarning[];
}

export class ModelParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelParseError';
  }
}

/** En triangel i taget, så att stora filer inte behöver ligga i minnet som vektorer. */
interface MeshSink {
  triangle(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
  ): void;
}

class MeshMeasure implements MeshSink {
  signedVolumeMm3 = 0;
  areaMm2 = 0;
  triangles = 0;
  minX = Infinity;
  minY = Infinity;
  minZ = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  maxZ = -Infinity;

  /** Kantbokföringen för täthetskontrollen, först när vi vet att meshen är liten nog. */
  private vertexIds: Map<string, number> | undefined;
  private edgeCounts: Map<string, number> | undefined;
  private edgeOverflow = false;

  constructor(checkWatertight: boolean) {
    if (checkWatertight) {
      this.vertexIds = new Map();
      this.edgeCounts = new Map();
    }
  }

  triangle(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
  ): void {
    this.triangles += 1;

    // Tetraedern mot origo: a · (b × c) / 6.
    this.signedVolumeMm3 +=
      (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;

    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    this.areaMm2 += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;

    if (ax < this.minX) this.minX = ax;
    if (ay < this.minY) this.minY = ay;
    if (az < this.minZ) this.minZ = az;
    if (ax > this.maxX) this.maxX = ax;
    if (ay > this.maxY) this.maxY = ay;
    if (az > this.maxZ) this.maxZ = az;
    if (bx < this.minX) this.minX = bx;
    if (by < this.minY) this.minY = by;
    if (bz < this.minZ) this.minZ = bz;
    if (bx > this.maxX) this.maxX = bx;
    if (by > this.maxY) this.maxY = by;
    if (bz > this.maxZ) this.maxZ = bz;
    if (cx < this.minX) this.minX = cx;
    if (cy < this.minY) this.minY = cy;
    if (cz < this.minZ) this.minZ = cz;
    if (cx > this.maxX) this.maxX = cx;
    if (cy > this.maxY) this.maxY = cy;
    if (cz > this.maxZ) this.maxZ = cz;

    if (!this.edgeCounts) return;
    if (this.triangles > WATERTIGHT_MAX_TRIANGLES) {
      // Meshen visade sig vara för stor; släpp bokföringen i stället för att svälla.
      this.edgeOverflow = true;
      this.edgeCounts = undefined;
      this.vertexIds = undefined;
      return;
    }
    const ia = this.vertexId(ax, ay, az);
    const ib = this.vertexId(bx, by, bz);
    const ic = this.vertexId(cx, cy, cz);
    this.countEdge(ia, ib);
    this.countEdge(ib, ic);
    this.countEdge(ic, ia);
  }

  /**
   * Samma hörn skrivs en gång per triangel i STL, och float32 gör att
   * värdena kan skilja sig i sista decimalen. Vi avrundar till mikrometer
   * så att hörn som ska vara samma punkt också blir det.
   */
  private vertexId(x: number, y: number, z: number): number {
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    const existing = this.vertexIds!.get(key);
    if (existing !== undefined) return existing;
    const id = this.vertexIds!.size;
    this.vertexIds!.set(key, id);
    return id;
  }

  private countEdge(a: number, b: number): void {
    if (a === b) return; // Degenererad kant, säger inget om tätheten.
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    this.edgeCounts!.set(key, (this.edgeCounts!.get(key) ?? 0) + 1);
  }

 /**
   * En sluten yta delar varje kant mellan exakt två trianglar. En kant med bara
   * en triangel är ett hål; en kant med fler än två betyder att geometrin
   * överlappar sig själv, vilket slicern hanterar på ett helt annat sätt.
   */
  edgeDefects(): { open: number; nonManifold: number } | null {
    if (!this.edgeCounts || this.edgeOverflow) return null;
    let open = 0;
    let nonManifold = 0;
    for (const count of this.edgeCounts.values()) {
      if (count === 1) open += 1;
      else if (count > 2) nonManifold += 1;
    }
    return { open, nonManifold };
  }
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Tre decimaler räcker för allt vi printar, men en modell som exporterats i fel
 * enhet kan vara tusendelar av en kubikcentimeter. Då behåller vi tre
 * värdesiffror i stället för att avrunda bort hela volymen.
 */
function roundVolume(volumeCm3: number): number {
  const rounded = round(volumeCm3, 3);
  if (rounded > 0 || volumeCm3 === 0) return rounded;
  return Number(volumeCm3.toPrecision(3));
}

/** Mäter upp en modellfil. Kastar ModelParseError när filen inte går att läsa. */
export function analyzeModel(buffer: Buffer, extension: string): ModelAnalysis {
  const format = ANALYZABLE[extension.toLowerCase()];
  if (!format) throw new ModelParseError('Det formatet kan vi inte mäta upp automatiskt.');
  if (buffer.length === 0) throw new ModelParseError('Filen är tom.');
  if (buffer.length > MAX_ANALYSIS_BYTES) {
    throw new ModelParseError('Filen är för stor för att mätas upp automatiskt.');
  }

  // Täthetskontrollen kräver minne per kant, så vi uppskattar storleken först.
  const measure = new MeshMeasure(estimateTriangles(buffer, format) <= WATERTIGHT_MAX_TRIANGLES);
  let parts = 1;
  if (format === 'stl') parseStl(buffer, measure);
  else if (format === 'obj') parseObj(buffer, measure);
  else parts = parse3mf(buffer, measure);

  if (measure.triangles === 0) throw new ModelParseError('Filen innehåller ingen geometri.');

  const volumeCm3 = Math.abs(measure.signedVolumeMm3) / 1000;
  const bounds = {
    width: round(measure.maxX - measure.minX, 2),
    depth: round(measure.maxY - measure.minY, 2),
    height: round(measure.maxZ - measure.minZ, 2),
  };
  const defects = measure.edgeDefects();
  const fitsBuildPlate =
    bounds.width <= BUILD_PLATE.width &&
    bounds.depth <= BUILD_PLATE.depth &&
    bounds.height <= BUILD_PLATE.height;

  const analysis: ModelAnalysis = {
    format,
    volumeCm3: roundVolume(volumeCm3),
    surfaceAreaCm2: round(measure.areaMm2 / 100, 2),
    bounds,
    triangles: measure.triangles,
    openEdges: defects?.open ?? null,
    nonManifoldEdges: defects?.nonManifold ?? null,
    watertight: defects === null ? null : defects.open === 0 && defects.nonManifold === 0,
    invertedNormals: measure.signedVolumeMm3 < 0,
    fitsBuildPlate,
    warnings: [],
  };
  analysis.warnings = warningsFor(analysis, parts, volumeCm3);
  return analysis;
}

function warningsFor(analysis: ModelAnalysis, parts: number, rawVolumeCm3: number): ModelWarning[] {
  const warnings: ModelWarning[] = [];
  const { bounds } = analysis;

  if (!analysis.fitsBuildPlate) {
    const over = [
      bounds.width > BUILD_PLATE.width ? `bredden ${bounds.width} mm` : '',
      bounds.depth > BUILD_PLATE.depth ? `djupet ${bounds.depth} mm` : '',
      bounds.height > BUILD_PLATE.height ? `höjden ${bounds.height} mm` : '',
    ].filter(Boolean);
    warnings.push({
      code: 'for-stor',
      severity: 'error',
      message: `Modellen är större än byggvolymen ${BUILD_PLATE.width}×${BUILD_PLATE.depth}×${BUILD_PLATE.height} mm – ${over.join(' och ')} går utanför. Vi kan skala ner den eller dela den i flera delar, skriv en rad om vad du föredrar.`,
    });
  }

  // Mäts mot det oavrundade värdet; en millimetersmå modell har en volym,
  // den är bara mycket liten.
  if (rawVolumeCm3 <= 1e-9) {
    warnings.push({
      code: 'tom-volym',
      severity: 'error',
      message:
        'Modellen har ingen mätbar volym. Det brukar betyda att den består av lösa ytor i stället för en sluten kropp.',
    });
  } else if (Math.max(bounds.width, bounds.depth, bounds.height) < 1) {
    warnings.push({
      code: 'misstankt-liten',
      severity: 'warning',
      message: `Modellen mäter bara ${bounds.width}×${bounds.depth}×${bounds.height} mm. Kontrollera enheten i exporten – måtten tolkas alltid som millimeter.`,
    });
  }

  if (analysis.nonManifoldEdges !== null && analysis.nonManifoldEdges > 0) {
    warnings.push({
      code: 'icke-manifold',
      severity: 'warning',
      message: `Geometrin överlappar sig själv på ${analysis.nonManifoldEdges} kanter, ofta för att delar ligger dubblerade eller skär in i varandra. Det går oftast att printa, men hör av oss om formen ser fel ut.`,
    });
  }

  if (analysis.openEdges !== null && analysis.openEdges > 0) {
    warnings.push({
      code: 'inte-tat',
      severity: 'warning',
      message: `Meshen har ${analysis.openEdges} öppna kanter och är alltså inte helt sluten. Vi lagar oftast sådant automatiskt vid slicing, men hör av oss om resultatet påverkar formen.`,
    });
  }

  if (analysis.invertedNormals) {
    warnings.push({
      code: 'inverterade-normaler',
      severity: 'info',
      message:
        'Modellens normaler pekar inåt. Volymen stämmer ändå, och vi vänder dem innan print.',
    });
  }

  if (analysis.triangles > 1_000_000) {
    warnings.push({
      code: 'tung-mesh',
      severity: 'info',
      message: `Modellen har ${analysis.triangles.toLocaleString('sv-SE')} trianglar. Det går att printa, men en lättare mesh ger samma yta och snabbare hantering.`,
    });
  }

  if (parts > 1) {
    warnings.push({
      code: 'flera-delar',
      severity: 'info',
      message: `Filen innehåller ${parts} separata delar. Volymen nedan är summan av alla.`,
    });
  }

  return warnings;
}

/** Grov gissning på antalet trianglar, bara för att välja om kanterna ska bokföras. */
function estimateTriangles(buffer: Buffer, format: ModelFormat): number {
  if (format === 'stl') {
    const binary = binaryTriangleCount(buffer);
    // ASCII-STL skriver sju rader per triangel, ungefär 250 byte.
    return binary ?? Math.ceil(buffer.length / 250);
  }
  // Både OBJ och packad 3MF landar grovt på ett par hundra byte per triangel.
  return Math.ceil(buffer.length / 120);
}

/** Antalet trianglar om bufferten är en binär STL, annars undefined. */
function binaryTriangleCount(buffer: Buffer): number | undefined {
  if (buffer.length < 84) return undefined;
  const count = buffer.readUInt32LE(80);
  return buffer.length === 84 + count * 50 ? count : undefined;
}

function parseStl(buffer: Buffer, sink: MeshSink): void {
  const count = binaryTriangleCount(buffer);
  if (count !== undefined) {
    parseBinaryStl(buffer, count, sink);
    return;
  }
  // Inte en exakt binär längd – då ska det vara ASCII. Vissa program lägger på
  // skräp i slutet, så binärt tolkat innehåll kontrolleras en gång till nedan.
  const head = buffer.subarray(0, 512).toString('latin1');
  if (/^\s*solid/i.test(head) && /facet|vertex/i.test(head)) {
    parseAsciiStl(buffer, sink);
    return;
  }
  if (buffer.length >= 84) {
    const claimed = buffer.readUInt32LE(80);
    if (claimed > 0 && buffer.length >= 84 + claimed * 50) {
      parseBinaryStl(buffer, claimed, sink);
      return;
    }
  }
  throw new ModelParseError('Filen ser inte ut som en STL. Spara om den från ditt CAD-program.');
}

function parseBinaryStl(buffer: Buffer, count: number, sink: MeshSink): void {
  let offset = 84;
  for (let i = 0; i < count; i += 1) {
    // De första tolv byten är normalen, som vi räknar om själva.
    const base = offset + 12;
    sink.triangle(
      buffer.readFloatLE(base),
      buffer.readFloatLE(base + 4),
      buffer.readFloatLE(base + 8),
      buffer.readFloatLE(base + 12),
      buffer.readFloatLE(base + 16),
      buffer.readFloatLE(base + 20),
      buffer.readFloatLE(base + 24),
      buffer.readFloatLE(base + 28),
      buffer.readFloatLE(base + 32),
    );
    offset += 50;
  }
}

const NUMBER_PATTERN = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function parseAsciiStl(buffer: Buffer, sink: MeshSink): void {
  const text = buffer.toString('latin1');
  const vertexPattern = /vertex\s+([^\r\n]+)/gi;
  const corners: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = vertexPattern.exec(text)) !== null) {
    const numbers = match[1]!.match(NUMBER_PATTERN);
    if (!numbers || numbers.length < 3) continue;
    corners.push(Number(numbers[0]), Number(numbers[1]), Number(numbers[2]));
    if (corners.length === 9) {
      sink.triangle(
        corners[0]!,
        corners[1]!,
        corners[2]!,
        corners[3]!,
        corners[4]!,
        corners[5]!,
        corners[6]!,
        corners[7]!,
        corners[8]!,
      );
      corners.length = 0;
    }
  }
}

function parseObj(buffer: Buffer, sink: MeshSink): void {
  const text = buffer.toString('utf8');
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const faces: number[][] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    if (line.startsWith('v ') || line.startsWith('v\t')) {
      const numbers = line.slice(2).match(NUMBER_PATTERN);
      if (!numbers || numbers.length < 3) continue;
      xs.push(Number(numbers[0]));
      ys.push(Number(numbers[1]));
      zs.push(Number(numbers[2]));
    } else if (line.startsWith('f ') || line.startsWith('f\t')) {
      const corners: number[] = [];
      for (const token of line.slice(2).trim().split(/\s+/)) {
        // Formatet är v, v/vt, v//vn eller v/vt/vn – bara det första talet är hörnet.
        const index = Number.parseInt(token.split('/')[0]!, 10);
        if (!Number.isFinite(index) || index === 0) continue;
        // Negativa index räknas bakifrån, relativt hörnen som lästs så här långt.
        corners.push(index > 0 ? index - 1 : xs.length + index);
      }
      if (corners.length >= 3) faces.push(corners);
    }
  }

  if (xs.length === 0) throw new ModelParseError('OBJ-filen saknar hörn.');

  for (const corners of faces) {
    // Polygoner trianguleras som en fläkt från första hörnet.
    for (let i = 1; i + 1 < corners.length; i += 1) {
      const a = corners[0]!;
      const b = corners[i]!;
      const c = corners[i + 1]!;
      if (a >= xs.length || b >= xs.length || c >= xs.length) continue;
      if (a < 0 || b < 0 || c < 0) continue;
      sink.triangle(xs[a]!, ys[a]!, zs[a]!, xs[b]!, ys[b]!, zs[b]!, xs[c]!, ys[c]!, zs[c]!);
    }
  }
}

/** Faktor till millimeter för enheterna 3MF tillåter. */
const UNIT_SCALE: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

type Matrix = readonly number[]; // 3×4, radvis: m00..m02, m10..m12, m20..m22, tx ty tz

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function parseMatrix(raw: string | undefined): Matrix {
  if (!raw) return IDENTITY;
  const numbers = raw.trim().split(/\s+/).map(Number);
  if (numbers.length !== 12 || numbers.some((n) => !Number.isFinite(n))) return IDENTITY;
  return numbers;
}

function multiply(outer: Matrix, inner: Matrix): Matrix {
  const result: number[] = new Array(12).fill(0);
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

function applyMatrix(m: Matrix, x: number, y: number, z: number): [number, number, number] {
  return [
    x * m[0]! + y * m[3]! + z * m[6]! + m[9]!,
    x * m[1]! + y * m[4]! + z * m[7]! + m[10]!,
    x * m[2]! + y * m[5]! + z * m[8]! + m[11]!,
  ];
}

interface ThreeMfObject {
  vertices: number[];
  triangles: number[];
  /** Delar som i sin tur pekar på andra objekt, med egen transform. */
  components: Array<{ objectId: string; transform: Matrix }>;
}

/**
 * 3MF är en zip med en XML-modell. Vi plockar ut modellen, läser hörnen och
 * trianglarna, och följer bygglistans transformer så att skalade delar mäts rätt.
 * Returnerar antalet delar som faktiskt byggs.
 */
function parse3mf(buffer: Buffer, sink: MeshSink): number {
  const xml = readModelFromZip(buffer).toString('utf8');

  const unitMatch = /<model\b[^>]*\bunit\s*=\s*"([^"]+)"/i.exec(xml);
  const unitScale = UNIT_SCALE[unitMatch?.[1]?.toLowerCase() ?? 'millimeter'] ?? 1;

  const objects = new Map<string, ThreeMfObject>();
  const objectPattern = /<object\b([^>]*)>([\s\S]*?)<\/object>/gi;
  let objectMatch: RegExpExecArray | null;
  while ((objectMatch = objectPattern.exec(xml)) !== null) {
    const id = attribute(objectMatch[1]!, 'id');
    if (!id) continue;
    objects.set(id, readObject(objectMatch[2]!));
  }
  // Ett objekt utan innehåll skrivs som <object .../>, och har ingen mesh att mäta.

  const items: Array<{ objectId: string; transform: Matrix }> = [];
  const buildMatch = /<build\b[^>]*>([\s\S]*?)<\/build>/i.exec(xml);
  if (buildMatch) {
    const itemPattern = /<item\b([^>]*)\/?>/gi;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemPattern.exec(buildMatch[1]!)) !== null) {
      const objectId = attribute(itemMatch[1]!, 'objectid');
      if (objectId) {
        items.push({ objectId, transform: parseMatrix(attribute(itemMatch[1]!, 'transform')) });
      }
    }
  }
  // Saknas bygglistan mäter vi objekten som de ligger.
  if (items.length === 0) {
    for (const id of objects.keys()) items.push({ objectId: id, transform: IDENTITY });
  }
  if (items.length === 0) throw new ModelParseError('3MF-filen innehåller ingen modell.');

  const scale: Matrix = [unitScale, 0, 0, 0, unitScale, 0, 0, 0, unitScale, 0, 0, 0];
  let emitted = 0;
  for (const item of items) {
    emitted += emitObject(item.objectId, multiply(scale, item.transform), objects, sink, 0);
  }
  if (emitted === 0) throw new ModelParseError('3MF-filen innehåller ingen geometri.');
  return items.length;
}

function readObject(body: string): ThreeMfObject {
  const vertices: number[] = [];
  const vertexPattern = /<vertex\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = vertexPattern.exec(body)) !== null) {
    vertices.push(
      Number(attribute(match[1]!, 'x') ?? NaN),
      Number(attribute(match[1]!, 'y') ?? NaN),
      Number(attribute(match[1]!, 'z') ?? NaN),
    );
  }

  const triangles: number[] = [];
  const trianglePattern = /<triangle\b([^>]*)\/?>/gi;
  while ((match = trianglePattern.exec(body)) !== null) {
    triangles.push(
      Number.parseInt(attribute(match[1]!, 'v1') ?? '', 10),
      Number.parseInt(attribute(match[1]!, 'v2') ?? '', 10),
      Number.parseInt(attribute(match[1]!, 'v3') ?? '', 10),
    );
  }

  const components: ThreeMfObject['components'] = [];
  const componentPattern = /<component\b([^>]*)\/?>/gi;
  while ((match = componentPattern.exec(body)) !== null) {
    const objectId = attribute(match[1]!, 'objectid');
    if (objectId) {
      components.push({ objectId, transform: parseMatrix(attribute(match[1]!, 'transform')) });
    }
  }

  return { vertices, triangles, components };
}

/** Skickar ett objekts trianglar till mätaren och följer dess komponenter. */
function emitObject(
  objectId: string,
  transform: Matrix,
  objects: Map<string, ThreeMfObject>,
  sink: MeshSink,
  depth: number,
): number {
  // Komponenter kan peka i ring; djupgränsen gör att vi aldrig snurrar.
  if (depth > 8) return 0;
  const object = objects.get(objectId);
  if (!object) return 0;

  let emitted = 0;
  const { vertices, triangles } = object;
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    const a = triangles[i]! * 3;
    const b = triangles[i + 1]! * 3;
    const c = triangles[i + 2]! * 3;
    if (a < 0 || b < 0 || c < 0) continue;
    if (a + 2 >= vertices.length || b + 2 >= vertices.length || c + 2 >= vertices.length) continue;
    const [ax, ay, az] = applyMatrix(transform, vertices[a]!, vertices[a + 1]!, vertices[a + 2]!);
    const [bx, by, bz] = applyMatrix(transform, vertices[b]!, vertices[b + 1]!, vertices[b + 2]!);
    const [cx, cy, cz] = applyMatrix(transform, vertices[c]!, vertices[c + 1]!, vertices[c + 2]!);
    if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) continue;
    sink.triangle(ax, ay, az, bx, by, bz, cx, cy, cz);
    emitted += 1;
  }

  for (const component of object.components) {
    emitted += emitObject(
      component.objectId,
      multiply(transform, component.transform),
      objects,
      sink,
      depth + 1,
    );
  }
  return emitted;
}

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attributes);
  return match?.[1];
}

/**
 * 3MF-filen är en vanlig zip. Vi läser den själva i stället för att dra in ett
 * paket: hitta centralkatalogen i slutet, plocka ut posten som är själva
 * modellen och packa upp den med zlib.
 */

/** Uppackad XML får inte svälla fritt – en liten zip kan gömma en enorm fil. */
const MAX_MODEL_XML_BYTES = 192 * 1024 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;

function readModelFromZip(buffer: Buffer): Buffer {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd === undefined) {
    throw new ModelParseError('3MF-filen är skadad – zip-strukturen går inte att läsa.');
  }

  const entries = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (centralOffset === ZIP64_MARKER) {
    throw new ModelParseError('3MF-filen använder zip64, som vi inte läser automatiskt.');
  }

  let offset = centralOffset;
  let best: { name: string; method: number; compressedSize: number; localOffset: number } | undefined;

  for (let i = 0; i < entries; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');

    if (name.toLowerCase().endsWith('.model')) {
      const candidate = { name, method, compressedSize, localOffset };
      // Standarden lägger modellen i 3D/3dmodel.model; den vinner över andra.
      if (!best || name.toLowerCase() === '3d/3dmodel.model') best = candidate;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (!best) throw new ModelParseError('3MF-filen innehåller ingen modellfil.');
  if (best.compressedSize === ZIP64_MARKER) {
    throw new ModelParseError('3MF-filen använder zip64, som vi inte läser automatiskt.');
  }

  const local = best.localOffset;
  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) {
    throw new ModelParseError('3MF-filen är skadad – modellens post pekar fel.');
  }
  // Längderna i den lokala posten kan skilja sig från centralkatalogens, så
  // datans startpunkt räknas alltid ut härifrån.
  const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
  const data = buffer.subarray(dataStart, dataStart + best.compressedSize);
  if (data.length === 0) throw new ModelParseError('3MF-filens modell är tom.');

  if (best.method === 0) return data;
  if (best.method !== 8) {
    throw new ModelParseError('3MF-filen är packad med en metod vi inte stöder.');
  }
  try {
    return inflateRawSync(data, { maxOutputLength: MAX_MODEL_XML_BYTES });
  } catch {
    throw new ModelParseError('3MF-filens modell gick inte att packa upp.');
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number | undefined {
  // Posten ligger sist, men kan följas av en kommentar på upp till 64 kB.
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= earliest; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return undefined;
}
