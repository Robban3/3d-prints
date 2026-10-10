import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Breven till kunden, redigerbara i panelen.
 *
 * Texterna i koden är utgångsläget, inte sanningen: verkstaden ska kunna skriva
 * om ett brev utan att någon behöver röra en fil. Det som är uträknat –
 * orderraderna, summan, adressen – är platshållare, för de kan ingen skriva
 * för hand.
 *
 * En platshållare som inte finns avvisas när mallen sparas. Alternativet vore
 * att skicka `{{kudn}}` till en riktig kund, och det upptäcks först när det är
 * för sent.
 */

const TEMPLATE_FILE = () => resolve(process.env.MAIL_TEMPLATE_STORE ?? 'data/mejlmallar.json');

export interface TemplateSpec {
  id: string;
  name: string;
  description: string;
  /** Platshållare som går att använda, utan klamrar. */
  variables: string[];
  subject: string;
  body: string;
}

const SIGNATURE = ['', 'Hälsningar,', 'Formlabb, Tredje Långgatan 14, Göteborg'].join('\n');

export const TEMPLATES: TemplateSpec[] = [
  {
    id: 'orderbekraftelse',
    name: 'Orderbekräftelse',
    description: 'Går ut direkt när en beställning tagits emot.',
    variables: [
      'kund',
      'ordernummer',
      'datum',
      'rader',
      'summering',
      'betalning',
      'adress',
      'lank',
    ],
    subject: 'Tack för din beställning {{ordernummer}}',
    body: [
      'Hej {{kund}}!',
      '',
      'Vi har tagit emot din beställning {{ordernummer}} den {{datum}}.',
      '',
      'Din beställning:',
      '{{rader}}',
      '',
      '{{summering}}',
      '{{betalning}}',
      '',
      'Levereras till:',
      '{{adress}}',
      '',
      'Följ din order: {{lank}}',
      SIGNATURE,
    ].join('\n'),
  },
  {
    id: 'status_i_produktion',
    name: 'Status: i produktion',
    description: 'Går ut när ordern går in i printkön.',
    variables: ['kund', 'ordernummer', 'lank'],
    subject: 'Din order har gått i produktion ({{ordernummer}})',
    body: [
      'Hej {{kund}}!',
      '',
      'Din order ligger nu i printkön och produktionen har startat. Vi hör av oss igen när den skickas.',
      '',
      'Ordernummer: {{ordernummer}}',
      'Följ din order: {{lank}}',
      SIGNATURE,
    ].join('\n'),
  },
  {
    id: 'status_skickad',
    name: 'Status: skickad',
    description: 'Går ut när paketet lämnat verkstaden.',
    variables: ['kund', 'ordernummer', 'lank'],
    subject: 'Din order är på väg ({{ordernummer}})',
    body: [
      'Hej {{kund}}!',
      '',
      'Din order har lämnat verkstaden och är på väg med PostNord. Den brukar komma fram inom två arbetsdagar.',
      '',
      'Ordernummer: {{ordernummer}}',
      'Följ din order: {{lank}}',
      SIGNATURE,
    ].join('\n'),
  },
  {
    id: 'status_levererad',
    name: 'Status: levererad',
    description: 'Går ut när ordern är framme.',
    variables: ['kund', 'ordernummer', 'lank'],
    subject: 'Din order är levererad ({{ordernummer}})',
    body: [
      'Hej {{kund}}!',
      '',
      'Din order är levererad. Hoppas den blev som du tänkte dig – hör av dig om något inte stämmer.',
      '',
      'Ordernummer: {{ordernummer}}',
      'Följ din order: {{lank}}',
      SIGNATURE,
    ].join('\n'),
  },
  {
    id: 'offert',
    name: 'Sparad offert',
    description: 'Går ut när en kund sparar sin offert bakom en länk.',
    variables: ['projekt', 'pris', 'leveransdagar', 'lank', 'giltigtill'],
    subject: 'Din offert på {{projekt}}',
    body: [
      'Hej!',
      '',
      'Här är offerten på {{projekt}}.',
      '',
      'Pris: {{pris}} inkl. moms',
      'Leverans: {{leveransdagar}} arbetsdagar efter beställning',
      '',
      'Öppna och beställ här: {{lank}}',
      '',
      'Offerten gäller till {{giltigtill}}. Länken går att skicka vidare till den som ska godkänna köpet.',
      SIGNATURE,
    ].join('\n'),
  },
  {
    id: 'lagerbesked',
    name: 'Åter i lager',
    description: 'Går ut en gång till den som bevakat en slutsåld produkt.',
    variables: ['produkt', 'saldo', 'lank'],
    subject: '{{produkt}} finns i lager igen',
    body: [
      'Hej!',
      '',
      'Du ville få besked när {{produkt}} fanns igen – nu står den i hyllan.',
      '{{saldo}}',
      '',
      'Beställ här: {{lank}}',
      '',
      'Det här är enda mejlet du får om den här bevakningen – vi hör inte av oss igen.',
      SIGNATURE,
    ].join('\n'),
  },
];

