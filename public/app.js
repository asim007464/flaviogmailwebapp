const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const emailList = document.getElementById('emailList');
const emailCount = document.getElementById('emailCount');
const uploadMeta = document.getElementById('uploadMeta');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const subjectInput = document.getElementById('subject');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultBox = document.getElementById('resultBox');
const smtpStatus = document.getElementById('smtpStatus');
const sendLogPanel = document.getElementById('sendLogPanel');
const sendLog = document.getElementById('sendLog');
const sendLogSummary = document.getElementById('sendLogSummary');
const testEmailInput = document.getElementById('testEmail');
const testSendBtn = document.getElementById('testSendBtn');
const testSendResult = document.getElementById('testSendResult');
const previewText = document.getElementById('previewText');
const logoutBtn = document.getElementById('logoutBtn');
const campaignPanel = document.getElementById('campaignPanel');
const campaignInfo = document.getElementById('campaignInfo');
const cancelCampaignBtn = document.getElementById('cancelCampaignBtn');

let emails = [];
let batchSize = 20;
let batchIntervalMs = 3600000;
let sending = false;
let uploading = false;
let smtpFrom = '';
let campaignPollTimer = null;

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (res.status === 401) {
    location.href = '/login.html';
    throw new Error('Nicht angemeldet');
  }
  return res;
}

async function ensureAuth() {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (!res.ok) {
    location.href = '/login.html';
    return false;
  }
  return true;
}

async function checkHealth() {
  try {
    const res = await api('/api/health');
    const data = await res.json();
    if (data.ok) {
      smtpFrom = data.from;
      smtpStatus.textContent = `SMTP OK · ${data.from}`;
      smtpStatus.title = `${data.smtpUser} @ ${data.smtpHost}`;
      smtpStatus.classList.remove('error', 'sending');
      batchSize = data.batchSize ?? 20;
      batchIntervalMs = data.batchIntervalMs ?? 3600000;
    } else {
      throw new Error(data.error || 'SMTP not configured');
    }
  } catch (e) {
    if (e.message === 'Nicht angemeldet') return;
    smtpStatus.textContent = 'SMTP fehlt';
    smtpStatus.title = e.message || '.env prüfen';
    smtpStatus.classList.add('error');
  }
}

