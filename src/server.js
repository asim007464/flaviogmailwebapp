import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseEmailsFromExcel } from './parseExcel.js';
import {
  buildPreviewHtml,
  sendOne,
  sendTestMail,
  prepareSendContent,
  clearEmailCache,
  getSendDelayMs,
  getDailyLimit,
  getTransporter,
} from './mailer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname || '';
    const ok = /\.(xlsx|xls)$/i.test(name);
    cb(ok ? null : new Error('Nur .xlsx oder .xls Dateien erlaubt'), ok);
  },
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));
app.get('/sample-recipients.xlsx', (_req, res) => {
  res.sendFile(join(__dirname, '..', 'sample-recipients.xlsx'));
});

app.get('/api/health', async (_req, res) => {
  try {
    const transport = getTransporter();
    await transport.verify();
    res.json({
      ok: true,
      from: process.env.FROM_EMAIL,
      smtpHost: process.env.SMTP_HOST,
      smtpUser: process.env.SMTP_USER,
      dailyLimit: getDailyLimit(),
      sendDelayMs: getSendDelayMs(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/preview', (_req, res) => {
  try {
    const html = buildPreviewHtml();
    res.type('html; charset=utf-8').send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes('allowed')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

app.post('/api/test-send', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Gültige E-Mail angeben' });
  }
  try {
    getTransporter();
    const messageId = await sendTestMail(email);
    res.json({
      ok: true,
      to: email,
      messageId,
      hint: 'Prüfe Posteingang UND Spam. Suche: from:kontakt@six-point-o.ch',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/parse-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const result = parseEmailsFromExcel(req.file.buffer);
    res.json({
      ...result,
      fileName: req.file.originalname,
      dailyLimit: getDailyLimit(),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/send', async (req, res) => {
  const { emails, subject } = req.body ?? {};
  const defaultSubject =
    'Mathe 2 - Verpasse nicht unsere Videos zu wichtigen Fallen und Tipps';
  const mailSubject =
    typeof subject === 'string' && subject.trim() ? subject.trim() : defaultSubject;

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'No recipients provided' });
  }

  const limit = getDailyLimit();
  if (emails.length > limit) {
    return res.status(400).json({
      error: `Too many recipients (${emails.length}). Limit is ${limit} per run/day (see DAILY_SEND_LIMIT in .env).`,
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const delay = getSendDelayMs();
  let sent = 0;
  let failed = 0;
  const errors = [];

  try {
    getTransporter();
  } catch (e) {
    sendEvent({ type: 'error', message: e.message });
    return res.end();
  }

  const uniqueEmails = [...new Set(
    emails.map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes('@'))
  )];

  sendEvent({ type: 'start', total: uniqueEmails.length, delayMs: delay });

  clearEmailCache();
  let content;
  try {
    content = await prepareSendContent();
  } catch (e) {
    sendEvent({ type: 'error', message: 'E-Mail Inhalt: ' + e.message });
    return res.end();
  }

  for (let i = 0; i < uniqueEmails.length; i++) {
    const to = uniqueEmails[i];
    try {
      const messageId = await sendOne(to, mailSubject, content);
      sent++;
      sendEvent({ type: 'progress', index: i + 1, total: uniqueEmails.length, to, status: 'sent', messageId });
    } catch (e) {
      failed++;
      errors.push({ to, error: e.message });
      sendEvent({ type: 'progress', index: i + 1, total: uniqueEmails.length, to, status: 'failed', error: e.message });
    }

    if (i < uniqueEmails.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  sendEvent({ type: 'done', sent, failed, errors });
  res.end();
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`6.0 Email Sender: http://localhost:${port}`);
  console.log(`SMTP: ${process.env.SMTP_USER} @ ${process.env.SMTP_HOST}`);
  console.log(`From: ${process.env.FROM_EMAIL}`);
});
