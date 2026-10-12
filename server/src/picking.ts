import { weightFor } from './parameters.ts';
import type { AnyOrder, MaterialId, OrderStatus, Product } from './types.ts';

/**
 * Plocklistan: vad verkstaden ska göra i ordning, sammanslaget över ordrarna.
 *
 * Att plocka en order i taget betyder att gå till samma hylla fem gånger. Här
 * slås raderna ihop på produkt, färg, storlek och mått, så varje sak hämtas en
 * gång – men varje rad bär med sig vilka ordrar den gäller, för plocket är
 * meningslöst om sakerna sedan hamnar i fel låda.
 *
 * Egna printjobb slås inte ihop. De är unika per order och hör hemma i en egen
 * lista.
 *
 * Ren räkning: modulen vet ingenting om disk eller HTTP.
 */

export interface PickOrderRef {
  id: string;
  customer: string;
  quantity: number;
}

export interface PickRow {
  /** Stabil nyckel för raden, så kryssrutor i listan kan hålla isär dem. */
  key: string;
  productId: string;
  name: string;
  color: string;
  size?: string;
  parameterText?: string;
  quantity: number;
  material?: MaterialId;
  /** Beräknad materialåtgång för hela raden. */
  grams?: number;
  orders: PickOrderRef[];
}

export interface PickJob {
  orderId: string;
  customer: string;
  projectName: string;
  material: MaterialId;
  quality: string;
  quantity: number;
  fileName?: string;
  /** Kundens egen beskrivning, som ofta säger något plocklistan inte gör. */
  description: string;
}

export interface PickList {
  generatedAt: string;
  statuses: OrderStatus[];
  rows: PickRow[];
  jobs: PickJob[];
  /** Antal ordrar listan bygger på. */
  orders: number;
  /** Antal exemplar att plocka, egna printjobb inräknade. */
  items: number;
}

function rowKey(line: {
  productId: string;
  color: string;
  size?: string;
  parameterText?: string;
}): string {
  return [line.productId, line.color, line.size ?? '-', line.parameterText ?? '-'].join('|');
}

/**
 * Bygger listan ur de ordrar som skickas in. Urvalet görs av anroparen – den
 * vet om det är dagens mottagna ordrar eller en handplockad skörd.
 */
export function buildPickList(input: {
  orders: AnyOrder[];
  products?: Product[];
  now?: Date;
}): PickList {
  const products = new Map((input.products ?? []).map((product) => [product.id, product]));
  const rows = new Map<string, PickRow>();
  const jobs: PickJob[] = [];
  const statuses = new Set<OrderStatus>();

  for (const order of input.orders) {
    statuses.add(order.status);

    if (order.type === 'custom') {
      jobs.push({
        orderId: order.id,
        customer: order.customer.name,
        projectName: order.projectName,
        material: order.request.material,
        quality: order.request.quality,
        quantity: order.request.quantity,
        ...(order.fileName ? { fileName: order.fileName } : {}),
        description: order.description,
      });
      continue;
    }

    for (const line of order.lines) {
      const key = rowKey(line);
      const product = products.get(line.productId);
      const existing = rows.get(key);
      const grams = product ? weightFor(product, line.parameters ?? {}) * line.quantity : 0;

      if (existing) {
        existing.quantity += line.quantity;
        if (existing.grams !== undefined) existing.grams += grams;
        existing.orders.push({
          id: order.id,
          customer: order.customer.name,
          quantity: line.quantity,
        });
        continue;
      }

      rows.set(key, {
        key,
        productId: line.productId,
        name: line.name,
        color: line.color,
        ...(line.size ? { size: line.size } : {}),
        ...(line.parameterText ? { parameterText: line.parameterText } : {}),
        quantity: line.quantity,
        ...(product ? { material: product.material, grams } : {}),
        orders: [{ id: order.id, customer: order.customer.name, quantity: line.quantity }],
      });
    }
  }

  const sorted = [...rows.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'sv') || a.color.localeCompare(b.color, 'sv'),
  );
  for (const row of sorted) {
    if (row.grams !== undefined) row.grams = Math.round(row.grams);
  }

  const items =
    sorted.reduce((sum, row) => sum + row.quantity, 0) +
    jobs.reduce((sum, job) => sum + job.quantity, 0);

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    statuses: [...statuses].sort(),
    rows: sorted,
    jobs: jobs.sort((a, b) => a.orderId.localeCompare(b.orderId)),
    orders: input.orders.length,
    items,
  };
}
