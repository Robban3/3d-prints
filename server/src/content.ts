import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isMediaExtension, isVideoExtension, readMeta } from './uploads.ts';

/**
 * Startsidans innehåll: heron och kampanjblocken.
 *
 * Texterna låg tidigare i HomePage.tsx, vilket gjorde varje kampanj till en
 * utveckling och en omstart. Nu ligger de i en fil som panelen skriver till,
 * men med samma text som förut som utgångsvärde – startsidan ser alltså
 * likadan ut tills någon ändrar den.
 *
 * Adresser och media kontrolleras hårt: en länk som får vara vad som helst i en
 * adminpanel är en väg in för javascript:-URL:er, och en medieadress som kommer
 * från klienten kan peka var som helst. Därför byggs mediets adress alltid av
 * dess id här, och länkar måste vara interna eller https.
 */

const STORE = () => resolve(process.env.CONTENT_STORE ?? 'data/startsida.json');

export interface Media {
  kind: 'image' | 'video';
  /** Uppladdningens id, eller tomt för en fil som följer med bygget. */
  id: string;
  url: string;
  fileName: string;
}

export interface LinkTarget {
  label: string;
  href: string;
}

export interface HeroContent {
  eyebrow: string;
  title: string;
  /** Raden under titeln som får accentfärg. */
  highlight: string;
  text: string;
  primary: LinkTarget;
  secondary?: LinkTarget;
  /** Bild eller video. Saknas den ritas den genererade scenen. */
  media?: Media;
  /** Stillbild bakom videon innan den börjat spela. */
  poster?: Media;
  /** Spela videon i loop utan ljud, som en rörlig bakgrund. */
  autoplay: boolean;
}

export type CampaignLayout = 'banner' | 'kort';

export interface Campaign {
  id: string;
  title: string;
  text: string;
  cta?: LinkTarget;
  media?: Media;
  layout: CampaignLayout;
  /** Rabattkod som visas på kampanjen, om den hör till en. */
  discountCode?: string;
  startsAt?: string;
  endsAt?: string;
  active: boolean;
  /** Lägre tal visas först. */
  order: number;
}

export interface HomeContent {
  hero: HeroContent;
  campaigns: Campaign[];
}

export class ContentError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('Innehållet kunde inte sparas');
    this.name = 'ContentError';
    this.fields = fields;
  }
}

/** Samma text som stod i koden, så startsidan inte blir tom av att bli redigerbar. */
export const DEFAULT_HERO: HeroContent = {
  eyebrow: '',
  title: '3D-printade produkter.',
  highlight: 'Byggda för dig.',
  text: 'Högkvalitativa 3D-printade produkter och prototyper. Snabbt, hållbart och precis – precis som du vill ha det.',
  primary: { label: 'Utforska produkter', href: '/produkter' },
  secondary: { label: 'Beställ din egen print', href: '/egen-print' },
  autoplay: true,
};

/**
 * Kampanjen som ligger med från start. Den används bara när innehållsfilen inte
 * finns – när butiken väl sparat sitt innehåll är det den listan som gäller,
 * även om den är tom.
 */
