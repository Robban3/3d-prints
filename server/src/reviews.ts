import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Kundomdömen med moderering. Inget omdöme syns i butiken förrän någon i
 * verkstaden har godkänt det, så en arg konkurrent eller en skräprobot kan inte
 * sätta betyget på en produkt.
 *
 * Mejladressen sparas men lämnar aldrig servern: den används för att se om
 * personen faktiskt har handlat produkten, och för att kunna höra av sig.
 */

const STORE = () => resolve(process.env.REVIEW_STORE ?? 'data/omdomen.json');

export const RATING_RANGE = { min: 1, max: 5 } as const;

export type ReviewStatus = 'väntar' | 'publicerad' | 'avslagen';

export interface Review {
  id: string;
  productId: string;
  createdAt: string;
  author: string;
  /** Visas aldrig i butiken – se publicReview. */
  email: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus;
  /** True när mejladressen finns på en order med produkten. */
  verifiedPurchase: boolean;
  /** Verkstadens svar, som visas under omdömet. */
  reply?: string;
  moderatedAt?: string;
}

/** Omdömet som det lämnar servern till butiken. */
export type PublicReview = Omit<Review, 'email' | 'productId' | 'status' | 'moderatedAt'>;

export interface ReviewSummary {
  average: number;
  count: number;
  /** Antal omdömen per betyg, från 1 till 5. */
  distribution: Record<number, number>;
}

export class ReviewError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('Omdömet kunde inte sparas');
    this.name = 'ReviewError';
    this.fields = fields;
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Skrivningarna köas, så att två omdömen som kommer samtidigt inte skriver över varandra. */
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<Review[]> {
  try {
    const raw = await readFile(STORE(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Review[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(reviews: Review[]): Promise<void> {
  await mkdir(dirname(STORE()), { recursive: true });
  await writeFile(STORE(), JSON.stringify(reviews, null, 2), 'utf8');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface ReviewInput {
  productId: string;
  author: string;
  email: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase?: boolean;
}

/** Tar emot ett omdöme och lägger det i kö för granskning. */
export function submitReview(input: ReviewInput): Promise<Review> {
  const errors: Record<string, string> = {};

  const author = text(input.author);
  if (author.length < 2 || author.length > 60) {
    errors.author = 'Skriv vad du vill kallas, 2–60 tecken.';
  }

  const email = text(input.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = 'Fyll i en mejladress vi kan nå dig på.';
  }

  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < RATING_RANGE.min || rating > RATING_RANGE.max) {
    errors.rating = 'Sätt ett betyg mellan 1 och 5.';
  }

  const title = text(input.title);
  if (title.length > 80) errors.title = 'Rubriken får vara högst 80 tecken.';

  const body = text(input.body);
  if (body.length < 10) errors.body = 'Berätta lite mer – minst 10 tecken.';
  if (body.length > 2000) errors.body = 'Omdömet får vara högst 2000 tecken.';

  if (Object.keys(errors).length > 0) return Promise.reject(new ReviewError(errors));

  return serialize(async () => {
    const reviews = await readAll();
    // Samma person ska inte kunna fylla en produkt med omdömen.
    const already = reviews.find(
      (review) => review.productId === input.productId && review.email === email,
    );
    if (already) {
      throw new ReviewError({
        email:
          'Du har redan lämnat ett omdöme om den här produkten. Hör av dig om du vill ändra det.',
      });
    }

    const review: Review = {
      id: randomUUID(),
      productId: input.productId,
      createdAt: new Date().toISOString(),
      author,
      email,
      rating,
      title,
      body,
      status: 'väntar',
      verifiedPurchase: input.verifiedPurchase === true,
    };
    reviews.push(review);
    await writeAll(reviews);
    return review;
  });
}

export function publicReview(review: Review): PublicReview {
  return {
    id: review.id,
    createdAt: review.createdAt,
    author: review.author,
    rating: review.rating,
    title: review.title,
    body: review.body,
    verifiedPurchase: review.verifiedPurchase,
    ...(review.reply ? { reply: review.reply } : {}),
  };
}

/** Publicerade omdömen om en produkt, nyast först. */
export async function publishedFor(productId: string): Promise<PublicReview[]> {
  const reviews = await readAll();
  return reviews
    .filter((review) => review.productId === productId && review.status === 'publicerad')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicReview);
}

function summarize(reviews: Review[]): ReviewSummary {
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  for (const review of reviews) {
    distribution[review.rating] = (distribution[review.rating] ?? 0) + 1;
    total += review.rating;
  }
  return {
    average: reviews.length === 0 ? 0 : Math.round((total / reviews.length) * 10) / 10,
    count: reviews.length,
    distribution,
  };
}

/** Sammanfattning per produkt, bara för de produkter som har publicerade omdömen. */
export async function summaries(): Promise<Map<string, ReviewSummary>> {
  const reviews = await readAll();
  const perProduct = new Map<string, Review[]>();
  for (const review of reviews) {
    if (review.status !== 'publicerad') continue;
    const list = perProduct.get(review.productId) ?? [];
    list.push(review);
    perProduct.set(review.productId, list);
  }
  return new Map([...perProduct].map(([id, list]) => [id, summarize(list)]));
}

export async function summaryFor(productId: string): Promise<ReviewSummary | undefined> {
  return (await summaries()).get(productId);
}

/** Alla omdömen för panelen, nyast först. Väntande ligger överst. */
export async function allReviews(status?: ReviewStatus): Promise<Review[]> {
  const reviews = await readAll();
  const order: Record<ReviewStatus, number> = { väntar: 0, publicerad: 1, avslagen: 2 };
  return reviews
    .filter((review) => status === undefined || review.status === status)
    .sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));
}

export async function countWaiting(): Promise<number> {
  return (await readAll()).filter((review) => review.status === 'väntar').length;
}

export function findReview(id: string): Promise<Review | undefined> {
  return readAll().then((reviews) => reviews.find((review) => review.id === id));
}

export function setReviewStatus(
  id: string,
  status: ReviewStatus,
  reply?: string,
): Promise<Review | undefined> {
  return serialize(async () => {
    const reviews = await readAll();
    const index = reviews.findIndex((review) => review.id === id);
    if (index < 0) return undefined;
    const trimmed = typeof reply === 'string' ? reply.trim() : undefined;
    const updated: Review = {
      ...reviews[index]!,
      status,
      moderatedAt: new Date().toISOString(),
      // Ett tomt svar tar bort det som fanns.
      ...(trimmed === undefined
        ? {}
        : trimmed.length > 0
          ? { reply: trimmed }
          : { reply: undefined }),
    };
    if (updated.reply === undefined) delete updated.reply;
    reviews[index] = updated;
    await writeAll(reviews);
    return updated;
  });
}

export function deleteReview(id: string): Promise<Review | undefined> {
  return serialize(async () => {
    const reviews = await readAll();
    const index = reviews.findIndex((review) => review.id === id);
    if (index < 0) return undefined;
    const [removed] = reviews.splice(index, 1);
    await writeAll(reviews);
    return removed;
  });
}

/** Bara för tester. */
export function clearReviews(): Promise<void> {
  return serialize(() => writeAll([]));
}
