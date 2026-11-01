/**
 * Drops the service workers and cached files of this site, then reloads: the next load
 * fetches the newest version from the network. Local data (IndexedDB) is not touched.
 */
export async function forceUpdate(
  env: {
    serviceWorker?: Pick<ServiceWorkerContainer, 'getRegistrations'>;
    caches?: Pick<CacheStorage, 'keys' | 'delete'>;
    reload: () => void;
  } = {
    ...(typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? { serviceWorker: navigator.serviceWorker }
      : {}),
    ...(typeof caches !== 'undefined' ? { caches } : {}),
    reload: () => location.reload(),
  },
): Promise<void> {
  try {
    const regs = (await env.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await env.caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => env.caches?.delete(k)));
  } finally {
    env.reload();
  }
}
