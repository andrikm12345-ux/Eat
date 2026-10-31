import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Stateless email-code login: nothing is stored until the code is verified. */
export const CODE_DIGITS = 8;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');
const hmac = (secret: string, data: string) =>
  createHmac('sha256', secret).update(data).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Stable, non-reversible user id (also the storage key of the user's data). */
export function userIdFor(secret: string, email: string): string {
  return createHash('sha256')
    .update(`${secret}|user|${normalizeEmail(email)}`)
    .digest('hex')
    .slice(0, 40);
}

/** Digits derived from the challenge, so only the mail recipient knows them. */
function codeFor(secret: string, payload: string): string {
  const n = BigInt('0x' + hmac(secret, `code|${payload}`).slice(0, 12)) % BigInt(10 ** CODE_DIGITS);
  return n.toString().padStart(CODE_DIGITS, '0');
}

export function createChallenge(
  secret: string,
  emailRaw: string,
  now: number,
  nonce = randomBytes(12).toString('hex'),
) {
  const email = normalizeEmail(emailRaw);
  const payload = `${email}|${now + CODE_TTL_MS}|${nonce}`;
  return {
    challenge: `${b64(payload)}.${hmac(secret, `c|${payload}`)}`,
    code: codeFor(secret, payload),
  };
}

/** Checks a challenge + code pair; returns the (normalized) email on success. */
export function verifyChallenge(
  secret: string,
  challenge: string,
  code: string,
  now: number,
): string | null {
  const [p, sig] = challenge.split('.');
  if (!p || !sig) return null;
  let payload: string;
  try {
    payload = unb64(p);
  } catch {
    return null;
  }
  if (!safeEqual(sig, hmac(secret, `c|${payload}`))) return null;
  const [email, exp] = payload.split('|');
  if (!email || Number(exp) < now) return null;
  return safeEqual(code.replace(/\s/g, ''), codeFor(secret, payload)) ? email : null;
}

export function createSession(secret: string, userId: string, now: number): string {
  const payload = `${userId}|${now + SESSION_TTL_MS}`;
  return `${b64(payload)}.${hmac(secret, `s|${payload}`)}`;
}

/** Returns the user id of a valid, unexpired session token. */
export function verifySession(secret: string, token: string, now: number): string | null {
  const [p, sig] = token.split('.');
  if (!p || !sig) return null;
  let payload: string;
  try {
    payload = unb64(p);
  } catch {
    return null;
  }
  if (!safeEqual(sig, hmac(secret, `s|${payload}`))) return null;
  const [userId, exp] = payload.split('|');
  return userId && Number(exp) >= now ? userId : null;
}

export const randomDelayMs = () => randomInt(150, 350);
