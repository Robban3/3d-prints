import { listOrders, updateOrder } from './store.ts';
import { deleteUpload, readMeta } from './uploads.ts';

export const CUSTOMER_FILE_RETENTION_DAYS = 90;
export async function minimizeCustomerData(email: string): Promise<{ minimized: number; active: number }> {
  let minimized = 0;
  let active = 0;
  for (const order of await listOrders()) {
    if (order.customer.email.trim().toLowerCase() !== email) continue;
    if (!['levererad', 'avbruten'].includes(order.status)) { active++; continue; }
    if (order.type === 'custom' && order.fileId) {
      const meta = await readMeta(order.fileId);
      if (meta && (meta.kind === 'library' || meta.kind === 'image' || meta.claimedBy !== order.id)) continue;
      if (meta) await deleteUpload(meta.id);
    }
    await updateOrder(order.id, current => {
      const customer = { ...current.customer, phone: '', note: '' };
      const production = current.production ? { ...current.production, notes: '', revision: current.production.revision + 1 } : undefined;
      const history = current.history.map(({ note, ...event }) => event);
      if (current.type === 'shop') return { ...current, customer, history, production };
      const { fileId, fileName, fileUrl, fileSize, ...retained } = current;
      return { ...retained, customer, history, production, description: '', projectName: 'Eget printjobb' };
    });
    minimized++;
  }
  return { minimized, active };
}

export async function sweepCustomerFiles(now = Date.now()): Promise<number> {
  let removed = 0;
  for (const order of await listOrders()) {
    if (order.type !== 'custom' || !order.fileId || !['levererad', 'avbruten'].includes(order.status)) continue;
    const closed = order.history.filter(event => event.status === order.status).at(-1);
    const closedAt = closed ? Date.parse(closed.at) : NaN;
    if (!Number.isFinite(closedAt) || now - closedAt < CUSTOMER_FILE_RETENTION_DAYS * 86400000) continue;
    const meta = await readMeta(order.fileId);
    // Never delete a catalog image, our own library, or a file linked to another order.
    if (meta && (meta.kind === 'image' || meta.kind === 'library' || meta.claimedBy !== order.id)) continue;
    if (meta) await deleteUpload(meta.id);
    await updateOrder(order.id, current => {
      if (current.type !== 'custom' || current.fileId !== order.fileId) return current;
      const { fileId, fileName, fileUrl, fileSize, ...retained } = current;
      return retained;
    });
    removed++;
  }
  return removed;
}
