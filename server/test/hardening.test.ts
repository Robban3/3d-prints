import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { currentHits, rateLimit, resetRateLimit } from '../src/rateLimit.ts';
import { notificationSecret, notificationUrl } from '../src/klarna.ts';
import { resetStorage, storage } from '../src/storage.ts';

interface FakeResponse {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
}

function invoke(handler: ReturnType<typeof rateLimit>, ip: string) {
  const res: FakeResponse = { headers: {} };
  let passed = false;
  const response = {
    setHeader: (key: string, value: string) => {
      res.headers[key] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      res.body = payload;
      return this;
    },
  };
  handler({ ip } as never, response as never, () => {
    passed = true;
  });
  return { passed, res };
}

beforeEach(() => resetRateLimit());

describe('takgräns', () => {
  const limiter = rateLimit({ name: 'test', windowMs: 60_000, max: 3, message: 'För många.' });

  it('släpper igenom upp till taket', () => {
    for (let i = 0; i < 3; i += 1) {
      assert.equal(invoke(limiter, '1.2.3.4').passed, true, `försök ${i + 1} skulle gå igenom`);
    }
  });

  it('stoppar det försök som passerar taket', () => {
    for (let i = 0; i < 3; i += 1) invoke(limiter, '1.2.3.4');
    const blocked = invoke(limiter, '1.2.3.4');
    assert.equal(blocked.passed, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.deepEqual(blocked.res.body, { error: 'För många.' });
    assert.ok(blocked.res.headers['Retry-After'], 'ska tala om när man får försöka igen');
  });

  it('räknar varje avsändare för sig', () => {
    for (let i = 0; i < 3; i += 1) invoke(limiter, '1.2.3.4');
    assert.equal(invoke(limiter, '5.6.7.8').passed, true);
  });

  it('håller olika gränser åtskilda', () => {
    const other = rateLimit({ name: 'annan', windowMs: 60_000, max: 1, message: 'Nej.' });
    invoke(limiter, '1.2.3.4');
    assert.equal(currentHits('test', '1.2.3.4'), 1);
    assert.equal(currentHits('annan', '1.2.3.4'), 0);
    assert.equal(invoke(other, '1.2.3.4').passed, true);
  });
});

describe('Klarnas notifieringsadress', () => {
  afterEach(() => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.KLARNA_NOTIFICATION_SECRET;
  });

  it('saknas tills både adress och hemlighet är satta', () => {
    assert.equal(notificationUrl(), undefined);
    process.env.PUBLIC_BASE_URL = 'https://formlabb.se';
    assert.equal(notificationUrl(), undefined);
  });

  it('avvisar en för kort hemlighet', () => {
    process.env.PUBLIC_BASE_URL = 'https://formlabb.se';
    process.env.KLARNA_NOTIFICATION_SECRET = 'kort';
    assert.equal(notificationUrl(), undefined);
    assert.equal(notificationSecret(), undefined);
  });

  it('bygger adressen med hemligheten i frågesträngen', () => {
    process.env.PUBLIC_BASE_URL = 'https://formlabb.se/';
    process.env.KLARNA_NOTIFICATION_SECRET = 'en-tillrackligt-lang-hemlighet';
    assert.equal(
      notificationUrl(),
      'https://formlabb.se/api/payments/klarna/notification?token=en-tillrackligt-lang-hemlighet',
    );
  });
});

describe('lagring av filer', () => {
  afterEach(() => {
    delete process.env.S3_BUCKET;
    resetStorage();
  });

  it('använder lokal disk som standard', () => {
    resetStorage();
    assert.equal(storage().kind, 'disk');
  });

  it('växlar till objektlagring när en bucket är satt', () => {
    process.env.S3_BUCKET = 'formlabb-uploads';
    resetStorage();
    assert.equal(storage().kind, 's3');
  });
});
