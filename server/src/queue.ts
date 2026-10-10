import { printProgress, productionHoursFor } from './progress.ts';
import { printTimeFor, weightFor } from './parameters.ts';
import type { AnyOrder, MaterialId, Product } from './types.ts';

/**
 * Produktionskön: vad som ska printas, i vilken ordning, och när det blir klart.
 *
 * Verkstaden har ett antal skrivare som går dygnet runt. Kön räknas fram ur
 * ordrarna varje gång i stället för att hållas som ett eget register – en kö som
 * är en egen sanning hinner alltid bli osann. Jobb som redan står och printar
 * upptar sin skrivare tills de är klara; resten läggs på den skrivare som blir
 * ledig först.
 *
 * Expressjobb går före i kön, men aldrig före något som redan börjat printas:
 * att avbryta ett påbörjat print kostar både tiden och plasten.
 *
 * Allt här är ren räkning. Modulen vet ingenting om disk eller HTTP, så den går
 * att testa med en handfull ordrar och en fast klocka.
 */

const HOUR = 3_600_000;

/** Antal skrivare i verkstaden. Styr hur många jobb som kan gå parallellt. */
export function printerCount(): number {
  const raw = Number(process.env.PRINTERS);
  return Number.isInteger(raw) && raw > 0 ? raw : 2;
}

export interface JobMaterial {
  material: MaterialId;
  color: string;
  grams: number;
}

export interface QueueJob {
  orderId: string;
  type: AnyOrder['type'];
  /** Vad som ska printas, i klartext. */
  label: string;
  customer: string;
  createdAt: string;
  /** 'mottagen' väntar på sin tur, 'i_produktion' står och printar. */
  status: 'mottagen' | 'i_produktion';
  running: boolean;
  rush: boolean;
  /** Hela jobbets beräknade printtid. */
  hours: number;
  /** Timmar som återstår – mindre än hours för ett jobb som redan börjat. */
  remainingHours: number;
  materials: JobMaterial[];
  /** Skrivare 1 och uppåt. */
  printer: number;
  position: number;
  startsAt: string;
  readyAt: string;
  /** Timmar jobbet står och väntar innan det får en skrivare. */
  waitingHours: number;
}

export interface MaterialDemand {
  material: MaterialId;
  color: string;
  grams: number;
}

export interface ProductionQueue {
  jobs: QueueJob[];
  printers: number;
  /** Maskintimmar som ligger kvar i kön. */
  hours: number;
  running: number;
  waiting: number;
  /** När sista jobbet i kön är klart. Saknas när kön är tom. */
  readyAt?: string;
  /** Filamentet kön kräver, per material och färg. */
  demand: MaterialDemand[];
}

/** Ordrar som ska printas. Skickade, levererade och avbrutna är ur kön. */
function inQueue(order: AnyOrder): boolean {
  return order.status === 'mottagen' || order.status === 'i_produktion';
}

function round(hours: number): number {
  return Math.round(hours * 10) / 10;
}

function describe(order: AnyOrder): string {
  if (order.type === 'custom') return order.projectName;
  return order.lines
    .map(
      (line) =>
        `${line.quantity} × ${line.name}${line.parameterText ? ` (${line.parameterText})` : ''}`,
    )
    .join(', ');
}

/** Materialåtgången för ett jobb, utifrån katalogens vikter. */
function materialsFor(order: AnyOrder, products: Map<string, Product>): JobMaterial[] {
  if (order.type === 'custom') {
    const grams = Math.round(order.quote.estimatedWeightGrams);
    return grams > 0 ? [{ material: order.request.material, color: 'valfri', grams }] : [];
  }

  const totals = new Map<string, JobMaterial>();
  for (const line of order.lines) {
    const product = products.get(line.productId);
    // En produkt som tagits bort ur katalogen går inte att väga. Jobbet står
    // kvar i kön ändå – verkstaden ska se att det finns.
    if (!product) continue;
    const grams = weightFor(product, line.parameters ?? {}) * line.quantity;
    const key = `${product.material}|${line.color}`;
    const existing = totals.get(key);
    if (existing) existing.grams += grams;
    else totals.set(key, { material: product.material, color: line.color, grams });
  }
  return [...totals.values()].map((entry) => ({ ...entry, grams: Math.round(entry.grams) }));
}

