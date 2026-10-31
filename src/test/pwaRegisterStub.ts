// Test stub for `virtual:pwa-register/react` (no service worker in jsdom).
import { useState } from 'react';

export const stubState = { needRefresh: false, offlineReady: false, updateCalls: 0 };

export function useRegisterSW() {
  const needRefresh = useState(stubState.needRefresh);
  const offlineReady = useState(stubState.offlineReady);
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: async () => {
      stubState.updateCalls += 1;
    },
  };
}
