import { monotonicFactory } from 'ulid';

const next = monotonicFactory();

/** New ULID (lexicographically sortable by creation time, monotonic within a ms). */
export function newId(): string {
  return next();
}

/** Current timestamp as ISO string. Indirection allows tests to control time. */
export const clock = { now: (): string => new Date().toISOString() };
