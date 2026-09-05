import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { AnyOrder } from "./types.ts";

const DATA_FILE = resolve(process.env.ORDER_STORE ?? "data/orders.json");

/**
 * Enkel filbaserad orderlagring. Skrivningarna serialiseras via en promise-kedja
 * så att två samtidiga beställningar inte skriver över varandra. Räcker gott för
 * en butik i den här storleken – byt implementationen mot en databas när volymen
 * kräver det, gränssnittet nedan är detsamma.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<AnyOrder[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnyOrder[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function generateOrderNumber(prefix: "S" | "C"): string {
  const year = new Date().getFullYear();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${prefix}${year}-${suffix}`;
}

export async function saveOrder<T extends AnyOrder>(order: T): Promise<T> {
  return serialize(async () => {
    const orders = await readAll();
    orders.push(order);
    await mkdir(dirname(DATA_FILE), { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(orders, null, 2), "utf8");
    return order;
  });
}

export async function findOrder(id: string): Promise<AnyOrder | undefined> {
  const orders = await readAll();
  return orders.find((order) => order.id.toLowerCase() === id.toLowerCase());
}

export async function listOrders(): Promise<AnyOrder[]> {
  const orders = await readAll();
  return [...orders].reverse();
}
