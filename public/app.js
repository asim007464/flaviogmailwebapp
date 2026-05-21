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

let emails = [];
let dailyLimit = 500;
let sending = false;
let uploading = false;
let smtpFrom = '';

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ok) {
      smtpFrom = data.from;
      smtpStatus.textContent = `SMTP OK · ${data.from}`;
      smtpStatus.title = `${data.smtpUser} @ ${data.smtpHost}`;
      smtpStatus.classList.remove('error', 'sending');
      dailyLimit = data.dailyLimit;
    } else {
      throw new Error(data.error || 'SMTP not configured');
    }
  } catch (e) {
    smtpStatus.textContent = 'SMTP fehlt';
    smtpStatus.title = e.message || '.env prüfen';
    smtpStatus.classList.add('error');
  }
}

function renderList() {
  if (emails.length === 0) {
    emailList.innerHTML = '<li class="empty">Noch keine E-Mails geladen</li>';
    sendBtn.disabled = true;
    clearBtn.classList.add('hidden');
    emailCount.textContent = '0 Empfänger';
    return;
  }

  emailList.innerHTML = emails
    .map((e) => `<li>${escapeHtml(e)}</li>`)
    .join('');
  emailCount.textContent = `${emails.length} Empfänger`;
  sendBtn.disabled = sending || emails.length === 0;
  clearBtn.classList.remove('hidden');

  if (emails.length > dailyLimit) {
    emailCount.textContent += ` (Limit: ${dailyLimit}/Tag)`;
    sendBtn.disabled = true;
  }
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

function parseSseChunk(buffer) {
  const events = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    const lines = part.split('\n');
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const json = line.slice(5).trim();
        if (json) {
          try {
            events.push(JSON.parse(json));
          } catch {
            /* ignore partial JSON */
          }
        }
      }
    }
  }

  return { events, rest };
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
    const res = await fetch('/api/parse-excel', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');

    emails = data.emails;
    dailyLimit = data.dailyLimit ?? dailyLimit;

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
  const etaSec = Math.ceil((emails.length - 1) * 3);
  const confirmed = confirm(
    `${emails.length} E-Mail(s) senden?\n\nBetreff: ${subject}\n\n` +
      `Ca. ${etaSec > 0 ? etaSec + ' Sekunden' : 'sofort'} (3s Pause zwischen Mails).\n` +
      `Fenster offen lassen bis „Fertig“ erscheint.`
  );
  if (!confirmed) return;

  sending = true;
  sendBtn.disabled = true;
  smtpStatus.textContent = 'Sende…';
  smtpStatus.classList.add('sending');
  smtpStatus.title = smtpFrom;

  sendLogPanel.classList.remove('hidden');
  clearSendLog();
  appendLog(`Start · ${emails.length} Empfänger · ${smtpFrom}`, 'info');

  progressWrap.classList.remove('hidden');
  resultBox.classList.add('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Verbindung…';

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails, subject }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseChunk(buffer);
      buffer = rest;
      for (const ev of events) handleSendEvent(ev);
    }

    if (buffer.trim()) {
      const { events } = parseSseChunk(buffer + '\n\n');
      for (const ev of events) handleSendEvent(ev);
    }
  } catch (e) {
    appendLog('Fehler: ' + e.message, 'fail');
    resultBox.classList.remove('hidden');
    resultBox.className = 'result-box partial';
    resultBox.textContent = 'Fehler: ' + e.message;
  } finally {
    sending = false;
    smtpStatus.textContent = 'SMTP OK';
    smtpStatus.classList.remove('sending');
    smtpStatus.title = smtpFrom;
    renderList();
  }
});

function handleSendEvent(ev) {
  if (ev.type === 'error') {
    appendLog(ev.message, 'fail');
    resultBox.classList.remove('hidden');
    resultBox.className = 'result-box partial';
    resultBox.textContent = ev.message;
    return;
  }

  if (ev.type === 'start') {
    sendLogSummary.textContent = `0 / ${ev.total}`;
    progressText.textContent = `Versand läuft (${Math.round(ev.delayMs / 1000)}s Pause zwischen E-Mails)`;
    appendLog(`Pause: ${ev.delayMs}ms zwischen Sends`, 'info');
  }

  if (ev.type === 'progress') {
    const pct = Math.round((ev.index / ev.total) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = `${ev.index} von ${ev.total} (${pct}%)`;
    sendLogSummary.textContent = `${ev.index} / ${ev.total}`;

    if (ev.status === 'sent') {
      appendLog(`✓ ${ev.to}`, 'ok');
    } else {
      appendLog(`✗ ${ev.to} — ${ev.error || 'Fehler'}`, 'fail');
    }
  }

  if (ev.type === 'done') {
    progressFill.style.width = '100%';
    sendLogSummary.textContent = `Fertig · ${ev.sent} OK · ${ev.failed} Fehler`;
    appendLog(`Fertig: ${ev.sent} gesendet, ${ev.failed} fehlgeschlagen`, ev.failed ? 'fail' : 'ok');

    resultBox.classList.remove('hidden');
    resultBox.className = ev.failed ? 'result-box partial' : 'result-box success';
    const gmailHint =
      `<br><br><strong>Wichtig (Gmail):</strong> „OK“ heisst nur: Hostinger hat die Mail angenommen — nicht dass sie im Posteingang ist.<br>` +
      `• In <strong>jedem</strong> Gmail-Konto: Spam + „Alle E-Mails“ prüfen<br>` +
      `• Suche: <code>from:kontakt@six-point-o.ch</code><br>` +
      `• Hostinger hPanel → E-Mails → <strong>SPF + DKIM</strong> aktivieren<br>` +
      `• Nicht 7 Test-Gmails hintereinander — Gmail filtert das als Werbung`;

    resultBox.innerHTML =
      `<strong>Fertig</strong><br>An Hostinger übergeben: ${ev.sent}<br>Fehlgeschlagen: ${ev.failed}` +
      (ev.failed ? '' : gmailHint) +
      (ev.failed
        ? `<br><br><em>Fehler:</em> SMTP-Passwort oder Server prüfen (.env + npm start).`
        : '');

    progressText.textContent = 'Abgeschlossen.';
  }
}

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
    const res = await fetch('/api/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Test fehlgeschlagen');
    testSendResult.textContent =
      `Test gesendet an ${data.to}. Prüfe Posteingang UND Spam. Suche: from:kontakt@six-point-o.ch`;
  } catch (e) {
    testSendResult.textContent = 'Fehler: ' + e.message;
  } finally {
    testSendBtn.disabled = false;
  }
});

async function loadPreview() {
  if (!previewText) return;
  try {
    const res = await fetch('/api/preview');
    if (!res.ok) throw new Error('Vorschau konnte nicht geladen werden');
    previewText.innerHTML = await res.text();
  } catch (e) {
    previewText.innerHTML = '';
    previewText.textContent = 'Fehler: ' + e.message;
  }
}

checkHealth();
loadPreview();
renderList();
