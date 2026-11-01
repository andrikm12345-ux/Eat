import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_KEYS } from '../ai/settings';
import { repos } from '../db/repos';
import { readBarcodeDigits, validateBarcode } from './barcodeDigits';

const reply = (text: string, status = 200) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }), {
        status,
      }),
  );

beforeEach(async () => {
  await repos.db.delete();
  await repos.db.open();
  await repos.settings.set(AI_KEYS.enabled, true);
  await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-xxxxxxxxxxxx');
  await repos.settings.set(AI_KEYS.consent, true);
});
afterEach(() => vi.unstubAllGlobals());

describe('validateBarcode', () => {
  it('takes digits from a string or a number, null for nothing, rejects the rest', () => {
    expect(validateBarcode({ code: '4810 268 055577' })).toEqual({
      ok: true,
      value: { code: '4810268055577' },
    });
    expect(validateBarcode({ code: 96385074 })).toEqual({ ok: true, value: { code: '96385074' } });
    expect(validateBarcode({ code: null })).toEqual({ ok: true, value: { code: null } });
    expect(validateBarcode({})).toEqual({ ok: true, value: { code: null } });
    expect(validateBarcode({ code: 'abc' })).toEqual({ ok: true, value: { code: null } });
    expect(validateBarcode({ code: [1] }).ok).toBe(false);
    expect(validateBarcode('x').ok).toBe(false);
    expect(validateBarcode(null).ok).toBe(false);
  });
});

describe('readBarcodeDigits', () => {
  it('returns the code when its check digit is right', async () => {
    vi.stubGlobal('fetch', reply('{"code":"4810268055577"}'));
    expect(await readBarcodeDigits(repos, [])).toBe('4810268055577');
  });
  it('refuses a misread number (wrong check digit) and "not sure"', async () => {
    vi.stubGlobal('fetch', reply('{"code":"4810268055578"}'));
    expect(await readBarcodeDigits(repos, [])).toBeNull();
    vi.stubGlobal('fetch', reply('{"code":null}'));
    expect(await readBarcodeDigits(repos, [])).toBeNull();
  });
  it('is quiet when the AI is unavailable', async () => {
    vi.stubGlobal('fetch', reply('no', 401));
    expect(await readBarcodeDigits(repos, [])).toBeNull();
  });
});