function formatDuration(ms) {
  if (ms <= 0) return 'gleich';
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

function updateCampaignUI(status) {
  if (!campaignPanel || !campaignInfo) return;

  if (!status.active && status.status !== 'completed') {
    campaignPanel.classList.add('hidden');
    cancelCampaignBtn?.classList.add('hidden');
    return;
  }

  campaignPanel.classList.remove('hidden');
  const total = status.total ?? 0;
  const done = (status.sent ?? 0) + (status.failed ?? 0);
  const hoursLeft = status.pending
    ? Math.ceil(status.pending / (status.batchSize || batchSize))
    : 0;

  let info = `${done} / ${total} verarbeitet · ${status.sent ?? 0} gesendet`;
  if (status.failed) info += ` · ${status.failed} Fehler`;

  if (status.active) {
    const nextMs = status.nextBatchAt
      ? new Date(status.nextBatchAt).getTime() - Date.now()
      : 0;
    info += `<br>Nächste ${status.batchSize || batchSize} E-Mails in <strong>${formatDuration(nextMs)}</strong>`;
    info += `<br><em>Server muss laufen</em> — ca. ${hoursLeft} Stunde(n) für die restlichen Batches.`;
    cancelCampaignBtn?.classList.remove('hidden');
  } else if (status.status === 'completed') {
    info += '<br><strong>Kampagne abgeschlossen.</strong>';
    cancelCampaignBtn?.classList.add('hidden');
  }

  campaignInfo.innerHTML = info;
}

async function pollCampaignStatus() {
  try {
    const res = await api('/api/campaign/status');
    const status = await res.json();
    updateCampaignUI(status);
    if (status.active) {
      sendBtn.disabled = true;
      sending = true;
    } else if (!uploading && emails.length > 0) {
      sending = false;
      sendBtn.disabled = false;
    }
    return status;
  } catch {
    return null;
  }
}

function startCampaignPolling() {
  if (campaignPollTimer) clearInterval(campaignPollTimer);
  pollCampaignStatus();
  campaignPollTimer = setInterval(pollCampaignStatus, 15000);
}

function renderList() {
  if (emails.length === 0) {
    emailList.innerHTML = '<li class="empty">Noch keine E-Mails geladen</li>';
    if (!sending) sendBtn.disabled = true;
    clearBtn.classList.add('hidden');
    emailCount.textContent = '0 Empfänger';
    return;
  }

  emailList.innerHTML = emails.map((e) => `<li>${escapeHtml(e)}</li>`).join('');
  const batches = Math.ceil(emails.length / batchSize);
  const hours = Math.max(0, batches - 1);
  emailCount.textContent =
    `${emails.length} Empfänger · ${batches} Batch(es) à ${batchSize} · ca. ${hours} Std.`;
  if (!sending) sendBtn.disabled = emails.length === 0;
  clearBtn.classList.remove('hidden');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function clearSendLog() {
  sendLog.innerHTML = '';
  sendLogSummary.textContent = '';
}

function appendLog(message, type = 'info') {
  const li = document.createElement('li');
  li.className = type;
  li.textContent = message;
  sendLog.appendChild(li);
  sendLog.scrollTop = sendLog.scrollHeight;
}

function isExcelFile(file) {
  return file && /\.(xlsx|xls)$/i.test(file.name);
}

async function handleFile(file) {
  if (!file || uploading) return;

  if (!isExcelFile(file)) {
    uploadMeta.classList.remove('hidden');
    uploadMeta.textContent = 'Fehler: Bitte eine .xlsx oder .xls Datei wählen.';
    return;
  }

  uploading = true;
  dropzone.classList.add('loading');

  const form = new FormData();
  form.append('file', file);

  uploadMeta.classList.remove('hidden');
  uploadMeta.textContent = 'Datei wird gelesen…';
  resultBox.classList.add('hidden');

  try {
    const res = await api('/api/parse-excel', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');

    emails = data.emails;
    batchSize = data.batchSize ?? batchSize;
    batchIntervalMs = data.batchIntervalMs ?? batchIntervalMs;

    uploadMeta.textContent =
      `${data.fileName}: ${data.emails.length} E-Mail(s)` +
      (data.column ? ` · Spalte „${data.column}"` : '') +
      ` · ${data.totalRows} Zeilen`;

    if (data.emails.length === 0) {
      uploadMeta.textContent += ' — Keine gültigen E-Mails gefunden.';
    } else {
      dropzone.classList.add('success');
    }
  } catch (e) {
    uploadMeta.textContent = 'Fehler: ' + e.message;
    emails = [];
    dropzone.classList.remove('success');
  } finally {
    uploading = false;
    dropzone.classList.remove('loading');
    fileInput.value = '';
    renderList();
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files?.[0];
  if (file) handleFile(file);
});

clearBtn.addEventListener('click', () => {
  emails = [];
  fileInput.value = '';
  dropzone.classList.remove('success');
  uploadMeta.classList.add('hidden');
  renderList();
});

sendBtn.addEventListener('click', async () => {
  if (!emails.length || sending) return;

  const subject = subjectInput.value.trim();
  const batches = Math.ceil(emails.length / batchSize);
  const hours = Math.max(0, batches - 1);

  const confirmed = confirm(
    `${emails.length} Empfänger — geplanter Versand:\n\n` +
      `• Jetzt: erste ${batchSize} E-Mails\n` +
      `• Danach: alle ${Math.round(batchIntervalMs / 60000)} Min. weitere ${batchSize}\n` +
      `• Dauer ca. ${hours} Stunde(n) für alle Batches\n\n` +
      `Betreff: ${subject}\n\n` +
      `Der Server muss die ganze Zeit laufen. Starten?`
  );
  if (!confirmed) return;

  sending = true;
  sendBtn.disabled = true;
  sendLogPanel.classList.remove('hidden');
  clearSendLog();
  appendLog(`Kampagne startet · ${emails.length} Empfänger`, 'info');
  progressWrap.classList.remove('hidden');
  resultBox.classList.add('hidden');
  progressFill.style.width = '5%';
  progressText.textContent = 'Starte erste 20…';

  try {
    const res = await api('/api/campaign/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails, subject }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Start fehlgeschlagen');

    appendLog(`Erste Batch gestartet · ${data.sent ?? 0} gesendet`, 'ok');
    resultBox.classList.remove('hidden');
    resultBox.className = 'result-box success';
    resultBox.innerHTML =
      `<strong>Kampagne läuft</strong><br>` +
      `${data.sent ?? 0} gesendet, ${data.failed ?? 0} Fehler in der ersten Runde.<br>` +
      `${data.pending ?? 0} warten auf die nächsten Stunden-Batches.`;

    progressFill.style.width = '15%';
    progressText.textContent = 'Kampagne aktiv — Status wird aktualisiert…';
    startCampaignPolling();
  } catch (e) {
    appendLog('Fehler: ' + e.message, 'fail');
    resultBox.classList.remove('hidden');
    resultBox.className = 'result-box partial';
    resultBox.textContent = 'Fehler: ' + e.message;
    sending = false;
    renderList();
  }
});

cancelCampaignBtn?.addEventListener('click', async () => {
  if (!confirm('Laufende Kampagne wirklich abbrechen?')) return;
  try {
    await api('/api/campaign/cancel', { method: 'POST' });
    sending = false;
    await pollCampaignStatus();
    renderList();
    appendLog('Kampagne abgebrochen', 'info');
  } catch (e) {
    alert(e.message);
  }
});

logoutBtn?.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  location.href = '/login.html';
});

testSendBtn?.addEventListener('click', async () => {
  const email = testEmailInput?.value?.trim();
  if (!email?.includes('@')) {
    testSendResult.classList.remove('hidden');
    testSendResult.textContent = 'Bitte eine gültige E-Mail eingeben.';
    return;
  }
  testSendBtn.disabled = true;
  testSendResult.classList.remove('hidden');
  testSendResult.textContent = 'Sende Test…';
  try {
    const res = await api('/api/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Test fehlgeschlagen');
    testSendResult.textContent = `Test gesendet an ${data.to}.`;
  } catch (e) {
    testSendResult.textContent = 'Fehler: ' + e.message;
  } finally {
    testSendBtn.disabled = false;
  }
});

async function loadPreview() {
  if (!previewText) return;
  try {
    const res = await api('/api/preview');
    if (!res.ok) throw new Error('Vorschau konnte nicht geladen werden');
    previewText.innerHTML = await res.text();
  } catch (e) {
    previewText.innerHTML = '';
    previewText.textContent = 'Fehler: ' + e.message;
  }
}

(async function init() {
  if (!(await ensureAuth())) return;
  await checkHealth();
  await loadPreview();
  const status = await pollCampaignStatus();
  if (status?.active) startCampaignPolling();
  renderList();
})();
