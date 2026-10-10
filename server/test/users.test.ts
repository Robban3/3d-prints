import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ROLE_PERMISSIONS,
  actorFor,
  UserError,
  activeOwners,
  allUsers,
  can,
  checkPassword,
  createUser,
  findUser,
  isRole,
  login,
  logout,
  normalizeEmail,
  removeUser,
  resetUserCache,
  updateUser,
  userCount,
  userForToken,
} from '../src/users.ts';

let dir: string;
let store: string;

const owner = {
  email: 'Agaren@Example.COM ',
  name: 'Ada Ägare',
  role: 'agare',
  password: 'ett-lagom-langt-losenord',
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-users-'));
  store = join(dir, 'anvandare.json');
  process.env.USER_STORE = store;
  resetUserCache();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.USER_STORE;
  delete process.env.SESSION_HOURS;
  resetUserCache();
});

describe('roller', () => {
  it('ägaren får allt, de andra sitt arbete', () => {
    assert.equal(can('agare', 'anvandare'), true);
    assert.equal(can('verkstad', 'ordrar'), true);
    assert.equal(can('verkstad', 'katalog'), false);
    assert.equal(can('redaktor', 'katalog'), true);
    assert.equal(can('redaktor', 'anvandare'), false);
  });

  it('ingen roll utom ägaren får röra användare', () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === 'agare') continue;
      assert.equal(permissions.includes('anvandare'), false, role);
    }
  });

  it('känner igen giltiga roller', () => {
    assert.equal(isRole('verkstad'), true);
    assert.equal(isRole('chef'), false);
    assert.equal(isRole(undefined), false);
  });
});

describe('skapa användare', () => {
  it('normaliserar mejladressen och sparar aldrig lösenordet', async () => {
    const user = await createUser(owner);
    assert.equal(user.email, 'agaren@example.com');
    assert.equal(user.active, true);

    const raw = await readFile(store, 'utf8');
    assert.equal(raw.includes(owner.password), false);
    // Varken hash eller salt ska läcka ut ur modulen.
    assert.equal((user as Record<string, unknown>).hash, undefined);
    assert.equal((user as Record<string, unknown>).salt, undefined);
  });

  it('avvisar trasiga uppgifter och för korta lösenord', async () => {
    await assert.rejects(() => createUser({ ...owner, email: 'inte-en-adress' }), UserError);
    await assert.rejects(() => createUser({ ...owner, name: 'A' }), UserError);
    await assert.rejects(() => createUser({ ...owner, role: 'chef' }), UserError);
    await assert.rejects(() => createUser({ ...owner, password: 'kort' }), UserError);
  });

  it('pekar ut alla fel på en gång', async () => {
    try {
      await createUser({ email: '', name: '', role: 'chef', password: 'x' });
      assert.fail('förväntade UserError');
    } catch (error) {
      assert.ok(error instanceof UserError);
      for (const field of ['email', 'name', 'role']) assert.ok(error.fields[field], field);
    }
  });

  it('samma mejladress går inte två gånger', async () => {
    await createUser(owner);
    await assert.rejects(() => createUser({ ...owner, email: 'agaren@example.com' }), UserError);
  });

  it('räknar användarna, så första inloggningen kan hanteras för sig', async () => {
    assert.equal(await userCount(), 0);
    await createUser(owner);
    assert.equal(await userCount(), 1);
  });
});

describe('inloggning', () => {
  it('ger en token som pekar tillbaka på användaren', async () => {
    const created = await createUser(owner);
    const session = await login('agaren@example.com', owner.password);

    assert.ok(session.token.length > 20);
    assert.equal(session.user.id, created.id);
    assert.equal((await userForToken(session.token))?.email, 'agaren@example.com');
  });

  it('bryr sig inte om versaler i adressen', async () => {
    await createUser(owner);
    const session = await login('  AGAREN@example.com ', owner.password);
    assert.ok(session.token);
  });

  it('säger samma sak om fel lösenord som om okänd adress', async () => {
    await createUser(owner);
    const errors: string[] = [];
    for (const attempt of [
      () => login('agaren@example.com', 'fel-losenord-men-langt'),
      () => login('finns-inte@example.com', owner.password),
    ]) {
      try {
        await attempt();
        assert.fail('förväntade UserError');
      } catch (error) {
        assert.ok(error instanceof UserError);
        errors.push(error.message);
      }
    }
    assert.equal(errors[0], errors[1]);
  });

  it('en avstängd användare kommer inte in', async () => {
    const user = await createUser(owner);
    await updateUser(user.id, { active: false });
    await assert.rejects(() => login(owner.email, owner.password), UserError);
  });

  it('sessionen slutar gälla när den gått ut', async () => {
    process.env.SESSION_HOURS = '0.0000001';
    await createUser(owner);
    const session = await login(owner.email, owner.password);
    await new Promise((done) => setTimeout(done, 5));
    assert.equal(await userForToken(session.token), undefined);
  });

  it('utloggning gör token oanvändbar', async () => {
    await createUser(owner);
    const session = await login(owner.email, owner.password);
    await logout(session.token);
    assert.equal(await userForToken(session.token), undefined);
  });

  it('en påhittad token släpper inte in någon', async () => {
    await createUser(owner);
    assert.equal(await userForToken('pahittat'), undefined);
    assert.equal(await userForToken(''), undefined);
  });

  it('sessionsfilen går inte att logga in med', async () => {
    await createUser(owner);
    const session = await login(owner.email, owner.password);
    const raw = await readFile(store, 'utf8');
    // Bara sha256 av token sparas, aldrig token själv.
    assert.equal(raw.includes(session.token), false);
  });

  it('noterar när användaren senast loggade in', async () => {
    const created = await createUser(owner);
    await login(owner.email, owner.password);
    assert.ok((await findUser(created.id))?.lastLoginAt);
  });
});

