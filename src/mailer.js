import nodemailer from "nodemailer";

let transporter;
let cachedContent = null;

const LINK_STYLE = "color:#1a73e8;text-decoration:underline";

export function getTransporter() {
  if (transporter) return transporter;

  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "FROM_EMAIL"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing SMTP config in .env: ${missing.join(", ")}`);
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: process.env.SMTP_SECURE !== "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

function link(href, label) {
  return `<a href="${href}" target="_blank" style="${LINK_STYLE}">${label}</a>`;
}

function emailUrls() {
  return {
    pricing: process.env.PRICING_URL ?? "https://www.six-point-o.ch/pricing",
    cta:
      process.env.CTA_URL ??
      "https://www.six-point-o.ch/dashboard/mathe-2?topic=1.1",
    offerUntil: process.env.OFFER_UNTIL ?? '23.5',
  };
}

/** Plain-text fallback (URLs visible if HTML is off). */
/** Extra blank line after each paragraph (Shift+Enter style spacing). */
const PARAGRAPH_GAP_TEXT = "\n\n\n";
const PARAGRAPH_GAP_HTML = "<br><br><br>";

export function getEmailText() {
  const { pricing, cta, offerUntil } = emailUrls();

  return [
    "Hey,",
    "Wir kennen das Gefühl: Man nimmt sich vor, früh anzufangen, und plötzlich steht die Prüfung vor der Tür.",
    "Genau dann hilft dir unser Schnell-Kurs, in wenigen Stunden fit für die Prüfung zu werden.",
    "Unser Kurs wurde von Studierenden erstellt, die das Assessment mit Bestnoten bestanden haben, nicht von Professoren, die vergessen haben, wie sich Prüfungsstress anfühlt. Wir zeigen dir, wie du die wichtigsten Fallen umgehst und das Wesentliche, das wirklich drankommt, schnell löst.",
    "Jetzt Mathe 2 – Tipps & Tricks freischalten, zum reduzierten Preis\n" +
      pricing,
    "Kein Risiko. Kurz & übersichtlich. Nur der kürzeste Weg durch deine Prüfung.",
    "Erstmal kostenlos ausprobieren?\n" + cta,
    `Das Angebot gilt nur noch bis zum ${offerUntil}.`,
    "Viel Erfolg – du schaffst das.\nDein Team von 6.0",
  ].join(PARAGRAPH_GAP_TEXT);
}

/**
 * Simple HTML with &lt;br&gt; line breaks (soft return), not &lt;p&gt; blocks.
 * Outlook and other clients handle &lt;br&gt; more reliably than extra paragraphs.
 */
export function getEmailHtml() {
  const { pricing, cta, offerUntil } = emailUrls();
  const pricingLink = link(
    pricing,
    "Jetzt Mathe 2 – Tipps & Tricks freischalten, zum reduzierten Preis",
  );
  const ctaLink = link(cta, "Erstmal kostenlos ausprobieren?");

  const lines = [
    "Hey,",
    "Wir kennen das Gefühl: Man nimmt sich vor, früh anzufangen, und plötzlich steht die Prüfung vor der Tür.",
    "Genau dann hilft dir unser Schnell-Kurs, in wenigen Stunden fit für die Prüfung zu werden.",
    "Unser Kurs wurde von Studierenden erstellt, die das Assessment mit Bestnoten bestanden haben, nicht von Professoren, die vergessen haben, wie sich Prüfungsstress anfühlt. Wir zeigen dir, wie du die wichtigsten Fallen umgehst und das Wesentliche, das wirklich drankommt, schnell löst.",
    pricingLink,
    "Kein Risiko. Kurz & übersichtlich. Nur der kürzeste Weg durch deine Prüfung.",
    ctaLink,
    `Das Angebot gilt nur noch bis zum ${offerUntil}.`,
    "Viel Erfolg – du schaffst das.<br>Dein Team von 6.0",
  ];

  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${lines.join(PARAGRAPH_GAP_HTML)}</div>`;
}

export function getEmailContent() {
  return { text: getEmailText(), html: getEmailHtml() };
}

export function buildPreviewHtml() {
  if (!cachedContent) {
    cachedContent = getEmailContent();
  }
  return cachedContent.html;
}

export function buildPreviewText() {
  if (!cachedContent) {
    cachedContent = getEmailContent();
  }
  return cachedContent.text;
}

export async function prepareSendContent() {
  if (!cachedContent) {
    cachedContent = getEmailContent();
  }
  return cachedContent;
}

export function clearEmailCache() {
  cachedContent = null;
}

clearEmailCache();

export async function sendTestMail(to) {
  const fromName = process.env.FROM_NAME ?? "6.0 · six-point-o.ch";
  const fromEmail = process.env.FROM_EMAIL;
  const smtpUser = process.env.SMTP_USER ?? fromEmail;

  const info = await getTransporter().sendMail({
    envelope: { from: smtpUser, to },
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: "6.0 Test — bitte prüfen (Posteingang + Spam)",
    text: [
      "Dies ist eine kurze Test-E-Mail von 6.0 (six-point-o.ch).",
      "",
      "Wenn du diese Nachricht siehst, funktioniert SMTP.",
      "",
      "Absender: " + fromEmail,
    ].join("\n"),
  });

  return info.messageId;
}

export async function sendOne(to, subject, content = null) {
  const fromName = process.env.FROM_NAME ?? "6.0 · six-point-o.ch";
  const fromEmail = process.env.FROM_EMAIL;
  const smtpUser = process.env.SMTP_USER ?? fromEmail;
  const replyTo = process.env.REPLY_TO ?? fromEmail;
  const body = content ?? (await prepareSendContent());

  const info = await getTransporter().sendMail({
    envelope: { from: smtpUser, to },
    from: `"${fromName}" <${fromEmail}>`,
    to,
    replyTo: `"${fromName}" <${replyTo}>`,
    subject,
    text: body.text,
    html: body.html,
  });

  return info.messageId;
}

export function getSendDelayMs() {
  return Number(process.env.SEND_DELAY_MS ?? 3000);
}

export function getDailyLimit() {
  return Number(process.env.DAILY_SEND_LIMIT ?? 500);
}