/**
 * Printtiden för en order. Butiksordrar har sin tid sparad sedan de lades, men
 * en order som lagts innan tiden började sparas räknas om ur katalogen.
 */
function hoursFor(order: AnyOrder, products: Map<string, Product>): number {
  const saved = productionHoursFor(order);
  if (saved !== undefined) return saved;
  if (order.type === 'custom') return 0;

  const hours = order.lines.reduce((sum, line) => {
    const product = products.get(line.productId);
    return sum + (product ? printTimeFor(product, line.parameters ?? {}) * line.quantity : 0);
  }, 0);
  return round(hours);
}

interface Pending {
  order: AnyOrder;
  hours: number;
  remainingHours: number;
  running: boolean;
  rush: boolean;
  materials: JobMaterial[];
}

/**
 * Lägger jobben på skrivarna och räknar ut när vart och ett blir klart.
 *
 * Jobb utan beräknad tid får ändå en plats i kön: de syns med noll timmar i
 * stället för att försvinna ur verkstadens lista.
 */
export function buildQueue(input: {
  orders: AnyOrder[];
  products?: Product[];
  printers?: number;
  now?: Date;
}): ProductionQueue {
  const now = input.now ?? new Date();
  const printers = Math.max(1, input.printers ?? printerCount());
  const products = new Map((input.products ?? []).map((product) => [product.id, product]));

  const pending: Pending[] = input.orders.filter(inQueue).map((order) => {
    const hours = hoursFor(order, products);
    const progress = printProgress(order, now);
    const running = order.status === 'i_produktion';
    return {
      order,
      hours,
      // Ett pågående jobb har redan printat en del av sin tid.
      remainingHours: running ? round(progress?.remainingHours ?? hours) : hours,
      running,
      rush: order.type === 'custom' && order.request.rush,
      materials: materialsFor(order, products),
    };
  });

  // Pågående först, sedan expressjobb, sedan i den ordning de kom in.
  pending.sort((a, b) => {
    if (a.running !== b.running) return a.running ? -1 : 1;
    if (a.rush !== b.rush) return a.rush ? -1 : 1;
    return a.order.createdAt.localeCompare(b.order.createdAt);
  });

  // Varje skrivare är ledig från en viss tidpunkt. Nästa jobb går till den som
  // blir ledig först.
  const free = Array.from({ length: printers }, () => now.getTime());
  const jobs: QueueJob[] = pending.map((entry, index) => {
    let printer = 0;
    for (let i = 1; i < free.length; i += 1) {
      if (free[i]! < free[printer]!) printer = i;
    }
    const startsAt = free[printer]!;
    const readyAt = startsAt + entry.remainingHours * HOUR;
    free[printer] = readyAt;

    return {
      orderId: entry.order.id,
      type: entry.order.type,
      label: describe(entry.order),
      customer: entry.order.customer.name,
      createdAt: entry.order.createdAt,
      status: entry.running ? 'i_produktion' : 'mottagen',
      running: entry.running,
      rush: entry.rush,
      hours: entry.hours,
      remainingHours: entry.remainingHours,
      materials: entry.materials,
      printer: printer + 1,
      position: index + 1,
      startsAt: new Date(startsAt).toISOString(),
      readyAt: new Date(readyAt).toISOString(),
      waitingHours: round((startsAt - now.getTime()) / HOUR),
    };
  });

  const demand = new Map<string, MaterialDemand>();
  for (const job of jobs) {
    for (const entry of job.materials) {
      const key = `${entry.material}|${entry.color}`;
      const existing = demand.get(key);
      if (existing) existing.grams += entry.grams;
      else demand.set(key, { ...entry });
    }
  }

  const last = jobs.reduce((latest, job) => Math.max(latest, Date.parse(job.readyAt)), 0);

  return {
    jobs,
    printers,
    hours: round(jobs.reduce((sum, job) => sum + job.remainingHours, 0)),
    running: jobs.filter((job) => job.running).length,
    waiting: jobs.filter((job) => !job.running).length,
    ...(last > 0 ? { readyAt: new Date(last).toISOString() } : {}),
    demand: [...demand.values()].sort((a, b) => b.grams - a.grams),
  };
}

/** Jobbet för en viss order, så kunden kan få sin plats i kön. */
export function jobFor(queue: ProductionQueue, orderId: string): QueueJob | undefined {
  return queue.jobs.find((job) => job.orderId.toLowerCase() === orderId.toLowerCase());
}
