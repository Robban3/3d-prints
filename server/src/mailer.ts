import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { formatDate, formatPrice } from './format.ts';
import type { AnyOrder } from './types.ts';
import { shopUrl } from './http.ts';
import { renderTemplate } from './mailTemplates.ts';

/**
 * Utan SMTP-uppgifter skrivs breven till en katalog i stället för att skickas.
 * Då syns exakt vad kunden skulle ha fått, utan att något lämnar maskinen –
 * och gränssnittets löfte om ett bekräftelsemejl motsvaras av något verkligt.
 */
const OUTBOX = () => resolve(process.env.MAIL_OUTBOX ?? 'data/utkorg');
const FROM = () => process.env.MAIL_FROM ?? 'Formlabb <hej@formlabb.se>';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

let transport: Transporter | null | undefined;

function smtpTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  const host = process.env.SMTP_HOST;
  if (!host) {
    transport = null;
    return transport;
  }
  transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' }
      : undefined,
  });
  return transport;
}

export function mailIsConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/** Bara för tester – tvingar fram en ny transport nästa gång. */
export function resetMailer(): void {
  transport = undefined;
}

export async function sendMail(mail: Mail): Promise<{ delivered: boolean; path?: string }> {
  const smtp = smtpTransport();
  if (smtp) {
    await smtp.sendMail({ from: FROM(), to: mail.to, subject: mail.subject, text: mail.text });
    return { delivered: true };
  }

  await mkdir(OUTBOX(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safe = mail.to.replace(/[^\w.@-]/g, '_');
  const path = join(OUTBOX(), `${stamp}-${safe}.eml`);
  const content = [
    `From: ${FROM()}`,
    `To: ${mail.to}`,
    `Subject: ${mail.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    mail.text,
  ].join('\n');
  await writeFile(path, content, 'utf8');
  return { delivered: false, path };
}

function orderRows(order: AnyOrder): string {
  if (order.type === 'shop') {
    return order.lines
      .map((line) => {
        const variant = [line.color, line.size, line.parameterText].filter(Boolean).join(', ');
        return `  ${line.quantity} × ${line.name}${variant ? ` (${variant})` : ''}   ${formatPrice(
          line.unitPrice * line.quantity,
        )}`;
      })
      .join('\n');
  }
  return [
    `  ${order.projectName}`,
    `  ${order.request.quantity} st i ${order.request.material.toUpperCase()}, ${order.request.quality}`,
    order.fileName ? `  Fil: ${order.fileName}` : '  Ingen fil bifogad',
  ].join('\n');
}

/** Första namnet, som brevet hälsar på. */
function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

export async function orderConfirmation(order: AnyOrder): Promise<Mail> {
  const paymentLine = order.payment
    ? order.payment.test
      ? 'Betalning: ingen betalning har genomförts (butiken kör i testläge).'
      : `Betalning: Klarna${order.payment.reference ? `, referens ${order.payment.reference}` : ''}.`
    : 'Betalning: du får en separat betalningslänk.';

  const summary = [
    ...(order.type === 'shop' && order.discount
      ? [`Rabatt (${order.discount.label}): −${formatPrice(order.discount.amount)}`]
      : []),
    ...(order.type === 'shop' && order.shipping > 0
      ? [
          `Frakt${order.shippingOption ? ` (${order.shippingOption.name})` : ''}: ${formatPrice(order.shipping)}`,
        ]
      : []),
    `Totalt: ${formatPrice(order.total)}`,
  ].join('\n');

  const rendered = await renderTemplate('orderbekraftelse', {
    kund: firstName(order.customer.name),
    ordernummer: order.id,
    datum: formatDate(order.createdAt),
    rader: orderRows(order),
    summering: summary,
    betalning: paymentLine,
    adress: [
      `  ${order.customer.name}`,
      `  ${order.customer.address}`,
      `  ${order.customer.postalCode} ${order.customer.city}`,
    ].join('\n'),
    lank: `${shopUrl()}/spara-order?id=${order.id}`,
  });

  return { to: order.customer.email, ...rendered };
}

/** En sparad offert, skickad till den som vill återkomma eller skicka vidare. */
export async function savedQuoteMail(options: {
  to: string;
  id: string;
  projectName: string;
  total: number;
  deliveryDays: number;
  expiresAt: string;
}): Promise<Mail> {
  const rendered = await renderTemplate('offert', {
    projekt: options.projectName,
    pris: formatPrice(options.total),
    leveransdagar: String(options.deliveryDays),
    lank: `${shopUrl()}/offert/${options.id}`,
    giltigtill: formatDate(options.expiresAt),
  });
  return { to: options.to, ...rendered };
}

/** Beskedet till den som bevakat en slutsåld produkt. */
export async function backInStock(options: {
  to: string;
  productName: string;
  slug: string;
  stock: number;
}): Promise<Mail> {
  const rendered = await renderTemplate('lagerbesked', {
    produkt: options.productName,
    saldo:
      options.stock <= 3
        ? `Det är bara ${options.stock} kvar, så det kan gå fort.`
        : `Vi har ${options.stock} i lager.`,
    lank: `${shopUrl()}/produkter/${options.slug}`,
  });
  return { to: options.to, ...rendered };
}

/** Statusar som kunden får brev om. Mottagen och avbruten gör det inte. */
const statusTemplates: Record<string, string> = {
  i_produktion: 'status_i_produktion',
  skickad: 'status_skickad',
  levererad: 'status_levererad',
};

export async function statusUpdate(order: AnyOrder): Promise<Mail | undefined> {
  const templateId = statusTemplates[order.status];
  if (!templateId) return undefined;

  const rendered = await renderTemplate(templateId, {
    kund: firstName(order.customer.name),
    ordernummer: order.id,
    lank: `${shopUrl()}/spara-order?id=${order.id}`,
  });
  return { to: order.customer.email, ...rendered };
}
