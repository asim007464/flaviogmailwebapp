import nodemailer from 'nodemailer';
import { loadTemplate } from './loadTemplate.js';
let transporter;
let cachedHtml = null;

export function getTransporter() {
  if (transporter) return transporter;

  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing SMTP config in .env: ${missing.join(', ')}`);
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_SECURE !== 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

function baseTemplateVars() {
  return {
    ctaUrl: process.env.CTA_URL ?? 'https://www.six-point-o.ch/dashboard/mathe-2?topic=1.1',
    pricingUrl: process.env.PRICING_URL ?? 'https://www.six-point-o.ch/pricing',
    unsubscribeUrl: process.env.UNSUBSCRIBE_URL ?? 'https://www.six-point-o.ch/unsubscribe',
  };
}

export async function buildPreviewHtml() {
  if (!cachedHtml) {
    cachedHtml = await loadTemplate(baseTemplateVars());
  }
  return cachedHtml;
}

export async function prepareSendHtml() {
  return buildPreviewHtml();
}

export function clearEmailCache() {
  cachedHtml = null;
}

// Call after template changes so sends use fresh HTML
clearEmailCache();

export function getPlainText() {
  const cta = process.env.CTA_URL ?? 'https://www.six-point-o.ch/dashboard/mathe-2?topic=1.1';
  const pricing = process.env.PRICING_URL ?? 'https://www.six-point-o.ch/pricing';
  const unsub = process.env.UNSUBSCRIBE_URL ?? 'https://www.six-point-o.ch/unsubscribe';
  const from = process.env.FROM_EMAIL ?? 'contactsixpointo@gmail.com';
  return [
    'Mathe 2 - Verpasse nicht unsere Videos zu wichtigen Fallen und Tipps',
    '',
    'Noch nicht bereit für Mathe 2?',
    'Wir zeigen dir die wichtigsten Tipps und gefährlichsten Fallen für die Prüfung.',
    '',
    'Kostenlos testen: ' + cta,
    '',
    'Vollzugang Mathe-2-Kurs: CHF 59 (statt CHF 99). Einmalzahlung, kein Abo.',
    'Preise: ' + pricing,
    '',
    '6.0 Education · Lernplattform UZH Assessment · Zürich',
    'Web: https://www.six-point-o.ch',
    '',
    'Abmelden: ' + unsub,
    'Kontakt: ' + from,
  ].join('\n');
}

/** Plain test mail — better chance to reach Gmail inbox than HTML bulk. */
export async function sendTestMail(to) {
  const fromName = process.env.FROM_NAME ?? '6.0 · six-point-o.ch';
  const fromEmail = process.env.FROM_EMAIL;
  const smtpUser = process.env.SMTP_USER ?? fromEmail;

  const info = await getTransporter().sendMail({
    envelope: { from: smtpUser, to },
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: '6.0 Test — bitte prüfen (Posteingang + Spam)',
    text: [
      'Dies ist eine kurze Test-E-Mail von 6.0 (six-point-o.ch).',
      '',
      'Wenn du diese Nachricht siehst, funktioniert SMTP.',
      'Die Marketing-Mail kann trotzdem im Spam-Ordner landen.',
      '',
      'Absender: ' + fromEmail,
    ].join('\n'),
  });

  return info.messageId;
}

export async function sendOne(to, subject, html = null) {
  const fromName = process.env.FROM_NAME ?? '6.0 · six-point-o.ch';
  const fromEmail = process.env.FROM_EMAIL;
  const smtpUser = process.env.SMTP_USER ?? fromEmail;
  const replyTo = process.env.REPLY_TO ?? fromEmail;
  const unsubscribeUrl =
    process.env.UNSUBSCRIBE_URL ?? 'https://www.six-point-o.ch/unsubscribe';
  const bodyHtml = html ?? (await prepareSendHtml());

  const info = await getTransporter().sendMail({
    envelope: { from: smtpUser, to },
    from: `"${fromName}" <${fromEmail}>`,
    to,
    replyTo: `"${fromName}" <${replyTo}>`,
    subject,
    html: bodyHtml,
    text: getPlainText(),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${replyTo}?subject=Abmelden>`,
    },
  });

  return info.messageId;
}

export function getSendDelayMs() {
  return Number(process.env.SEND_DELAY_MS ?? 3000);
}

export function getDailyLimit() {
  return Number(process.env.DAILY_SEND_LIMIT ?? 500);
}
