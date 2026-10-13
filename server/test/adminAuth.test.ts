import { strict as assert } from 'node:assert';
import { after, before, beforeEach, it } from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { admin } from '../src/adminRoutes.ts';
import { resetRateLimit } from '../src/rateLimit.ts';

let directory: string, base: string, server: Server;
const key = 'bootstrap-test-only-0123456789';
const password = 'test-only-long-password-123';
let cookie = '';
async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'formlabb-auth-'));
  process.env.ADMIN_ACCOUNT_STORE = join(directory, 'account.json');
  process.env.ADMIN_TOKEN = key; process.env.ADMIN_EMAIL = 'admin@formlabb.se';
  process.env.MAIL_OUTBOX = join(directory, 'outbox');
  const app = express(); app.use(express.json()); app.use('/api', admin);
  await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  base = `http://127.0.0.1:${address.port}/api/admin`;
});
beforeEach(() => resetRateLimit());
after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  // Exact directory created by mkdtemp for this test.
  await rm(directory, { recursive: true, force: true });
  for (const key of ['ADMIN_ACCOUNT_STORE', 'ADMIN_TOKEN', 'ADMIN_EMAIL', 'MAIL_OUTBOX']) delete process.env[key];
});
it('kräver befintlig adminnyckel för första aktivering och avvisar kort lösenord', async () => {
  assert.equal((await request('/auth/setup', { password })).status, 401);
  assert.equal((await request('/auth/setup', { password: 'short' }, { Authorization: `Bearer ${key}` })).status, 400);
  assert.equal((await request('/status')).status, 200);
});
it('aktiverar kontot med saltad hash och skyddad cookie, endast en gång', async () => {
  const response = await request('/auth/setup', { password }, { Authorization: `Bearer ${key}` });
  assert.equal(response.status, 201);
  const header = response.headers.get('set-cookie')!;
  assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/); assert.match(header, /Path=\/api\/admin/);
  cookie = header.split(';')[0]!;
  const stored = await readFile(process.env.ADMIN_ACCOUNT_STORE!, 'utf8');
  assert.ok(!stored.includes(password)); assert.equal(JSON.parse(stored).email, 'admin@formlabb.se');
  assert.equal((await request('/auth/setup', { password }, { Authorization: `Bearer ${key}` })).status, 409);
});
it('skyddar admin med cookie och avvisar enbart sessionsmarkören', async () => {
  assert.equal((await request('/appearance', undefined, { Authorization: 'Bearer session' })).status, 401);
  assert.equal((await request('/appearance', undefined, { Authorization: 'Bearer session', Cookie: cookie })).status, 200);
  assert.equal((await request('/status', undefined, { Cookie: cookie })).headers.get('cache-control'), 'no-store');
});
it('avvisar fel lösenord/epost med samma fel och loggar in med rätt uppgifter', async () => {
  const wrongPassword = await request('/auth/login', { email: 'admin@formlabb.se', password: 'incorrect-long-password' });
  const wrongEmail = await request('/auth/login', { email: 'other@example.com', password });
  assert.equal(wrongPassword.status, 401); assert.deepEqual(await wrongPassword.json(), await wrongEmail.json());
  const correct = await request('/auth/login', { email: 'ADMIN@FORMLABB.SE', password });
  assert.equal(correct.status, 200); cookie = correct.headers.get('set-cookie')!.split(';')[0]!;
});
it('tillåter den publika domänen bakom containerproxyn och avvisar andra ursprung', async () => {
  const previous = process.env.PUBLIC_URL;
  process.env.PUBLIC_URL = 'https://formlabb.se';
  try {
    const headers = { Origin: 'https://formlabb.se', Host: 'container' };
    assert.equal((await request('/auth/login', { email: 'admin@formlabb.se', password }, headers)).status, 200);
    assert.equal((await request('/auth/logout', {}, headers)).status, 200);
    assert.equal((await request('/auth/login', {}, { ...headers, Origin: 'https://attacker.example' })).status, 403);
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_URL;
    else process.env.PUBLIC_URL = previous;
  }
});

it('avvisar främmande ursprung och begränsar inloggningsförsök', async () => {
  assert.equal((await request('/auth/login', { email: 'admin@formlabb.se', password }, { Origin: 'https://attacker.example' })).status, 403);
  for (let i = 0; i < 10; i++) assert.equal((await request('/auth/login', { email: 'x', password: 'x' })).status, 401);
  assert.equal((await request('/auth/login', { email: 'x', password: 'x' })).status, 429);
});
it('loggar ut och ogiltigförklarar sessionen på servern', async () => {
  assert.equal((await request('/auth/logout', {}, { Cookie: cookie })).status, 200);
  assert.equal((await request('/appearance', undefined, { Authorization: 'Bearer session', Cookie: cookie })).status, 401);
});
it('återställning avslöjar inte okända adresser, gäller en gång och spärrar gamla sessioner', async () => {
  const login = await request('/auth/login', { email: 'admin@formlabb.se', password });
  const oldCookie = login.headers.get('set-cookie')!.split(';')[0]!;
  const unknown = await request('/auth/forgot', { email: 'unknown@example.com' });
  const known = await request('/auth/forgot', { email: 'admin@formlabb.se' });
  assert.deepEqual(await unknown.json(), await known.json());
  const mails = await readdir(process.env.MAIL_OUTBOX!);
  const mail = await readFile(join(process.env.MAIL_OUTBOX!, mails[0]!), 'utf8');
  const token = mail.match(/aterstall=([a-f0-9]{64})/)![1]!;
  const stored = await readFile(process.env.ADMIN_ACCOUNT_STORE!, 'utf8'); assert.ok(!stored.includes(token));
  const newPassword = 'another-test-only-password';
  assert.equal((await request('/auth/reset', { token, password: newPassword })).status, 200);
  assert.equal((await request('/auth/reset', { token, password: newPassword })).status, 400);
  assert.equal((await request('/appearance', undefined, { Authorization: 'Bearer session', Cookie: oldCookie })).status, 401);
  assert.equal((await request('/auth/login', { email: 'admin@formlabb.se', password })).status, 401);
  assert.equal((await request('/auth/login', { email: 'admin@formlabb.se', password: newPassword })).status, 200);
});
it('avvisar utgångna återställningslänkar', async () => {
  await request('/auth/forgot', { email: 'admin@formlabb.se' });
  const path = process.env.ADMIN_ACCOUNT_STORE!;
  const account = JSON.parse(await readFile(path, 'utf8')); account.reset.expires = Date.now() - 1;
  await writeFile(path, JSON.stringify(account));
  const mails = (await readdir(process.env.MAIL_OUTBOX!)).sort();
  const mail = await readFile(join(process.env.MAIL_OUTBOX!, mails.at(-1)!), 'utf8');
  const token = mail.match(/aterstall=([a-f0-9]{64})/)![1]!;
  assert.equal((await request('/auth/reset', { token, password })).status, 400);
});
