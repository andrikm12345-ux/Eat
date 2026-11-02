import type { Repos } from '../db/repos';
import { getSession } from './account';

export type WebHit = { title: string; url: string; content: string };
export type WebContext = { text: string; sources: { title: string; url: string }[] };

const TIMEOUT_MS = 6000;

/** Hostname without "www." for compact display. */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** The query: what the user described, with words that steer to nutrition facts. */
export const searchQuery = (description: string): string =>
  `${description.replace(/\s+/g, ' ').trim().slice(0, 200)} калорийность БЖУ на 100 г состав`;

/** Reference text for the AI built from search hits. */
export function formatWebContext(hits: WebHit[]): WebContext | null {
  if (hits.length === 0) return null;
  const text = hits
    .map((h, i) => `[${i + 1}] ${h.title} (${hostOf(h.url)}): ${h.content.replace(/\s+/g, ' ')}`)
    .join('\n');
  return { text, sources: hits.map((h) => ({ title: h.title, url: h.url })) };
}

/** The user message sent to the AI: the description plus the web reference, if any. */
export function withWebContext(description: string, web: WebContext | null): string {
  if (!web) return description;
  return `${description}\n\nСправка из интернета (результаты поиска, могут быть неточными или относиться к другому продукту). Если справка относится к описанному продукту, возьми из неё калорийность и БЖУ на 100 г вместо своих оценок; если нет — игнорируй её.\n${web.text}`;
}

/**
 * Does a remark to an estimate introduce a product or brand (worth looking up), or only
 * change it ("убери сыр", "меньше масла")? Only the first kind is searched.
 */
export function remarkNamesProduct(note: string): boolean {
  const t = note.trim();
  if (/^(без|убер|убр|удал|нет|не |меньше|больше|добав|поменя|измени|вес|порци|\d)/i.test(t))
    return false;
  // A brand or a title: Latin letters, quotes, a capitalised word inside the sentence, or the words themselves.
  return (
    /[A-Za-z«"“]/.test(t) ||
    /\s[А-ЯЁ][а-яё]{2,}/.test(t) ||
    /(бренд|марк|производител|фирм)/i.test(t)
  );
}

/**
 * Searches the web through our server. Never throws: without an account, without the
 * search configured, on a limit or any failure it returns null and the AI works as before.
 */
export async function searchWeb(
  r: Repos,
  description: string,
  fetchImpl: typeof fetch = fetch,
  opts: { raw?: boolean } = {},
): Promise<WebContext | null> {
  try {
    if (description.trim().length < 3) return null;
    const token = (await getSession(r))?.token;
    if (!token) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl('/api/search', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query: opts.raw ? description.trim() : searchQuery(description) }),
        signal: ctl.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: WebHit[] };
      return formatWebContext(Array.isArray(data.results) ? data.results : []);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
