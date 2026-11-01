import type { Repos } from '../db/repos';
import { ACCOUNT, getSession } from './account';

export type SharedAiConfig = {
  enabled: boolean;
  baseUrl: string;
  modelText: string;
  modelVision: string;
  dailyLimit: number;
  keySet: boolean;
};

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * Asks the server whether the shared AI is on for this signed-in user (and whether they
 * administer it) and remembers the answer locally. A network failure keeps the old answer.
 */
export async function refreshSharedAi(r: Repos): Promise<void> {
  const session = await getSession(r);
  if (!session) {
    await r.db.settings.bulkDelete([ACCOUNT.aiShared, ACCOUNT.aiAdmin]);
    return;
  }
  try {
    const res = await fetch('/api/ai/status', { headers: auth(session.token) });
    if (!res.ok) return;
    const data = (await res.json()) as { available?: boolean; admin?: boolean };
    await r.settings.set(ACCOUNT.aiShared, data.available === true);
    await r.settings.set(ACCOUNT.aiAdmin, data.admin === true);
  } catch {
    /* offline: keep what we knew */
  }
}

/** Administrator: the current shared settings from the server, or null. */
export async function loadSharedConfig(r: Repos): Promise<SharedAiConfig | null> {
  const session = await getSession(r);
  if (!session) return null;
  try {
    const res = await fetch('/api/ai/config', { headers: auth(session.token) });
    return res.ok ? ((await res.json()) as SharedAiConfig) : null;
  } catch {
    return null;
  }
}

/** Administrator: saves the shared settings; returns the saved config or null. */
export async function saveSharedConfig(
  r: Repos,
  patch: Partial<Omit<SharedAiConfig, 'dailyLimit' | 'keySet'>>,
): Promise<SharedAiConfig | null> {
  const session = await getSession(r);
  if (!session) return null;
  try {
    const res = await fetch('/api/ai/config', {
      method: 'PUT',
      headers: { ...auth(session.token), 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return res.ok ? ((await res.json()) as SharedAiConfig) : null;
  } catch {
    return null;
  }
}
