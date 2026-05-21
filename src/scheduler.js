import { readFile, writeFile, mkdir } from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendOne, prepareSendContent, clearEmailCache, getSendDelayMs } from './mailer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Vercel/Lambda: /var/task is read-only — never store queue in project "data/".
// Best on live: CAMPAIGN_DATA_DIR=/tmp/flavioemail-data (also in vercel.json).

const TMP_STORAGE = join(os.tmpdir(), 'flavioemail-data');
let resolvedStorageDir = null;

function isServerless() {
  const cwd = process.cwd();
  return Boolean(
    process.env.VERCEL === '1' ||
      process.env.VERCEL === 'true' ||
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      __dirname.includes('var/task') ||
      cwd.includes('var/task') ||
      __dirname.includes('\\var\\task')
  );
}

function preferredDataDir() {
  if (process.env.CAMPAIGN_DATA_DIR) return process.env.CAMPAIGN_DATA_DIR;
  if (isServerless()) return TMP_STORAGE;
  return join(__dirname, '..', 'data');
}

export function getDataDir() {
  return resolvedStorageDir ?? preferredDataDir();
}

function getQueueFile() {
  return join(getDataDir(), 'campaign.json');
}

async function ensureDataDir() {
  if (resolvedStorageDir) {
    await mkdir(resolvedStorageDir, { recursive: true });
    return resolvedStorageDir;
  }

  const candidates = [
    preferredDataDir(),
    TMP_STORAGE,
  ];

  const unique = [...new Set(candidates)];
  let lastError;

  for (const dir of unique) {
    try {
      await mkdir(dir, { recursive: true });
      resolvedStorageDir = dir;
      return dir;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError ?? new Error('Could not create campaign storage directory');
}

let timer = null;
let runningBatch = false;

export function getBatchSize() {
  return Number(process.env.BATCH_SIZE ?? 20);
}

export function getBatchIntervalMs() {
  return Number(process.env.BATCH_INTERVAL_MS ?? 60 * 60 * 1000);
}

async function loadCampaign() {
  try {
    const raw = await readFile(getQueueFile(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCampaign(campaign) {
  await ensureDataDir();
  await writeFile(getQueueFile(), JSON.stringify(campaign, null, 2), 'utf8');
}

export async function getCampaignStatus() {
  const c = await loadCampaign();
  if (!c) {
    return {
      active: false,
      batchSize: getBatchSize(),
      batchIntervalMs: getBatchIntervalMs(),
      storageDir: getDataDir(),
    };
  }

  const total = c.pending.length + c.sent.length + c.failed.length;
  const done = c.pending.length === 0 && !runningBatch;

  return {
    active: c.status === 'running' && !done,
    status: done ? 'completed' : c.status,
    subject: c.subject,
    total,
    pending: c.pending.length,
    sent: c.sent.length,
    failed: c.failed.length,
    batchSize: c.batchSize,
    batchIntervalMs: c.batchIntervalMs,
    nextBatchAt: c.nextBatchAt,
    lastBatchAt: c.lastBatchAt,
    runningBatch,
    recentSent: c.sent.slice(-5).map((s) => s.to),
    recentFailed: c.failed.slice(-5),
    storageDir: getDataDir(),
  };
}

function scheduleNextBatch(campaign) {
  if (timer) clearTimeout(timer);
  if (campaign.status !== 'running' || campaign.pending.length === 0) {
    if (campaign.pending.length === 0) campaign.status = 'completed';
    return;
  }

  // Vercel/serverless: no long-lived timers — use /api/campaign/cron instead
  if (isServerless()) return;

  const delay = Math.max(0, new Date(campaign.nextBatchAt).getTime() - Date.now());
  timer = setTimeout(() => {
    runNextBatch().catch((e) => console.error('Campaign batch error:', e.message));
  }, delay);
}

async function runNextBatch() {
  if (runningBatch) return { skipped: true, reason: 'batch_already_running' };
  const campaign = await loadCampaign();
  if (!campaign || campaign.status !== 'running' || campaign.pending.length === 0) {
    return { skipped: true, reason: 'no_active_campaign' };
  }

  runningBatch = true;
  const batchSize = campaign.batchSize ?? getBatchSize();
  const delayMs = getSendDelayMs();
  const batch = campaign.pending.splice(0, batchSize);

  clearEmailCache();
  let content;
  try {
    content = await prepareSendContent();
  } catch (e) {
    campaign.pending.unshift(...batch);
    campaign.status = 'error';
    campaign.lastError = e.message;
    await saveCampaign(campaign);
    runningBatch = false;
    throw e;
  }

  console.log(`Campaign: sending batch of ${batch.length} (${campaign.sent.length} already sent)`);

  for (let i = 0; i < batch.length; i++) {
    const to = batch[i];
    try {
      const messageId = await sendOne(to, campaign.subject, content);
      campaign.sent.push({ to, at: new Date().toISOString(), messageId });
    } catch (e) {
      campaign.failed.push({ to, at: new Date().toISOString(), error: e.message });
    }
    if (i < batch.length - 1) await new Promise((r) => setTimeout(r, delayMs));
  }

  campaign.lastBatchAt = new Date().toISOString();

  if (campaign.pending.length > 0) {
    campaign.nextBatchAt = new Date(
      Date.now() + (campaign.batchIntervalMs ?? getBatchIntervalMs())
    ).toISOString();
    campaign.status = 'running';
  } else {
    campaign.status = 'completed';
    campaign.nextBatchAt = null;
  }

  await saveCampaign(campaign);
  runningBatch = false;
  scheduleNextBatch(campaign);

  return {
    sent: batch.length,
    pending: campaign.pending.length,
    failed: campaign.failed.length,
  };
}

/** Called by Vercel Cron every few minutes to send the next batch when due. */
export async function processDueBatch() {
  const campaign = await loadCampaign();
  if (!campaign || campaign.status !== 'running' || campaign.pending.length === 0) {
    return { processed: false, reason: 'nothing_due' };
  }

  const nextAt = campaign.nextBatchAt
    ? new Date(campaign.nextBatchAt).getTime()
    : 0;

  if (nextAt > Date.now()) {
    return {
      processed: false,
      reason: 'not_due_yet',
      nextBatchAt: campaign.nextBatchAt,
    };
  }

  const result = await runNextBatch();
  return { processed: true, ...result };
}

export async function startCampaign(emails, subject) {
  const existing = await loadCampaign();
  if (existing?.status === 'running' && existing.pending.length > 0) {
    throw new Error('Es läuft bereits eine Kampagne. Bitte warten oder abbrechen.');
  }

  const unique = [...new Set(
    emails.map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes('@'))
  )];

  if (unique.length === 0) {
    throw new Error('Keine gültigen E-Mail-Adressen');
  }

  const campaign = {
    status: 'running',
    subject,
    pending: unique,
    sent: [],
    failed: [],
    batchSize: getBatchSize(),
    batchIntervalMs: getBatchIntervalMs(),
    startedAt: new Date().toISOString(),
    lastBatchAt: null,
    nextBatchAt: new Date().toISOString(),
    lastError: null,
  };

  await saveCampaign(campaign);
  await runNextBatch();
  return getCampaignStatus();
}

export async function cancelCampaign() {
  if (timer) clearTimeout(timer);
  timer = null;
  const campaign = await loadCampaign();
  if (!campaign) return { cancelled: false };
  campaign.status = 'cancelled';
  campaign.nextBatchAt = null;
  await saveCampaign(campaign);
  return { cancelled: true, pending: campaign.pending.length };
}

export async function resumeCampaignOnStartup() {
  if (isServerless()) {
    await processDueBatch();
    return;
  }

  const campaign = await loadCampaign();
  if (!campaign || campaign.status !== 'running' || campaign.pending.length === 0) {
    return;
  }

  const nextAt = campaign.nextBatchAt
    ? new Date(campaign.nextBatchAt).getTime()
    : Date.now();

  if (nextAt <= Date.now()) {
    console.log('Campaign: resuming overdue batch…');
    await runNextBatch();
  } else {
    console.log(
      `Campaign: ${campaign.pending.length} pending, next batch at ${campaign.nextBatchAt}`
    );
    scheduleNextBatch(campaign);
  }
}
