import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DomainError } from '../domain/engine.js';

const derive = promisify(scrypt);
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const sessionCookie = 'tradescope_session';
// Accept unexpired cookies issued before the rename, including anonymous demos.
const previousSessionCookie = 'investogram_session';
const cookieOptions = (secure) => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: !!secure,
  path: '/',
});
function writeSessionCookie(res, token, maxAge, secure) {
  res.cookie(sessionCookie, token, { ...cookieOptions(secure), maxAge });
  res.clearCookie(previousSessionCookie, cookieOptions(secure));
}
export function clearSessionCookies(res, secure) {
  for (const name of [sessionCookie, previousSessionCookie])
    res.clearCookie(name, cookieOptions(secure));
}
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64, parameters);
  return salt + ':' + hash.toString('hex');
}
export async function verifyPassword(password, stored) {
  const [salt, expected] = (stored || '00000000000000000000000000000000:' + '00'.repeat(64)).split(
    ':',
  );
  const actual = await derive(password, salt, 64, parameters);
  const buffer = Buffer.from(expected, 'hex');
  return !!stored && buffer.length === actual.length && timingSafeEqual(buffer, actual);
}
export function publicIdentity(identity) {
  return {
    id: identity.id,
    email: identity.email,
    role: identity.role,
    demo: !!identity.is_demo,
    verified: !!identity.verified_at,
    label: identity.is_demo
      ? 'Demo workspace'
      : identity.role === 'admin'
        ? 'Administrator'
        : 'Trading account',
  };
}
export function issueSession(store, res, id, secure = false) {
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  const lifetime = 8 * 60 * 60 * 1000;
  store.createSession(digest(token), id, csrf, Date.now() + lifetime);
  writeSessionCookie(res, token, lifetime, secure);
  return csrf;
}
export function sessionFromRequest(store, req, res, secure = false) {
  const cookies = (req.headers.cookie || '').split(';').map((s) => s.trim());
  const current = cookies.find((s) => s.startsWith(sessionCookie + '='));
  const previous = cookies.find((s) => s.startsWith(previousSessionCookie + '='));
  const cookie = current || previous;
  const token = cookie?.slice(cookie.indexOf('=') + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = store.session(digest(token));
  if (session && !current && res)
    writeSessionCookie(res, token, Math.max(0, session.expires_at - Date.now()), secure);
  return session;
}
export function rateLimiter({ limit = 12, windowMs = 15 * 60 * 1000 } = {}) {
  const requests = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, item] of requests) if (item.until <= now) requests.delete(key);
    const key = req.ip;
    const item = requests.get(key) || { count: 0, until: now + windowMs };
    requests.set(key, item);
    if (++item.count > limit) {
      res.set('Retry-After', String(Math.ceil((item.until - now) / 1000)));
      return next(new DomainError('Too many attempts. Try again later.', 429));
    }
    next();
  };
}
