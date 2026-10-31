// Storage durability helpers (best effort; not all browsers support them).

export type StorageStatus = {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
};

/** Asks the browser to keep IndexedDB data from eviction. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const out: StorageStatus = { persisted: null, usage: null, quota: null };
  try {
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      out.usage = e.usage ?? null;
      out.quota = e.quota ?? null;
    }
  } catch {
    /* unsupported */
  }
  return out;
}
