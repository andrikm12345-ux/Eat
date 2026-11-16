import { forceUpdate } from './forceUpdate';

const KEY = 'chunkReloadAt';
const WINDOW_MS = 60_000;

/** The browser could not load a screen's file (a new version replaced it on the server). */
export const isStaleChunkError = (e: unknown): boolean =>
  e instanceof Error &&
  /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    e.message,
  );

type Env = {
  now: () => number;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  update: () => Promise<void>;
};

const realEnv = (): Env => {
  let storage: Storage | null;
  try {
    storage = sessionStorage;
  } catch {
    storage = null;
  }
  return { now: () => Date.now(), storage, update: () => forceUpdate() };
};

/**
 * Loads a screen. If its file is gone because a new version was published, refreshes the
 * app once (drops the old cached files, reloads) instead of showing an error. A second failure
 * within a minute is passed on, so a real outage cannot cause a reload loop.
 */
export async function loadScreen<T>(load: () => Promise<T>, env: Env = realEnv()): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (!isStaleChunkError(e)) throw e;
    const last = (() => {
      try {
        return Number(env.storage?.getItem(KEY) ?? 0);
      } catch {
        return 0;
      }
    })();
    if (env.now() - last < WINDOW_MS) throw e;
    try {
      env.storage?.setItem(KEY, String(env.now()));
    } catch {
      /* private mode: still try once */
    }
    await env.update();
    // The page is reloading: keep the screen empty instead of flashing an error.
    return new Promise<T>(() => {});
  }
}
