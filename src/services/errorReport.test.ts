import type { ErrorEvent } from '@sentry/browser';
import { describe, expect, it } from 'vitest';
import { IGNORED, reportError, scrubEvent } from './errorReport';

describe('error reports', () => {
  it('scrubs everything personal from an event', () => {
    const e = {
      type: undefined,
      user: { id: '1', ip_address: '1.2.3.4' },
      breadcrumbs: [{ message: 'click on "Творог 5%"' }],
      contexts: { device: { name: 'Андрей iPhone', model: 'iPhone' } },
      request: {
        url: 'https://dnevnik-theta.vercel.app/add/search?q=творог#x',
        cookies: { a: 'b' },
        headers: { authorization: 'Bearer secret' },
        data: 'text',
        query_string: 'q=творог',
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(e);
    expect(out.user).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.contexts?.['device']).toEqual({ model: 'iPhone' });
    expect(out.request).toEqual({ url: 'https://dnevnik-theta.vercel.app/add/search' });
  });

  it('ignores offline and cancelled-request noise, and is silent when not configured', () => {
    expect(IGNORED).toEqual(expect.arrayContaining(['AbortError', 'Failed to fetch']));
    expect(() => reportError(new Error('x'), { where: 'test' })).not.toThrow();
  });
});
