import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Användare med roller, i stället för en delad nyckel.
 *
 * En nyckel som alla känner till kan inte tas ifrån någon, och loggen visar
 * bara att "admin" gjorde något. Med användare går det att se vem som flyttade
 * ordern, och att stänga av en person utan att alla andra måste byta nyckel.
 *
 * Rollerna är få med flit. Tre roller som betyder något är lättare att förvalta
 * än tjugo kryssrutor som ingen orkar hålla rätt på.
 *
 * Lösenord sparas som scrypt-hash med eget salt per användare. Sessioner sparas
 * som sha256 av sin token: filen ska inte innehålla något som går att logga in
 * med om den kommer på villovägar.
 */

const USER_FILE = () => resolve(process.env.USER_STORE ?? 'data/anvandare.json');

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

export const ROLES = ['agare', 'verkstad', 'redaktor'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'ordrar',
  'produktion',
  'katalog',
  'innehall',
  'statistik',
  'anvandare',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Vad varje roll får göra. Ägaren får allt; de andra får sitt arbete. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  agare: PERMISSIONS,
  verkstad: ['ordrar', 'produktion'],
  redaktor: ['katalog', 'innehall', 'statistik'],
};

export const ROLE_LABELS: Record<Role, string> = {
  agare: 'Ägare',
  verkstad: 'Verkstad',
  redaktor: 'Redaktör',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

interface StoredUser extends User {
  salt: string;
  hash: string;
}

interface StoredSession {
  /** sha256 av token. Filen ska inte gå att logga in med. */
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface UserStore {
  users: StoredUser[];
  sessions: StoredSession[];
}

export class UserError extends Error {
  readonly fields: Record<string, string>;
  /** 400 för trasiga uppgifter, 401 för en inloggning som inte gick igenom. */
  readonly status: number;

  constructor(message: string, fields: Record<string, string> = {}, status = 400) {
    super(message);
    this.name = 'UserError';
    this.fields = fields;
    this.status = status;
  }
}

let cache: UserStore | null = null;
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function resetUserCache(): void {
  cache = null;
}

async function load(): Promise<UserStore> {
  if (cache) return cache;
  try {
    const raw = await readFile(USER_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<UserStore>;
    cache = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    cache = { users: [], sessions: [] };
  }
  return cache;
}

async function persist(store: UserStore): Promise<void> {
  cache = store;
  await mkdir(dirname(USER_FILE()), { recursive: true });
  await writeFile(USER_FILE(), JSON.stringify(store, null, 2), 'utf8');
}

/** Sessionens längd i timmar. En arbetsdag, inte en evighet. */
function sessionHours(): number {
  const raw = Number(process.env.SESSION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 12;
}

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return (await scryptAsync(password, salt, KEY_LENGTH)).toString('hex');
}

/** Tar bort lösenordshashen innan användaren lämnar modulen. */
function publicUser(user: StoredUser): User {
  const { salt: _salt, hash: _hash, ...rest } = user;
  return rest;
}

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Kraven på lösenordet är avsiktligt enkla: längd är det som faktiskt hjälper,
 * och regler om tecken får folk att skriva lappar.
 */
export function checkPassword(value: unknown): string {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 12) {
    throw new UserError('Lösenordet behöver minst 12 tecken.', {
      password: 'Minst 12 tecken.',
    });
  }
  if (password.length > 200) {
    throw new UserError('Lösenordet är för långt.', { password: 'Högst 200 tecken.' });
  }
  return password;
}

export async function allUsers(): Promise<User[]> {
  const store = await load();
  return store.users.map(publicUser).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

export async function userCount(): Promise<number> {
  return (await load()).users.length;
}

export async function findUser(id: string): Promise<User | undefined> {
  const user = (await load()).users.find((entry) => entry.id === id);
  return user ? publicUser(user) : undefined;
}

export interface NewUser {
  email: unknown;
  name: unknown;
  role: unknown;
  password: unknown;
}

export async function createUser(input: NewUser): Promise<User> {
  const email = normalizeEmail(input.email);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const fields: Record<string, string> = {};

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = 'Skriv en giltig mejladress.';
  if (name.length < 2) fields.name = 'Namnet behöver minst två tecken.';
  if (!isRole(input.role)) fields.role = 'Välj en roll som finns.';
  if (Object.keys(fields).length > 0) throw new UserError('Kontrollera fälten nedan', fields);

  const password = checkPassword(input.password);
  const role = input.role as Role;

  return serialize(async () => {
    const store = await load();
    if (store.users.some((entry) => entry.email === email)) {
      throw new UserError('Mejladressen används redan.', { email: 'Adressen finns redan.' });
    }

    const salt = randomBytes(16).toString('hex');
    const user: StoredUser = {
      id: randomUUID(),
      email,
      name,
      role,
      active: true,
      createdAt: new Date().toISOString(),
      salt,
      hash: await hashPassword(password, salt),
    };
    await persist({ ...store, users: [...store.users, user] });
    return publicUser(user);
  });
}

export interface UserPatch {
  name?: unknown;
  role?: unknown;
  active?: unknown;
  password?: unknown;
}

export async function updateUser(id: string, patch: UserPatch): Promise<User | undefined> {
  const name = typeof patch.name === 'string' ? patch.name.trim() : undefined;
  if (name !== undefined && name.length < 2) {
    throw new UserError('Kontrollera fälten nedan', { name: 'Namnet behöver minst två tecken.' });
  }
  if (patch.role !== undefined && !isRole(patch.role)) {
    throw new UserError('Kontrollera fälten nedan', { role: 'Välj en roll som finns.' });
  }
  const password = patch.password === undefined ? undefined : checkPassword(patch.password);

  return serialize(async () => {
    const store = await load();
    const index = store.users.findIndex((entry) => entry.id === id);
    if (index === -1) return undefined;

    const current = store.users[index]!;
    const next: StoredUser = {
      ...current,
      ...(name !== undefined ? { name } : {}),
      ...(patch.role !== undefined ? { role: patch.role as Role } : {}),
      ...(patch.active !== undefined ? { active: patch.active === true } : {}),
    };

    if (password !== undefined) {
      next.salt = randomBytes(16).toString('hex');
      next.hash = await hashPassword(password, next.salt);
    }

    const users = [...store.users];
    users[index] = next;
    // Ett byte av lösenord eller en avstängning ska gälla direkt, inte när
    // sessionen råkar löpa ut.
    const sessions =
      password !== undefined || next.active !== current.active
        ? store.sessions.filter((session) => session.userId !== id)
        : store.sessions;

    await persist({ users, sessions });
    return publicUser(next);
  });
}

export async function removeUser(id: string): Promise<boolean> {
  return serialize(async () => {
    const store = await load();
    const users = store.users.filter((entry) => entry.id !== id);
    if (users.length === store.users.length) return false;
    await persist({ users, sessions: store.sessions.filter((entry) => entry.userId !== id) });
    return true;
  });
}

/** Antal aktiva ägare, så den sista inte kan stängas av eller tas bort. */
export async function activeOwners(exceptId?: string): Promise<number> {
  const store = await load();
  return store.users.filter((user) => user.role === 'agare' && user.active && user.id !== exceptId)
    .length;
}

export interface Session {
  token: string;
  user: User;
  expiresAt: string;
}

/**
 * Loggar in. Fel adress och fel lösenord ger samma svar: att skilja dem åt
 * vore att tala om vilka adresser som finns.
 */
export async function login(emailInput: unknown, passwordInput: unknown): Promise<Session> {
  const email = normalizeEmail(emailInput);
  const password = typeof passwordInput === 'string' ? passwordInput : '';
  const store = await load();
  const user = store.users.find((entry) => entry.email === email);

  // Räkna ändå på ett låtsassalt när användaren inte finns, så svarstiden
  // inte avslöjar vilka adresser som är registrerade.
  const salt = user?.salt ?? 'ingen-anvandare';
  const attempt = await hashPassword(password, salt);
  const expected = user?.hash ?? attempt.replace(/./g, '0');

  const a = Buffer.from(attempt, 'hex');
  const b = Buffer.from(expected, 'hex');
  const same = a.length === b.length && timingSafeEqual(a, b);

  if (!user || !same || !user.active) {
    throw new UserError('Fel mejladress eller lösenord.', {}, 401);
  }

  return serialize(async () => {
    const current = await load();
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionHours() * 3_600_000).toISOString();

    const users = current.users.map((entry) =>
      entry.id === user.id ? { ...entry, lastLoginAt: now.toISOString() } : entry,
    );
    const sessions = [
      // Utgångna sessioner städas bort vid varje inloggning.
      ...current.sessions.filter((session) => session.expiresAt > now.toISOString()),
      { token: digest(token), userId: user.id, createdAt: now.toISOString(), expiresAt },
    ];

    await persist({ users, sessions });
    const stored = users.find((entry) => entry.id === user.id)!;
    return { token, user: publicUser(stored), expiresAt };
  });
}

/** Användaren bakom en sessionstoken, eller undefined när den inte gäller. */
export async function userForToken(token: string): Promise<User | undefined> {
  if (!token) return undefined;
  const store = await load();
  const session = store.sessions.find((entry) => entry.token === digest(token));
  if (!session || session.expiresAt <= new Date().toISOString()) return undefined;

  const user = store.users.find((entry) => entry.id === session.userId);
  if (!user || !user.active) return undefined;
  return publicUser(user);
}

/**
 * Vem som är inloggad. `key: true` betyder startnyckeln, inte en person.
 */
export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
  key: boolean;
}

const BOOTSTRAP: Actor = {
  id: 'startnyckel',
  name: 'Startnyckeln',
  email: '',
  role: 'agare',
  key: true,
};

function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Jämförelsen görs i konstant tid så att svarstiden inte avslöjar nyckeln.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Löser upp vem en token tillhör.
 *
 * Startnyckeln gäller bara så länge det inte finns en enda användare: den är
 * till för att skapa den första ägaren, inte för att leva vid sidan av
 * inloggningen. När någon har skapats är nyckeln död, och det är hela poängen –
 * en nyckel som alla känner till kan inte tas ifrån någon.
 */
export async function actorFor(token: string, bootstrapKey?: string): Promise<Actor | undefined> {
  if (!token) return undefined;

  const user = await userForToken(token);
  if (user) return { id: user.id, name: user.name, email: user.email, role: user.role, key: false };

  if (bootstrapKey && (await userCount()) === 0 && sameSecret(token, bootstrapKey)) {
    return BOOTSTRAP;
  }
  return undefined;
}

export async function logout(token: string): Promise<void> {
  if (!token) return;
  await serialize(async () => {
    const store = await load();
    const wanted = digest(token);
    await persist({
      ...store,
      sessions: store.sessions.filter((session) => session.token !== wanted),
    });
  });
}
