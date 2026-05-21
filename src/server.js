import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseEmailsFromExcel } from './parseExcel.js';
import {
  buildPreviewHtml,
  sendTestMail,
  clearEmailCache,
  getSendDelayMs,
  getDailyLimit,
  getTransporter,
} from './mailer.js';
import {
  checkCredentials,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser,
  requireAuth,
} from './auth.js';
import {
  startCampaign,
  getCampaignStatus,
  cancelCampaign,
  resumeCampaignOnStartup,
  processDueBatch,
  getBatchSize,
  getBatchIntervalMs,
} from './scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname || '';
    const ok = /\.(xlsx|xls)$/i.test(name);
    cb(ok ? null : new Error('Nur .xlsx oder .xls Dateien erlaubt'), ok);
  },
});

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(publicDir));

app.get('/sample-recipients.xlsx', (_req, res) => {
  res.sendFile(join(__dirname, '..', 'sample-recipients.xlsx'));
});

app.post('/api/login', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!checkCredentials(username, password)) {
    return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
  }
  setSessionCookie(res, createSessionToken(username));
  res.json({ ok: true, user: username });
});

app.post('/api/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false });
  res.json({ ok: true, user });
});

// Live (Vercel): campaign queue file must live in /tmp — see CAMPAIGN_DATA_DIR in vercel.json.
/** Vercel Cron: sends next email batch when due (serverless has no background timers). */
app.get('/api/campaign/cron', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  try {
    const result = await processDueBatch();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.use('/api', requireAuth);

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
      batchSize: getBatchSize(),
      batchIntervalMs: getBatchIntervalMs(),
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

app.get('/api/campaign/status', async (_req, res) => {
  try {
    res.json(await getCampaignStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/campaign/start', async (req, res) => {
  const { emails, subject } = req.body ?? {};
  const defaultSubject =
    'Mathe 2 - Verpasse nicht unsere Videos zu wichtigen Fallen und Tipps';
  const mailSubject =
    typeof subject === 'string' && subject.trim() ? subject.trim() : defaultSubject;

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'Keine Empfänger' });
  }

  try {
    getTransporter();
    const status = await startCampaign(emails, mailSubject);
    res.json({ ok: true, ...status });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/campaign/cancel', async (_req, res) => {
  try {
    const result = await cancelCampaign();
    res.json({ ok: true, ...result });
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
      hint: 'Prüfe Posteingang UND Spam.',
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
      batchSize: getBatchSize(),
      batchIntervalMs: getBatchIntervalMs(),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
const isVercel = Boolean(process.env.VERCEL);

if (!isVercel) {
  app.listen(port, async () => {
    console.log(`6.0 Email Sender: http://localhost:${port}`);
    console.log(`SMTP: ${process.env.SMTP_USER} @ ${process.env.SMTP_HOST}`);
    console.log(`From: ${process.env.FROM_EMAIL}`);
    console.log(`Batch: ${getBatchSize()} emails every ${getBatchIntervalMs() / 60000} min`);
    await resumeCampaignOnStartup();
  });
}

export default app;