export const DEFAULT_CAMPAIGNS: Campaign[] = [
  {
    id: 'julkollektionen',
    eyebrow: 'Julkollektionen',
    title: 'En jul med personlig prägel',
    text: 'Gör julen till din med 3D-printade dekorationer och personliga presenter. Upptäck stilrena granar, dekorativa stjärnor och julgranspynt med namnen du tycker allra mest om.',
    cta: {
      label: 'Upptäck julkollektionen',
      href: '/produkter?kategori=julpynt-personligt,jul-dekorationer,julklappar',
    },
    media: {
      kind: 'image',
      id: '',
      url: '/kampanjer/julkollektionen.jpg',
      fileName: 'julkollektionen.jpg',
    },
    layout: 'banner',
    active: true,
    order: 0,
  },
];

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readStore(): Promise<HomeContent> {
  try {
    const raw = await readFile(STORE(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<HomeContent>;
    return {
      hero: { ...DEFAULT_HERO, ...(parsed.hero ?? {}) },
      // En tom lista är ett giltigt val: butiken kan ha tagit bort kampanjen.
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : DEFAULT_CAMPAIGNS,
    };
  } catch {
    return { hero: DEFAULT_HERO, campaigns: DEFAULT_CAMPAIGNS };
  }
}

async function writeStore(content: HomeContent): Promise<void> {
  await mkdir(dirname(STORE()), { recursive: true });
  await writeFile(STORE(), JSON.stringify(content, null, 2), 'utf8');
}

function text(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Tillåter interna sökvägar och https-adresser. Allt annat – javascript:,
 * data:, protokollrelativa //-adresser – avvisas.
 */
export function parseHref(value: unknown): string | undefined {
  const raw = text(value, 500);
  if (raw.length === 0) return undefined;
  if (raw.startsWith('//')) return undefined;
  if (raw.startsWith('/')) return raw;
  if (/^https:\/\/[^\s]+$/i.test(raw)) return raw;
  return undefined;
}

function parseLink(
  value: unknown,
  field: string,
  errors: Record<string, string>,
  required: boolean,
): LinkTarget | undefined {
  const raw = (value ?? {}) as Record<string, unknown>;
  const label = text(raw.label, 60);
  const href = parseHref(raw.href);

  if (label.length === 0 && href === undefined) {
    if (required) errors[field] = 'Fyll i både text och adress för knappen.';
    return undefined;
  }
  if (label.length === 0) {
    errors[field] = 'Knappen behöver en text.';
    return undefined;
  }
  if (href === undefined) {
    errors[field] = 'Adressen måste vara en intern sökväg som börjar med / eller en https-adress.';
    return undefined;
  }
  return { label, href };
}

/**
 * En bild som följer med bygget, till exempel en kampanjbild i klientens
 * public-katalog. Den har inget uppladdnings-id, så adressen är allt vi har –
 * och den kontrolleras därför hårt: intern sökväg, ingen klättring uppåt, och
 * inte under /api, som är uppladdningarnas område.
 */
function staticMedia(url: string): Media | undefined {
  if (!url.startsWith('/') || url.startsWith('//')) return undefined;
  if (url.includes('..') || url.startsWith('/api/')) return undefined;

  const extension = url.slice(url.lastIndexOf('.')).toLowerCase();
  if (!isMediaExtension(extension)) return undefined;
  return {
    kind: isVideoExtension(extension) ? 'video' : 'image',
    id: '',
    url,
    fileName: url.slice(url.lastIndexOf('/') + 1),
  };
}

/**
 * Slår upp en uppladdning och bygger mediet av den. Adressen kommer aldrig från
 * klienten, utan byggs av id:t – då kan den inte peka någon annanstans.
 */
export async function parseMedia(value: unknown): Promise<Media | undefined> {
  const raw = (value ?? {}) as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (id.length === 0) {
    // Utan id kan det ändå vara en fil som följer med bygget.
    const url = typeof raw.url === 'string' ? raw.url.trim() : '';
    return url.length === 0 ? undefined : staticMedia(url);
  }

  const meta = await readMeta(id);
  if (!meta)
    throw new ContentError({ media: 'Vi hittar inte den uppladdade filen. Ladda upp den igen.' });

  const kind = isVideoExtension(meta.extension) ? 'video' : 'image';
  if (meta.kind !== undefined && meta.kind !== kind) {
    throw new ContentError({ media: 'Filen är inte en bild eller video.' });
  }
  return { kind, id: meta.id, url: `/api/uploads/${meta.id}`, fileName: meta.originalName };
}

function parseDate(
  value: unknown,
  field: string,
  errors: Record<string, string>,
): string | undefined {
  const raw = text(value, 40);
  if (raw.length === 0) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    errors[field] = 'Ange ett datum på formen 2026-12-24.';
    return undefined;
  }
  return parsed.toISOString();
}

export async function parseHeroInput(input: unknown): Promise<HeroContent> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const title = text(raw.title, 120);
  if (title.length < 2) errors.title = 'Heron behöver en rubrik.';

  const body = text(raw.text, 400);
  if (body.length < 10) errors.text = 'Skriv en rad eller två under rubriken.';

  const primary = parseLink(raw.primary, 'primary', errors, true);
  const secondary = parseLink(raw.secondary, 'secondary', errors, false);

  const media = await parseMedia(raw.media);
  const poster = await parseMedia(raw.poster);
  if (poster && poster.kind !== 'image') {
    errors.poster = 'Stillbilden måste vara en bild, inte en video.';
  }
  if (poster && media?.kind !== 'video') {
    errors.poster = 'En stillbild används bara tillsammans med en video.';
  }

  if (Object.keys(errors).length > 0) throw new ContentError(errors);

  return {
    eyebrow: text(raw.eyebrow, 60),
    title,
    highlight: text(raw.highlight, 120),
    text: body,
    primary: primary!,
    autoplay: raw.autoplay !== false,
    ...(secondary ? { secondary } : {}),
    ...(media ? { media } : {}),
    ...(poster ? { poster } : {}),
  };
}

export async function parseCampaignInput(input: unknown, existing?: Campaign): Promise<Campaign> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const eyebrow = text(raw.eyebrow, 60);
  const title = text(raw.title, 120);
  if (title.length < 2) errors.title = 'Kampanjen behöver en rubrik.';

  const body = text(raw.text, 400);
  if (body.length < 5) errors.text = 'Skriv en rad om vad kampanjen gäller.';

  const cta = parseLink(raw.cta, 'cta', errors, false);
  const media = await parseMedia(raw.media);
  const startsAt = parseDate(raw.startsAt, 'startsAt', errors);
  const endsAt = parseDate(raw.endsAt, 'endsAt', errors);
  if (startsAt && endsAt && startsAt >= endsAt) {
    errors.endsAt = 'Slutdatumet måste ligga efter startdatumet.';
  }

  const discountCode = text(raw.discountCode, 24).toUpperCase().replace(/\s+/g, '');

  if (Object.keys(errors).length > 0) throw new ContentError(errors);

  const order = Number(raw.order);
  return {
    id: existing?.id ?? randomUUID(),
    ...(eyebrow ? { eyebrow } : {}),
    title,
    text: body,
    layout: raw.layout === 'kort' ? 'kort' : 'banner',
    active: raw.active !== false,
    order: Number.isFinite(order) ? Math.round(order) : (existing?.order ?? 0),
    ...(cta ? { cta } : {}),
    ...(media ? { media } : {}),
    ...(discountCode ? { discountCode } : {}),
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
  };
}

