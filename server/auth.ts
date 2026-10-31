import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

/** Login + password accounts. Sessions are signed tokens; only a password hash is stored. */
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');
const hmac = (secret: string, data: string) =>
  createHmac('sha256', secret).update(data).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const normalizeLogin = (raw: string) => raw.trim().toLowerCase();

/** 3–32 characters: latin letters, digits, dot, dash, underscore. */
export const isValidLogin = (login: string) => /^[a-z0-9._-]{3,32}$/.test(login);

export const isValidPassword = (pw: string) =>
  pw.length >= MIN_PASSWORD && pw.length <= MAX_PASSWORD;

/** Stable, non-reversible user id (also the storage key of the user's data). */
export function userIdFor(secret: string, login: string): string {
  return createHash('sha256')
    .update(`${secret}|user|${normalizeLogin(login)}`)
    .digest('hex')
    .slice(0, 40);
}

export type Secret = { salt: string; hash: string };
export type Credentials = Secret & {
  fails: number;
  lockedUntil: number;
  /** Hash of the one-time recovery code (accounts created before recovery existed lack it). */
  recovery?: Secret;
};

const derive = (value: string, salt: string) =>
  new Promise<string>((resolve, reject) =>
    scrypt(value, Buffer.from(salt, 'hex'), 64, (err, key) =>
      err ? reject(err) : resolve(key.toString('hex')),
    ),
  );

export async function hashSecret(value: string): Promise<Secret> {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: await derive(value, salt) };
}

export async function checkSecret(secret: Secret, value: string): Promise<boolean> {
  return safeEqual(await derive(value, secret.salt), secret.hash);
}

/** 32 symbols without look-alikes (no 0/O/1/I): 20 of them ≈ 100 bits. */
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRecoveryCode(): string {
  const bytes = randomBytes(20);
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % 32]).join('');
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5)).join('-');
}

/** Accepts the code in any case, with or without dashes and spaces. */
export const normalizeRecovery = (raw: string) => raw.toUpperCase().replace(/[^A-Z2-9]/g, '');

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
