/**
 * Error reports to Sentry, only when a project key (VITE_SENTRY_DSN) is set at build time.
 * Privacy: no user, no cookies, no URLs with parameters, no click or console trail (those can
 * hold food names), no request bodies. What is sent: the error, where it happened, the app version.
 */
import type * as SentryBrowser from '@sentry/browser';
import type { ErrorEvent, EventHint } from '@sentry/browser';

let sentry: typeof SentryBrowser | null = null;

/** Noise that is not a defect: cancelled requests, offline starts, harmless layout loops. */
export const IGNORED = [
  'AbortError',
  'ResizeObserver loop',
  'Load failed',
  'Failed to fetch',
  'NetworkError',
  'The operation was aborted',
];

/** Removes everything personal from an event before it leaves the device. */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  delete event.user;
  delete event.breadcrumbs;
  delete event.contexts?.['device']?.['name'];
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split(/[?#]/)[0] as string;
  }
  return event;
}

export async function initErrorReporting(dsn: string | undefined): Promise<void> {
  if (!dsn) return;
  try {
    const s = await import('@sentry/browser');
    s.init({
      dsn,
      release: __APP_VERSION__,
      environment: 'production',
      tracesSampleRate: 0,
      ignoreErrors: IGNORED,
      // No click / console / network trail: it can contain what the person typed or ate.
      // No session pings either: only real errors are sent.
      integrations: (defaults) =>
        defaults.filter((i) => i.name !== 'Breadcrumbs' && i.name !== 'BrowserSession'),
      beforeSend: scrubEvent,
    });
    sentry = s;
  } catch (e) {
    console.error('Error reporting did not start', e);
  }
}

/** Reports a caught error with a few short tags (never the person's text). */
export function reportError(error: unknown, tags: Record<string, string> = {}): void {
  sentry?.captureException(error, { tags });
}