describe('ändra användare', () => {
  it('byter namn och roll', async () => {
    const user = await createUser(owner);
    const updated = await updateUser(user.id, { name: 'Ada Å', role: 'verkstad' });
    assert.equal(updated?.name, 'Ada Å');
    assert.equal(updated?.role, 'verkstad');
  });

  it('ett nytt lösenord loggar ut de gamla sessionerna', async () => {
    const user = await createUser(owner);
    const session = await login(owner.email, owner.password);
    await updateUser(user.id, { password: 'ett-annat-langt-losenord' });

    assert.equal(await userForToken(session.token), undefined);
    assert.ok((await login(owner.email, 'ett-annat-langt-losenord')).token);
  });

  it('en avstängning gäller direkt', async () => {
    const user = await createUser(owner);
    const session = await login(owner.email, owner.password);
    await updateUser(user.id, { active: false });
    assert.equal(await userForToken(session.token), undefined);
  });

  it('avvisar trasiga ändringar', async () => {
    const user = await createUser(owner);
    await assert.rejects(() => updateUser(user.id, { name: 'A' }), UserError);
    await assert.rejects(() => updateUser(user.id, { role: 'chef' }), UserError);
    await assert.rejects(() => updateUser(user.id, { password: 'kort' }), UserError);
  });

  it('ger undefined för någon som inte finns', async () => {
    assert.equal(await updateUser('finns-inte', { name: 'Någon' }), undefined);
    assert.equal(await removeUser('finns-inte'), false);
  });

  it('tar bort användaren och dennes sessioner', async () => {
    const user = await createUser(owner);
    const session = await login(owner.email, owner.password);
    assert.equal(await removeUser(user.id), true);
    assert.equal(await userForToken(session.token), undefined);
    assert.equal((await allUsers()).length, 0);
  });
});

describe('activeOwners', () => {
  it('räknar bara aktiva ägare', async () => {
    const first = await createUser(owner);
    assert.equal(await activeOwners(), 1);
    // Den som räknas bort är den man håller på att ändra.
    assert.equal(await activeOwners(first.id), 0);

    await createUser({ ...owner, email: 'nummer-tva@example.com' });
    assert.equal(await activeOwners(first.id), 1);

    await updateUser(first.id, { active: false });
    assert.equal(await activeOwners(), 1);
  });
});

describe('hjälpare', () => {
  it('normalizeEmail tål skräp', () => {
    assert.equal(normalizeEmail('  A@B.se '), 'a@b.se');
    assert.equal(normalizeEmail(undefined), '');
    assert.equal(normalizeEmail(42), '');
  });

  it('checkPassword släpper igenom ett lagom långt', () => {
    assert.equal(checkPassword('tolv-tecken!'), 'tolv-tecken!');
    assert.throws(() => checkPassword('x'.repeat(201)), UserError);
  });
});

describe('actorFor', () => {
  const key = 'en-startnyckel-pa-over-16-tecken';

  it('startnyckeln gäller så länge det inte finns användare', async () => {
    const found = await actorFor(key, key);
    assert.equal(found?.role, 'agare');
    assert.equal(found?.key, true);
  });

  it('men slutar gälla i samma stund som någon skapats', async () => {
    await createUser(owner);
    assert.equal(await actorFor(key, key), undefined);
  });

  it('fel nyckel släpper inte in någon', async () => {
    assert.equal(await actorFor('fel-nyckel-men-lika-lang-text', key), undefined);
    assert.equal(await actorFor(key, undefined), undefined);
    assert.equal(await actorFor('', key), undefined);
  });

  it('en inloggad användare känns igen, med sin roll', async () => {
    await createUser({ ...owner, role: 'verkstad' });
    const session = await login(owner.email, owner.password);
    const found = await actorFor(session.token, key);
    assert.equal(found?.role, 'verkstad');
    assert.equal(found?.key, false);
    assert.equal(found?.name, 'Ada Ägare');
  });

  it('en utloggad token är ingen', async () => {
    await createUser(owner);
    const session = await login(owner.email, owner.password);
    await logout(session.token);
    assert.equal(await actorFor(session.token, key), undefined);
  });
});
