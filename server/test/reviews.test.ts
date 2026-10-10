import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ReviewError,
  allReviews,
  countWaiting,
  deleteReview,
  publicReview,
  publishedFor,
  setReviewStatus,
  submitReview,
  summaries,
  summaryFor,
} from '../src/reviews.ts';

let dir: string;
const previous = process.env.REVIEW_STORE;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-omdomen-'));
  process.env.REVIEW_STORE = join(dir, 'omdomen.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (previous === undefined) delete process.env.REVIEW_STORE;
  else process.env.REVIEW_STORE = previous;
});

const valid = {
  productId: 'p-001',
  author: 'Anna',
  email: 'Anna@Example.com',
  rating: 5,
  title: 'Kanon',
  body: 'Krukan sitter perfekt i fönstret och ytan är helt jämn.',
};

describe('submitReview', () => {
  it('sparar omdömet i kö för granskning', async () => {
    const review = await submitReview(valid);
    assert.equal(review.status, 'väntar');
    assert.equal(review.rating, 5);
    assert.equal(review.author, 'Anna');
    // Mejladressen normaliseras så att dubbletter går att upptäcka.
    assert.equal(review.email, 'anna@example.com');
    assert.equal(review.verifiedPurchase, false);
    assert.ok(review.id.length > 10);
  });

  it('syns inte i butiken förrän det godkänts', async () => {
    await submitReview(valid);
    assert.deepEqual(await publishedFor('p-001'), []);
    assert.equal(await countWaiting(), 1);
  });

  it('kräver ett betyg mellan 1 och 5', async () => {
    await assert.rejects(() => submitReview({ ...valid, rating: 0 }), ReviewError);
    await assert.rejects(() => submitReview({ ...valid, rating: 6 }), ReviewError);
    await assert.rejects(
      () => submitReview({ ...valid, rating: Number.NaN }),
      (error: unknown) => {
        assert.ok(error instanceof ReviewError);
        assert.match(error.fields.rating!, /mellan 1 och 5/);
        return true;
      },
    );
  });

  it('avrundar ett betyg som kommer in som decimaltal', async () => {
    const review = await submitReview({ ...valid, rating: 4.4 });
    assert.equal(review.rating, 4);
  });

  it('kräver namn, mejladress och en text med innehåll', async () => {
    await assert.rejects(() => submitReview({ ...valid, author: 'A' }), ReviewError);
    await assert.rejects(() => submitReview({ ...valid, email: 'inte-en-adress' }), ReviewError);
    await assert.rejects(() => submitReview({ ...valid, body: 'kort' }), ReviewError);
    await assert.rejects(() => submitReview({ ...valid, body: 'x'.repeat(2001) }), ReviewError);
    await assert.rejects(() => submitReview({ ...valid, title: 'x'.repeat(81) }), ReviewError);
  });

  it('samlar alla fel på en gång i stället för ett i taget', async () => {
    await assert.rejects(
      () => submitReview({ ...valid, author: '', email: 'fel', rating: 9, body: '' }),
      (error: unknown) => {
        assert.ok(error instanceof ReviewError);
        assert.deepEqual(Object.keys(error.fields).sort(), ['author', 'body', 'email', 'rating']);
        return true;
      },
    );
  });

  it('släpper inte igenom två omdömen från samma adress om samma produkt', async () => {
    await submitReview(valid);
    await assert.rejects(
      () => submitReview({ ...valid, email: 'ANNA@example.com', body: 'Ett annat omdöme här.' }),
      (error: unknown) => {
        assert.ok(error instanceof ReviewError);
        assert.match(error.fields.email!, /redan lämnat/);
        return true;
      },
    );
    assert.equal((await allReviews()).length, 1);
  });

  it('tillåter samma person att recensera en annan produkt', async () => {
    await submitReview(valid);
    await submitReview({ ...valid, productId: 'p-002' });
    assert.equal((await allReviews()).length, 2);
  });
});

