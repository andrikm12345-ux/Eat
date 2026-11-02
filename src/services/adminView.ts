import type { Repos } from '../db/repos';
import type { DayMeta, Entry, Goal, Profile, Weight } from '../domain/types';
import { getSession } from './account';

export type AdminUser = {
  id: string;
  login: string | null;
  createdAt: number | null;
  lastLogin: number | null;
  lastSync: string | null;
  entries: number;
  me: boolean;
};

export type AdminDiary = {
  login: string | null;
  exportedAt: string | null;
  profile: Profile | null;
  goals: Goal[];
  entries: Entry[];
  weights: Weight[];
  dayMeta: DayMeta[];
};

export type AdminResult<T> = { ok: true; data: T } | { ok: false; reason: 'forbidden' | 'error' };

async function call<T>(r: Repos, query = ''): Promise<AdminResult<T>> {
  const session = await getSession(r);
  if (!session) return { ok: false, reason: 'error' };
  try {
    const res = await fetch(`/api/admin${query}`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    if (res.status === 403) return { ok: false, reason: 'forbidden' };
    if (!res.ok) return { ok: false, reason: 'error' };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Administrator: every account. */
export const loadAdminUsers = async (r: Repos) => {
  const res = await call<{ users: AdminUser[] }>(r);
  return res.ok ? ({ ok: true, data: res.data.users } as const) : res;
};

/** Administrator: one account's diary (read only). */
export const loadAdminDiary = (r: Repos, id: string) =>
  call<AdminDiary>(r, `?id=${encodeURIComponent(id)}`);