/** Allt innehåll, även avstängt och schemalagt – det panelen behöver se. */
export function homeContent(): Promise<HomeContent> {
  return readStore();
}

/** Det besökaren ska se: aktiva kampanjer vars fönster är öppet, i ordning. */
export async function publicHomeContent(now: Date = new Date()): Promise<HomeContent> {
  const content = await readStore();
  const stamp = now.toISOString();
  return {
    hero: content.hero,
    campaigns: content.campaigns
      .filter((campaign) => campaign.active)
      .filter((campaign) => !campaign.startsAt || stamp >= campaign.startsAt)
      .filter((campaign) => !campaign.endsAt || stamp <= campaign.endsAt)
      .sort((a, b) => a.order - b.order),
  };
}

export function saveHero(hero: HeroContent): Promise<HeroContent> {
  return serialize(async () => {
    const content = await readStore();
    await writeStore({ ...content, hero });
    return hero;
  });
}

export function saveCampaign(campaign: Campaign): Promise<Campaign> {
  return serialize(async () => {
    const content = await readStore();
    const index = content.campaigns.findIndex((entry) => entry.id === campaign.id);
    const campaigns = [...content.campaigns];
    if (index >= 0) campaigns[index] = campaign;
    else campaigns.push(campaign);
    await writeStore({ ...content, campaigns });
    return campaign;
  });
}

export function removeCampaign(id: string): Promise<Campaign | undefined> {
  return serialize(async () => {
    const content = await readStore();
    const index = content.campaigns.findIndex((entry) => entry.id === id);
    if (index < 0) return undefined;
    const campaigns = [...content.campaigns];
    const [removed] = campaigns.splice(index, 1);
    await writeStore({ ...content, campaigns });
    return removed;
  });
}

export function findCampaign(id: string): Promise<Campaign | undefined> {
  return readStore().then((content) => content.campaigns.find((entry) => entry.id === id));
}

/**
 * Flyttar en kampanj ett steg upp eller ner. Ordningstalen skrivs om till en
 * tät följd, så att upprepade flyttar inte lämnar glapp.
 */
export function moveCampaign(id: string, direction: -1 | 1): Promise<Campaign[]> {
  return serialize(async () => {
    const content = await readStore();
    const ordered = [...content.campaigns].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((entry) => entry.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return content.campaigns;

    const moved = ordered[index]!;
    ordered[index] = ordered[target]!;
    ordered[target] = moved;
    const campaigns = ordered.map((entry, position) => ({ ...entry, order: position }));
    await writeStore({ ...content, campaigns });
    return campaigns;
  });
}

/** Bara för tester. */
export function resetContent(): Promise<void> {
  return serialize(() => writeStore({ hero: DEFAULT_HERO, campaigns: [] }));
}
