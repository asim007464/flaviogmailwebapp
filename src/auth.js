import crypto from 'crypto';

const AUTH_USER = process.env.AUTH_USER ?? 'superflavio';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? 'Flaviosixoowner';
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? 'change-this-secret-in-production';
const SESSION_MS = Number(process.env.SESSION_MAX_AGE_MS ?? 7 * 24 * 60 * 60 * 1000);
const COOKIE_NAME = 'auth_session';

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

export function createSessionToken(username) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + SESSION_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.u || !data.exp || Date.now() > data.exp) return null;
    return data.u;
  } catch {
    return null;
  }
}

export function checkCredentials(username, password) {
  return username === AUTH_USER && password === AUTH_PASSWORD;
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const i = part.indexOf('=');
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      return [k, decodeURIComponent(v)];
    })
  );
}

export function getSessionUser(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

export function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export function requireAuth(req, res, next) {
  if (getSessionUser(req)) return next();
  res.status(401).json({ error: 'Nicht angemeldet' });
}
