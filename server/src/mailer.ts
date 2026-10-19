import { mkdir } from 'node:fs/promises';
import { writeFile } from './stateFiles.ts';
import { join, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { formatDate, formatPrice } from './format.ts';
import type { AnyOrder } from './types.ts';
import { orderTrackingUrl } from './orderAccess.ts';

/**
 * Utan SMTP-uppgifter skrivs breven till en katalog i stället för att skickas.
 * Då syns exakt vad kunden skulle ha fått, utan att något lämnar maskinen –
 * och gränssnittets löfte om ett bekräftelsemejl motsvaras av något verkligt.
 */
const OUTBOX = () => resolve(process.env.MAIL_OUTBOX ?? 'data/utkorg');
const FROM = () => process.env.MAIL_FROM ?? 'Formlabb.se <no-reply@formlabb.se>';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
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
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
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
    await smtp.sendMail({ from: FROM(), ...mail });
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
    ...(mail.replyTo ? [`Reply-To: ${mail.replyTo}`] : []),
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
        const variant = [line.color, line.size, line.personalization ? `${line.personalization.includes(' / ') ? 'Text' : 'Namn'}: ${line.personalization}` : undefined].filter(Boolean).join(', ');
        return `  ${line.quantity} × ${line.name}${line.articleNumber ? ` [${line.articleNumber}]` : ''}${variant ? ` (${variant})` : ''}   ${formatPrice(
          line.unitPrice * line.quantity,
        )}`;
      })
      .join('\n');
  }
  return [
    `  ${order.projectName}`,
    ...(order.articleNumber ? [`  Artikelnummer: ${order.articleNumber}`] : []),
    `  ${order.request.quantity} st i ${order.request.material.toUpperCase()}, ${order.request.quality}`,
    order.fileName ? `  Fil: ${order.fileName}` : '  Ingen fil bifogad',
  ].join('\n');
}

export function orderConfirmation(order: AnyOrder): Mail {
  const paymentLine = order.payment
    ? order.payment.test
      ? 'Betalning: ingen betalning har genomförts (butiken kör i testläge).'
      : `Betalning: Klarna${order.payment.reference ? `, referens ${order.payment.reference}` : ''}.`
    : 'Betalning: betalningsuppgifter saknas. Kontakta support@formlabb.se innan du betalar.';

  return {
    to: order.customer.email,
    replyTo: 'Formlabb.se <support@formlabb.se>',
    subject: `Orderbekräftelse ${order.id} – Formlabb.se`,
    html: confirmationHtml(order, paymentLine),
    text: [
      `Hej ${order.customer.name.split(' ')[0]}!`,
      '',
      `Vi har tagit emot din beställning ${order.id} den ${formatDate(order.createdAt)}.`,
      '',
      'Din beställning:',
      orderRows(order),
      '',
      `Totalt: ${formatPrice(order.total)}`,
      ...(order.type === 'shop' ? [`Varor: ${formatPrice(order.subtotal)}`, `Frakt: ${formatPrice(order.shipping)}`] : []),
      'Priser inklusive moms.',
      paymentLine,
      '',
      'Levereras till:',
      `  ${order.customer.name}`,
      `  ${order.customer.address}`,
      `  ${order.customer.postalCode} ${order.customer.city}`,
      '',
      `Din privata orderlänk (dela den inte): ${orderTrackingUrl(order)}`,
      'Nästa steg: Vi går igenom din beställning och meddelar dig när den går i produktion och när den skickas.',
      'Frågor? Svara på det här mejlet eller kontakta support@formlabb.se.',
      '',
      'Hälsningar,',
      'Formlabb, Ebbe Lieberathsgatan 25, Göteborg',
    ].join('\n'),
  };
}

