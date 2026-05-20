import XLSX from 'xlsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const EMAIL_HEADERS = new Set([
  'email',
  'e-mail',
  'e_mail',
  'mail',
  'email address',
  'emailaddress',
  'e-mail-adresse',
  'e-mail adresse',
  'adresse',
]);

function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isValidEmail(value) {
  const s = String(value ?? '').trim();
  return EMAIL_RE.test(s);
}

/**
 * @param {Buffer} buffer
 * @returns {{ emails: string[], totalRows: number, column: string | null }}
 */
export function parseEmailsFromExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) {
    return { emails: [], totalRows: 0, column: null };
  }

  const headers = Object.keys(rows[0]);
  let emailColumn = headers.find((h) => EMAIL_HEADERS.has(normalizeHeader(h)));

  if (!emailColumn) {
    for (const h of headers) {
      const sample = rows.slice(0, 20).map((r) => r[h]);
      const hits = sample.filter(isValidEmail).length;
      if (hits >= Math.min(3, sample.length) || (sample.length === 1 && hits === 1)) {
        emailColumn = h;
        break;
      }
    }
  }

  const found = new Set();

  if (emailColumn) {
    for (const row of rows) {
      const v = String(row[emailColumn] ?? '').trim().toLowerCase();
      if (isValidEmail(v)) found.add(v);
    }
  } else {
    for (const row of rows) {
      for (const val of Object.values(row)) {
        const v = String(val ?? '').trim().toLowerCase();
        if (isValidEmail(v)) found.add(v);
      }
    }
  }

  return {
    emails: [...found].sort(),
    totalRows: rows.length,
    column: emailColumn ?? null,
  };
}