describe('moderering', () => {
  it('publicerar ett omdöme så att butiken ser det', async () => {
    const review = await submitReview(valid);
    const updated = await setReviewStatus(review.id, 'publicerad');
    assert.equal(updated?.status, 'publicerad');
    assert.ok(updated?.moderatedAt);

    const published = await publishedFor('p-001');
    assert.equal(published.length, 1);
    assert.equal(published[0]!.author, 'Anna');
  });

  it('håller ett avslaget omdöme borta från butiken', async () => {
    const review = await submitReview(valid);
    await setReviewStatus(review.id, 'avslagen');
    assert.deepEqual(await publishedFor('p-001'), []);
    assert.equal(await countWaiting(), 0);
  });

  it('sparar verkstadens svar och tar bort det igen när det töms', async () => {
    const review = await submitReview(valid);
    const withReply = await setReviewStatus(
      review.id,
      'publicerad',
      '  Tack för att du hörde av dig!  ',
    );
    assert.equal(withReply?.reply, 'Tack för att du hörde av dig!');

    const cleared = await setReviewStatus(review.id, 'publicerad', '   ');
    assert.equal('reply' in cleared!, false);
  });

  it('låter svaret vara när inget svar skickas med', async () => {
    const review = await submitReview(valid);
    await setReviewStatus(review.id, 'publicerad', 'Kul att höra!');
    const again = await setReviewStatus(review.id, 'väntar');
    assert.equal(again?.reply, 'Kul att höra!');
  });

  it('svarar undefined för ett omdöme som inte finns', async () => {
    assert.equal(await setReviewStatus('finns-inte', 'publicerad'), undefined);
    assert.equal(await deleteReview('finns-inte'), undefined);
  });

  it('tar bort ett omdöme helt', async () => {
    const review = await submitReview(valid);
    assert.equal((await deleteReview(review.id))?.id, review.id);
    assert.deepEqual(await allReviews(), []);
  });

  it('lägger väntande omdömen överst i panelen', async () => {
    const first = await submitReview(valid);
    await submitReview({ ...valid, email: 'bo@example.com', author: 'Bo' });
    await setReviewStatus(first.id, 'publicerad');

    const list = await allReviews();
    assert.equal(list[0]!.status, 'väntar');
    assert.equal(list[1]!.status, 'publicerad');
  });

  it('kan filtrera på status', async () => {
    const review = await submitReview(valid);
    await setReviewStatus(review.id, 'avslagen');
    assert.equal((await allReviews('avslagen')).length, 1);
    assert.equal((await allReviews('väntar')).length, 0);
  });
});

describe('sammanfattning', () => {
  async function publish(rating: number, email: string) {
    const review = await submitReview({ ...valid, rating, email, body: 'En text som räcker.' });
    await setReviewStatus(review.id, 'publicerad');
  }

  it('räknar snitt och fördelning på publicerade omdömen', async () => {
    await publish(5, 'a@example.com');
    await publish(4, 'b@example.com');
    await publish(4, 'c@example.com');

    const summary = await summaryFor('p-001');
    assert.equal(summary?.count, 3);
    // (5 + 4 + 4) / 3 = 4,333… avrundat till en decimal
    assert.equal(summary?.average, 4.3);
    assert.equal(summary?.distribution[4], 2);
    assert.equal(summary?.distribution[5], 1);
    assert.equal(summary?.distribution[1], 0);
  });

  it('räknar inte med omdömen som väntar eller avslagits', async () => {
    await publish(5, 'a@example.com');
    await submitReview({ ...valid, rating: 1, email: 'b@example.com' });
    const rejected = await submitReview({ ...valid, rating: 1, email: 'c@example.com' });
    await setReviewStatus(rejected.id, 'avslagen');

    const summary = await summaryFor('p-001');
    assert.equal(summary?.count, 1);
    assert.equal(summary?.average, 5);
  });

  it('saknar sammanfattning för en produkt utan publicerade omdömen', async () => {
    await submitReview(valid);
    assert.equal(await summaryFor('p-001'), undefined);
    assert.equal((await summaries()).size, 0);
  });

  it('håller produkterna isär', async () => {
    await publish(5, 'a@example.com');
    const other = await submitReview({ ...valid, productId: 'p-002', rating: 2 });
    await setReviewStatus(other.id, 'publicerad');

    const all = await summaries();
    assert.equal(all.get('p-001')?.average, 5);
    assert.equal(all.get('p-002')?.average, 2);
  });
});

describe('publicReview', () => {
  it('lämnar aldrig ut mejladressen eller modereringsstatusen', async () => {
    const review = await submitReview(valid);
    const published = publicReview({ ...review, status: 'publicerad', moderatedAt: 'nu' });
    const keys = Object.keys(published).sort();
    assert.deepEqual(keys, [
      'author',
      'body',
      'createdAt',
      'id',
      'rating',
      'title',
      'verifiedPurchase',
    ]);
    assert.equal('email' in published, false);
    assert.equal('productId' in published, false);
  });

  it('tar med verkstadens svar när det finns', async () => {
    const review = await submitReview(valid);
    const published = publicReview({ ...review, reply: 'Tack!' });
    assert.equal(published.reply, 'Tack!');
  });
});