/** Exempel utan lagrad order, betalning eller privat orderlänk. */
export function orderConfirmationExample(to: string): Mail {
  const mail = orderConfirmation({ id: 'EXEMPEL-1001', type: 'shop', createdAt: new Date().toISOString(), status: 'mottagen', customer: { name: 'Exempelkund', email: to, address: 'Exempelgatan 1', postalCode: '123 45', city: 'Exempelstad' }, lines: [{ productId: 'example', name: 'Luciatåget – komplett set', quantity: 1, unitPrice: 499, color: 'Originalfärger' }], subtotal: 499, shipping: 59, total: 558, payment: { provider: 'klarna', status: 'obetald', test: true }, history: [] });
  mail.subject = 'EXEMPEL – din nya orderbekräftelse från Formlabb.se';
  mail.html = mail.html!.replace(/<a href="[^"]*\/spara-order\?[^"]*"[^>]*>Visa din beställning →<\/a>/, '<span style="display:inline-block;padding:16px 24px;color:#fff">Exempel – ingen riktig order har skapats</span>').replace('<h1 ', '<p style="background:#fff0c9;padding:12px;font-weight:bold">DESIGNEXEMPEL – ingen beställning eller betalning har skapats.</p><h1 ');
  mail.text = 'DESIGNEXEMPEL – ingen beställning eller betalning har skapats.\n\n' + mail.text.replace(/Din privata orderlänk \(dela den inte\): .*/, 'Exempel – ingen ordersida finns.');
  return mail;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function confirmationHtml(order: AnyOrder, payment: string): string {
  const e = escapeHtml;
  const row = (label: string, value: string, bold = false) => `<tr><td style="padding:8px 0;${bold ? 'font-weight:700;font-size:20px' : ''}">${e(label)}</td><td align="right" style="padding:8px 0;white-space:nowrap;${bold ? 'font-weight:700;font-size:20px' : ''}">${e(value)}</td></tr>`;
  const items = order.type === 'shop' ? order.lines.map(line => `<tr><td style="padding:18px 0;border-bottom:1px solid #e4e5dd"><strong>${e(line.name)}</strong>${line.articleNumber ? `<br><span style="font-size:12px;color:#59645d">Artikelnummer: ${e(line.articleNumber)}</span>` : ''}<br><span style="font-size:13px;color:#59645d">${e([line.color, line.size, line.personalization ? `Personlig text: ${line.personalization}` : ''].filter(Boolean).join(' · '))}</span><br><span style="font-size:13px;color:#59645d">${line.quantity} st × ${e(formatPrice(line.unitPrice))}</span></td><td align="right" style="padding:18px 0;border-bottom:1px solid #e4e5dd;white-space:nowrap;vertical-align:top">${e(formatPrice(line.quantity * line.unitPrice))}</td></tr>`).join('') : `<tr><td style="padding:18px 0"><strong>${e(order.projectName)}</strong>${order.articleNumber ? `<br>Artikelnummer: ${e(order.articleNumber)}` : ''}<br>${order.request.quantity} st · ${e(order.request.material.toUpperCase())} · ${e(order.request.quality)}${order.fileName ? `<br>Fil: ${e(order.fileName)}` : ''}</td></tr>`;
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Din orderbekräftelse</title></head><body style="margin:0;background:#f3f2ed;color:#213b2c;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">Vi har tagit emot din beställning ${e(order.id)}. Här hittar du din orderöversikt.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff"><tr><td style="background:#183d2d;color:#fff;padding:28px 32px;font-size:28px;letter-spacing:2px;font-weight:bold">FORMLABB<span style="font-size:15px;letter-spacing:0">.se</span><div style="font-size:11px;letter-spacing:2px;font-weight:normal;margin-top:8px">DESIGNAT & 3D-PRINTAT I GÖTEBORG</div></td></tr><tr><td style="padding:32px"><div style="font-size:12px;letter-spacing:2px;color:#69735d">ORDERBEKRÄFTELSE</div><h1 style="font-size:28px;line-height:1.2;margin:12px 0 18px">Tack för din beställning!</h1><p style="line-height:1.7">Hej ${e(order.customer.name.split(' ')[0] ?? '')}!<br>Vi har tagit emot din beställning. Här är en sammanställning av det du har beställt.</p><div style="background:#f3f2ed;padding:16px 20px;line-height:1.8;font-size:14px"><strong>Ordernummer:</strong> ${e(order.id)}<br><strong>Beställd:</strong> ${e(formatDate(order.createdAt))}</div><h2 style="font-size:18px;margin:28px 0 0">Din beställning</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px">${order.type === 'shop' ? row('Varor', formatPrice(order.subtotal)) + row('Frakt', order.shipping === 0 ? 'Fri frakt' : formatPrice(order.shipping)) : ''}${row('Totalt', formatPrice(order.total), true)}</table><p style="font-size:12px;color:#59645d;margin-top:4px">Alla priser är inklusive moms.</p><div style="border-left:3px solid #b09b65;background:#faf8f1;padding:14px 16px;font-size:14px;line-height:1.6">${e(payment)}</div><h2 style="font-size:18px;margin:28px 0 10px">Leveransadress</h2><p style="line-height:1.7;margin:0">${e(order.customer.name)}<br>${e(order.customer.address)}<br>${e(order.customer.postalCode)} ${e(order.customer.city)}</p><h2 style="font-size:18px;margin:28px 0 10px">Vad händer nu?</h2><p style="line-height:1.7;margin:0 0 24px">Vi går igenom din beställning. Du får ett nytt mejl när den går i produktion och när den skickas. Aktuell status finns på din ordersida.</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#183d2d;border-radius:4px"><a href="${e(orderTrackingUrl(order))}" style="display:inline-block;padding:16px 24px;color:#fff;text-decoration:none;font-weight:bold">Visa din beställning →</a></td></tr></table><p style="font-size:12px;color:#59645d;line-height:1.6">Orderlänken är personlig. Dela den inte med andra.</p><p style="border-top:1px solid #e4e5dd;padding-top:22px;line-height:1.7;margin-top:26px"><strong>Vi hjälper dig gärna.</strong><br>Svara på det här mejlet eller skriv till <a href="mailto:support@formlabb.se" style="color:#183d2d">support@formlabb.se</a>. Ange ditt ordernummer när du kontaktar oss.</p></td></tr><tr><td style="padding:22px 32px;background:#eeeee6;font-size:12px;line-height:1.8;color:#59645d"><strong>Formlabb.se · P.C Service & Säkerhet AB</strong><br>Org.nr 559512-7381 · Ebbe Lieberathsgatan 25, 412 83 Göteborg<br><a href="https://formlabb.se" style="color:#183d2d">formlabb.se</a> · <a href="https://formlabb.se/om-oss" style="color:#183d2d">Kundservice & köpvillkor</a></td></tr></table></td></tr></table></body></html>`;
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
      `Din privata orderlänk (dela den inte): ${orderTrackingUrl(order)}`,
      '',
      'Hälsningar,',
      'Formlabb',
    ].join('\n'),
  };
}
