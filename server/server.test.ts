import { describe, expect, it, vi } from 'vitest';
import {
  createChallenge,
  createSession,
  isValidEmail,
  normalizeEmail,
  userIdFor,
  verifyChallenge,
  verifySession,
  CODE_TTL_MS,
  SESSION_TTL_MS,
  CODE_DIGITS,
} from './auth';
import { getSync, putSync, requestCode, verifyCode } from './handlers';
import { resendMailer } from './mail';
import type { Deps, Store } from './types';

const SECRET = 'x'.repeat(40);
const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);

function memoryStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: async (p) => data.get(p) ?? null, put: async (p, b) => void data.set(p, b) };
}

function deps(over: Partial<Deps> = {}) {
  const sent: { to: string; code: string }[] = [];
  const d: Deps = {
    secret: SECRET,
    store: memoryStore(),
    mail: async (to, code) => void sent.push({ to, code }),
    now: () => T0,
    allowed: [],
    ...over,
  };
  return { d, sent };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('auth primitives', () => {
  it('validates and normalizes emails', () => {
    expect(normalizeEmail('  A@B.ru ')).toBe('a@b.ru');
    expect(isValidEmail('a@b.ru')).toBe(true);
    for (const bad of [
      '',
      'a',
      'a@b',
      'a b@c.ru',
      '@c.ru',
      'a@.ru'.slice(0, 3),
      `${'a'.repeat(250)}@b.ru`,
    ])
      expect(isValidEmail(bad)).toBe(false);
  });

  it('code: right pair passes, wrong code / tampering / expiry fail', () => {
    const { challenge, code } = createChallenge(SECRET, 'Me@Mail.ru', T0, 'nonce1');
    expect(code).toMatch(new RegExp(`^\\d{${CODE_DIGITS}}$`));
    expect(verifyChallenge(SECRET, challenge, code, T0 + 1000)).toBe('me@mail.ru');
    expect(verifyChallenge(SECRET, challenge, ` ${code.slice(0, 4)} ${code.slice(4)} `, T0)).toBe(
      'me@mail.ru',
    );
    expect(
      verifyChallenge(SECRET, challenge, '00000000' === code ? '11111111' : '00000000', T0),
    ).toBeNull();
    expect(verifyChallenge(SECRET, challenge, code, T0 + CODE_TTL_MS + 1)).toBeNull();
    expect(verifyChallenge('y'.repeat(40), challenge, code, T0)).toBeNull();
    const [p, sig] = challenge.split('.');
    const forged = Buffer.from(
      Buffer.from(p!, 'base64url').toString().replace('me@mail.ru', 'evil@mail.ru'),
    ).toString('base64url');
    expect(verifyChallenge(SECRET, `${forged}.${sig}`, code, T0)).toBeNull();
    for (const junk of ['', 'abc', 'a.b', '!!!.???'])
      expect(verifyChallenge(SECRET, junk, code, T0)).toBeNull();
    // Another challenge for the same address has another code.
    expect(createChallenge(SECRET, 'me@mail.ru', T0, 'nonce2').code).not.toBe(code);
  });

  it('sessions: valid until expiry, bound to the secret', () => {
    const uid = userIdFor(SECRET, 'a@b.ru');
    expect(uid).toBe(userIdFor(SECRET, ' A@B.ru '));
    expect(uid).not.toBe(userIdFor(SECRET, 'c@d.ru'));
    expect(uid).not.toContain('@');
    const t = createSession(SECRET, uid, T0);
    expect(verifySession(SECRET, t, T0 + 1000)).toBe(uid);
    expect(verifySession(SECRET, t, T0 + SESSION_TTL_MS + 1)).toBeNull();
    expect(verifySession('z'.repeat(40), t, T0)).toBeNull();
    for (const junk of ['', 'x', 'a.b', '%%%.%%%'])
      expect(verifySession(SECRET, junk, T0)).toBeNull();
    const [p, sig] = t.split('.');
    expect(
      verifySession(
        SECRET,
        `${Buffer.from(Buffer.from(p!, 'base64url').toString().replace(uid, 'other')).toString('base64url')}.${sig}`,
        T0,
      ),
    ).toBeNull();
  });
});

describe('endpoints', () => {
  it('full flow: request code → mail → verify → store and read data', async () => {
    const { d, sent } = deps();
    const r1 = await requestCode(d, post({ email: ' Me@Mail.ru ' }));
    expect(r1.status).toBe(200);
    const { challenge } = (await r1.json()) as { challenge: string };
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('me@mail.ru');

    const r2 = await verifyCode(d, post({ challenge, code: sent[0]!.code }));
    expect(r2.status).toBe(200);
    const { token } = (await r2.json()) as { token: string };
    const auth = { authorization: `Bearer ${token}` };

    const empty = await getSync(d, new Request('http://x/api/sync', { headers: auth }));
    expect(await empty.json()).toEqual({ empty: true });

    const snapshot = JSON.stringify({
      format: 'dnevnik-backup',
      schemaVersion: 1,
      tables: { weights: [] },
    });
    const put = await putSync(
      d,
      new Request('http://x/api/sync', { method: 'PUT', headers: auth, body: snapshot }),
    );
    expect(put.status).toBe(200);
    const got = await getSync(d, new Request('http://x/api/sync', { headers: auth }));
    expect(await got.text()).toBe(snapshot);
    // The key in storage is an opaque id, not the email.
    expect([...(d.store as ReturnType<typeof memoryStore>).data.keys()][0]).toMatch(
      /^users\/[0-9a-f]{40}\.json$/,
    );
  });

  it('rejects bad emails, wrong codes (with a delay) and unauthenticated sync', async () => {
    const delay = vi.fn(() => 1);
    const { d, sent } = deps({ failDelayMs: delay });
    expect((await requestCode(d, post({ email: 'nope' }))).status).toBe(400);
    expect(
      (await requestCode(d, new Request('http://x', { method: 'POST', body: 'not json' }))).status,
    ).toBe(400);
    expect(sent).toHaveLength(0);
    const { challenge } = (await (await requestCode(d, post({ email: 'a@b.ru' }))).json()) as {
      challenge: string;
    };
    expect((await verifyCode(d, post({ challenge, code: '12345678' }))).status).toBe(401);
    expect(delay).toHaveBeenCalled();
    expect((await verifyCode(d, post({}))).status).toBe(401);
    expect((await getSync(d, new Request('http://x'))).status).toBe(401);
    expect(
      (
        await putSync(
          d,
          new Request('http://x', {
            method: 'PUT',
            headers: { authorization: 'Bearer bad.token' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(401);
  });

  it('validates what is stored', async () => {
    const { d, sent } = deps();
    const { challenge } = (await (await requestCode(d, post({ email: 'a@b.ru' }))).json()) as {
      challenge: string;
    };
    const { token } = (await (
      await verifyCode(d, post({ challenge, code: sent[0]!.code }))
    ).json()) as { token: string };
    const h = { authorization: `Bearer ${token}` };
    const put = (body: string) =>
      putSync(d, new Request('http://x', { method: 'PUT', headers: h, body }));
    expect((await put('not json')).status).toBe(400);
    expect((await put('{"format":"other","tables":{}}')).status).toBe(400);
    expect((await put('x'.repeat(4 * 1024 * 1024 + 1))).status).toBe(413);
  });

  it('allowlist: other addresses get no mail and cannot sign in', async () => {
    const { d, sent } = deps({ allowed: ['me@mail.ru'] });
    const stranger = await requestCode(d, post({ email: 'x@y.ru' }));
    expect(stranger.status).toBe(200); // looks identical
    expect(sent).toHaveLength(0);
    const { challenge } = (await stranger.json()) as { challenge: string };
    const forgedCode = createChallenge(SECRET, 'x@y.ru', T0).code;
    expect((await verifyCode(d, post({ challenge, code: forgedCode }))).status).toBe(401);
    expect((await requestCode(d, post({ email: 'me@mail.ru' }))).status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('mail problems are reported', async () => {
    const off = deps({ mail: resendMailer(undefined, 'a@b.c') });
    expect((await requestCode(off.d, post({ email: 'a@b.ru' }))).status).toBe(503);
    expect(await (await requestCode(off.d, post({ email: 'a@b.ru' }))).json()).toEqual({
      error: 'mail_not_configured',
    });
    const broken = deps({
      mail: async () => {
        throw new Error('boom');
      },
    });
    expect(await (await requestCode(broken.d, post({ email: 'a@b.ru' }))).json()).toEqual({
      error: 'mail_failed',
    });
  });
});

describe('Resend mailer', () => {
  it('posts the code to the Resend API', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await resendMailer(
      're_key',
      'Дневник <a@b.c>',
      f as unknown as typeof fetch,
    )('me@mail.ru', '12345678');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: ['me@mail.ru'],
      subject: expect.stringContaining('12345678'),
    });
    await expect(
      resendMailer(
        'k',
        'f',
        (async () => new Response('', { status: 403 })) as unknown as typeof fetch,
      )('a@b.ru', '1'),
    ).rejects.toThrow('mail_failed_403');
  });
});
