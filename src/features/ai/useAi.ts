import { useLiveQuery } from 'dexie-react-hooks';
import { aiReady, getAiConfig, type AiConfig } from '../../ai/settings';
import { repos } from '../../db/repos';

/** Live AI configuration; `ready` = enabled with a key. */
export function useAiConfig(): (AiConfig & { ready: boolean }) | undefined {
  return useLiveQuery(async () => {
    const c = await getAiConfig(repos);
    return { ...c, ready: aiReady(c) };
  }, []);
}
