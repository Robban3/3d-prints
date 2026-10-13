import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AnyOrder } from './types.ts';

const developmentKey = randomBytes(32).toString('hex');
export function orderAccessToken(order: AnyOrder): string {
  const secret = process.env.ORDER_ACCESS_SECRET ?? process.env.ADMIN_TOKEN;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 16)) {
    throw new Error('Order access signing key is not configured');
  }
  return createHmac('sha256', secret ?? developmentKey)
    .update(JSON.stringify(['formlabb-order-access-v1', order.id, order.createdAt]))
    .digest('hex');
}

export function validOrderAccess(order: AnyOrder, authorization: string | undefined): boolean {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  return /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(orderAccessToken(order), 'hex'));
}

export function orderTrackingUrl(order: AnyOrder): string {
  const base = process.env.PUBLIC_URL ?? 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/spara-order?id=${encodeURIComponent(order.id)}#access=${orderAccessToken(order)}`;
}
