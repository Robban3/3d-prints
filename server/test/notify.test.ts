import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  WatchError,
  claimWatchers,
  removeWatch,
  watchStock,
  watcherCounts,
  watchersFor,
} from '../src/notify.ts';

let dir: string;
const previous = process.env.WATCH_STORE;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-bevak-'));
  process.env.WATCH_STORE = join(dir, 'bevakningar.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (previous === undefined) delete process.env.WATCH_STORE;
  else process.env.WATCH_STORE = previous;
});

describe('watchStock', () => {
  it('sparar en bevakning', async () => {
    const watch = await watchStock('p-001', 'Anna@Example.com');
    assert.equal(watch.productId, 'p-001');
    // Adressen normaliseras så att dubbletter går att upptäcka.
    assert.equal(watch.email, 'anna@example.com');
    assert.equal((await watchersFor('p-001')).length, 1);
  });

  it('avvisar en adress som inte ser ut som en mejladress', async () => {
    await assert.rejects(() => watchStock('p-001', 'inte-en-adress'), WatchError);
    await assert.rejects(() => watchStock('p-001', ''), WatchError);
    assert.deepEqual(await watchersFor('p-001'), []);
  });

  it('ger samma bevakning tillbaka i stället för ett fel vid dubbletter', async () => {
    const first = await watchStock('p-001', 'anna@example.com');
    const again = await watchStock('p-001', '  ANNA@example.com  ');
    assert.equal(again.id, first.id);
    assert.equal((await watchersFor('p-001')).length, 1);
  });

  it('håller produkterna isär', async () => {
    await watchStock('p-001', 'anna@example.com');
    await watchStock('p-002', 'anna@example.com');
    assert.equal((await watchersFor('p-001')).length, 1);
    assert.equal((await watchersFor('p-002')).length, 1);
  });

  it('klarar att flera bevakningar kommer samtidigt', async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_unused, index) =>
        watchStock('p-001', `kund${index}@example.com`),
      ),
    );
    // Skrivningarna köas, så ingen ska ha skrivit över en annan.
    assert.equal((await watchersFor('p-001')).length, 25);
  });
});

describe('watcherCounts', () => {
  it('räknar bevakningar per produkt', async () => {
    await watchStock('p-001', 'a@example.com');
    await watchStock('p-001', 'b@example.com');
    await watchStock('p-002', 'c@example.com');

    const counts = await watcherCounts();
    assert.equal(counts.get('p-001'), 2);
    assert.equal(counts.get('p-002'), 1);
    assert.equal(counts.get('p-003'), undefined);
  });
});

describe('claimWatchers', () => {
  it('lämnar ut bevakningarna och tar bort dem i samma steg', async () => {
    await watchStock('p-001', 'a@example.com');
    await watchStock('p-001', 'b@example.com');

    const claimed = await claimWatchers('p-001');
    assert.equal(claimed.length, 2);
    // Ingen ska kunna få samma mejl två gånger.
    assert.deepEqual(await claimWatchers('p-001'), []);
    assert.deepEqual(await watchersFor('p-001'), []);
  });

  it('rör inte andra produkters bevakningar', async () => {
    await watchStock('p-001', 'a@example.com');
    await watchStock('p-002', 'b@example.com');

    await claimWatchers('p-001');
    assert.equal((await watchersFor('p-002')).length, 1);
  });

  it('svarar med en tom lista när ingen bevakar', async () => {
    assert.deepEqual(await claimWatchers('p-001'), []);
  });

  it('delar inte ut samma bevakning till två samtidiga påfyllningar', async () => {
    await watchStock('p-001', 'a@example.com');
    const [first, second] = await Promise.all([claimWatchers('p-001'), claimWatchers('p-001')]);
    assert.equal(first.length + second.length, 1);
  });
});

describe('removeWatch', () => {
  it('tar bort en enskild bevakning', async () => {
    const watch = await watchStock('p-001', 'a@example.com');
    assert.equal((await removeWatch(watch.id))?.id, watch.id);
    assert.deepEqual(await watchersFor('p-001'), []);
  });

  it('svarar undefined för en bevakning som inte finns', async () => {
    assert.equal(await removeWatch('finns-inte'), undefined);
  });
});
