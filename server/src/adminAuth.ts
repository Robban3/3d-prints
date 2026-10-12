import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { readFile, rename, writeFile } from './stateFiles.ts';
import { dirname, resolve } from 'node:path';
import type { Request, Response } from 'express';

const scrypt = promisify(scryptCallback);
const file = () => resolve(process.env.ADMIN_ACCOUNT_STORE ?? 'data/admin-account.json');
export const adminEmail = () => (process.env.ADMIN_EMAIL ?? 'admin@formlabb.se').trim().toLowerCase();
interface Account { email: string; salt: string; hash: string; reset?: { hash: string; expires: number } }
let queue: Promise<unknown> = Promise.resolve();
export async function readAccount(): Promise<Account | null> {
  try {
    const account = JSON.parse(await readFile(file(), 'utf8')) as Account;
    if (!account.email || !/^[a-f0-9]{32}$/.test(account.salt) || !/^[a-f0-9]{128}$/.test(account.hash)) throw new Error('Ogiltig kontolagring');
    return account;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function save(account: Account) {
  const path = file();
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(account), { mode: 0o600 });
  await rename(temporary, path);
}
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action, action); queue = result.catch(() => undefined); return result;
}
export function validPassword(password: unknown): password is string { return typeof password === 'string' && password.length >= 12 && password.length <= 128; }
async function passwordAccount(email: string, password: string): Promise<Account> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64) as Buffer).toString('hex');
  return { email, salt, hash };
}
export function activateAccount(password: string): Promise<boolean> {
  return serialized(async () => {
    if (await readAccount()) return false;
    await save(await passwordAccount(adminEmail(), password)); return true;
  });
}
export async function verifyPassword(email: unknown, password: unknown): Promise<boolean> {
  const account = await readAccount();
  // Equal-cost hashing also for an unknown email / an unconfigured account.
  const supplied = typeof password === 'string' && password.length <= 128 ? password : '';
  const derived = await scrypt(supplied, account?.salt ?? '00000000000000000000000000000000', 64) as Buffer;
  const expected = account ? Buffer.from(account.hash, 'hex') : Buffer.alloc(64);
  return timingSafeEqual(derived, expected) && !!account && typeof email === 'string' && email.trim().toLowerCase() === account.email;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const sessions = new Map<string, number>();
const COOKIE = 'formlabb_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
function cookie(req: Request): string {
  return req.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
}
export function validSession(req: Request): boolean {
  const token = cookie(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const key = digest(token), expires = sessions.get(key);
  if (!expires || expires <= Date.now()) { sessions.delete(key); return false; }
  return true;
}
function cookieOptions() { return { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/api/admin' }; }
export function startSession(res: Response) {
  for (const [key, expiry] of sessions) if (expiry <= Date.now()) sessions.delete(key);
  const token = randomBytes(32).toString('hex'); sessions.set(digest(token), Date.now() + SESSION_MS);
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MS });
}
export function endSession(req: Request, res: Response) { sessions.delete(digest(cookie(req))); res.clearCookie(COOKIE, cookieOptions()); }
export function createReset(email: unknown): Promise<{ email: string; token: string } | null> {
  return serialized(async () => {
    const account = await readAccount();
    if (!account || typeof email !== 'string' || email.trim().toLowerCase() !== account.email) return null;
    const token = randomBytes(32).toString('hex'); account.reset = { hash: digest(token), expires: Date.now() + 30 * 60 * 1000 };
    await save(account); return { email: account.email, token };
  });
}
export function resetPassword(token: unknown, password: string): Promise<boolean> {
  return serialized(async () => {
    const account = await readAccount();
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !account?.reset || account.reset.expires <= Date.now() || account.reset.hash !== digest(token)) return false;
    await save(await passwordAccount(account.email, password)); sessions.clear(); return true;
  });
}