export function templateSpec(id: string): TemplateSpec | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

export class TemplateError extends Error {
  readonly fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'TemplateError';
    this.fields = fields;
  }
}

export interface TemplateOverride {
  subject: string;
  body: string;
  savedAt: string;
}

type Store = Record<string, TemplateOverride>;

let cache: Store | null = null;
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function resetTemplateCache(): void {
  cache = null;
}

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await readFile(TEMPLATE_FILE(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    cache = parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(store: Store): Promise<void> {
  cache = store;
  await mkdir(dirname(TEMPLATE_FILE()), { recursive: true });
  await writeFile(TEMPLATE_FILE(), JSON.stringify(store, null, 2), 'utf8');
}

/** Platshållarna som faktiskt används i en text. */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([a-zåäö0-9_]+)\s*\}\}/gi)].map((match) => match[1]!);
}

/** Sätter in värdena. Det som inte har ett värde blir tomt, inte `{{namn}}`. */
export function render(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zåäö0-9_]+)\s*\}\}/gi, (_match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name]! : '',
  );
}

export interface TemplateView extends TemplateSpec {
  /** True när texten är ändrad i panelen och inte längre är utgångsläget. */
  custom: boolean;
  savedAt?: string;
  /** Texten som koden levererades med, så det går att se vad man ändrat. */
  defaultSubject: string;
  defaultBody: string;
}

export async function allTemplates(): Promise<TemplateView[]> {
  const store = await load();
  return TEMPLATES.map((spec) => {
    const saved = store[spec.id];
    return {
      ...spec,
      subject: saved?.subject ?? spec.subject,
      body: saved?.body ?? spec.body,
      custom: saved !== undefined,
      ...(saved ? { savedAt: saved.savedAt } : {}),
      defaultSubject: spec.subject,
      defaultBody: spec.body,
    };
  });
}

/** Mallen som gäller just nu, med eventuell ändring inlagd. */
export async function templateFor(id: string): Promise<{ subject: string; body: string }> {
  const spec = templateSpec(id);
  if (!spec) throw new TemplateError('Den mallen finns inte.');
  const saved = (await load())[id];
  return { subject: saved?.subject ?? spec.subject, body: saved?.body ?? spec.body };
}

/** Mallen renderad med sina värden – det brev som faktiskt går ut. */
export async function renderTemplate(
  id: string,
  values: Record<string, string>,
): Promise<{ subject: string; text: string }> {
  const template = await templateFor(id);
  return {
    subject: render(template.subject, values).trim(),
    text: render(template.body, values),
  };
}

export function validate(
  spec: TemplateSpec,
  input: { subject: unknown; body: unknown },
): {
  subject: string;
  body: string;
} {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const fields: Record<string, string> = {};

  if (subject.length < 3) fields.subject = 'Ämnesraden behöver en text.';
  if (subject.length > 200) fields.subject = 'Ämnesraden är för lång.';
  if (body.length < 20) fields.body = 'Brevet behöver en text.';
  if (body.length > 10_000) fields.body = 'Brevet är för långt.';

  // En platshållare som inte finns skulle annars nå kunden som tom lucka.
  const unknown = [...placeholders(subject), ...placeholders(body)].filter(
    (name) => !spec.variables.includes(name),
  );
  if (unknown.length > 0) {
    fields.body = `Okänd platshållare: ${[...new Set(unknown)].join(', ')}. Tillgängliga: ${spec.variables.join(', ')}.`;
  }

  if (Object.keys(fields).length > 0) throw new TemplateError('Kontrollera fälten nedan', fields);
  return { subject, body };
}

export async function saveTemplate(
  id: string,
  input: { subject: unknown; body: unknown },
): Promise<TemplateView> {
  const spec = templateSpec(id);
  if (!spec) throw new TemplateError('Den mallen finns inte.');
  const { subject, body } = validate(spec, input);

  return serialize(async () => {
    const store = await load();
    // En text som är lika med utgångsläget sparas inte som en ändring.
    const next = { ...store };
    if (subject === spec.subject && body === spec.body) delete next[id];
    else next[id] = { subject, body, savedAt: new Date().toISOString() };

    await persist(next);
    return (await allTemplates()).find((template) => template.id === id)!;
  });
}

/** Lägger tillbaka texten som koden levererades med. */
export async function resetTemplate(id: string): Promise<TemplateView | undefined> {
  if (!templateSpec(id)) return undefined;
  return serialize(async () => {
    const store = await load();
    const next = { ...store };
    delete next[id];
    await persist(next);
    return (await allTemplates()).find((template) => template.id === id)!;
  });
}
