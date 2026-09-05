import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { formatDate, formatPrice } from './format.ts';
import type { AnyOrder } from './types.ts';

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
        const variant = [line.color, line.size].filter(Boolean).join(', ');
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

export function orderConfirmation(order: AnyOrder): Mail {
  const paymentLine = order.payment
    ? order.payment.test
      ? 'Betalning: ingen betalning har genomförts (butiken kör i testläge).'
      : `Betalning: Klarna${order.payment.reference ? `, referens ${order.payment.reference}` : ''}.`
    : 'Betalning: du får en separat betalningslänk.';

  return {
    to: order.customer.email,
    subject: `Tack för din beställning ${order.id}`,
    text: [
      `Hej ${order.customer.name.split(' ')[0]}!`,
      '',
      `Vi har tagit emot din beställning ${order.id} den ${formatDate(order.createdAt)}.`,
      '',
      'Din beställning:',
      orderRows(order),
      '',
      `Totalt: ${formatPrice(order.total)}`,
      paymentLine,
      '',
      'Levereras till:',
      `  ${order.customer.name}`,
      `  ${order.customer.address}`,
      `  ${order.customer.postalCode} ${order.customer.city}`,
      '',
      `Följ din order: https://formlabb.se/spara-order?id=${order.id}`,
      '',
      'Hälsningar,',
      'Formlabb, Tredje Långgatan 14, Göteborg',
    ].join('\n'),
  };
}

const statusMessages: Record<string, { subject: string; body: string }> = {
  i_produktion: {
    subject: 'Din order har gått i produktion',
    body: 'Din order ligger nu i printkön och produktionen har startat. Vi hör av oss igen när den skickas.',
  },
  skickad: {
    subject: 'Din order är på väg',
    body: 'Din order har lämnat verkstaden och är på väg med PostNord. Den brukar komma fram inom två arbetsdagar.',
  },
  levererad: {
    subject: 'Din order är levererad',
    body: 'Din order är levererad. Hoppas den blev som du tänkte dig – hör av dig om något inte stämmer.',
  },
};

export function statusUpdate(order: AnyOrder): Mail | undefined {
  const message = statusMessages[order.status];
  if (!message) return undefined;
  return {
    to: order.customer.email,
    subject: `${message.subject} (${order.id})`,
    text: [
      `Hej ${order.customer.name.split(' ')[0]}!`,
      '',
      message.body,
      '',
      `Ordernummer: ${order.id}`,
      `Följ din order: https://formlabb.se/spara-order?id=${order.id}`,
      '',
      'Hälsningar,',
      'Formlabb',
    ].join('\n'),
  };
}
