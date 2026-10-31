import type { ReactNode } from 'react';
import { AI_KEYS } from '../../ai/settings';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Button, Card, LinkButton, Notice } from '../../ui/kit';
import { useAiConfig } from './useAi';

const t = ru.ai;

/** Shows children only when AI is configured and consent is given; otherwise offers manual input. */
export function AiGate({ manualTo, children }: { manualTo: string; children: ReactNode }) {
  const cfg = useAiConfig();
  if (!cfg) return null;
  if (!cfg.ready) {
    return (
      <>
        <Notice>{t.notReady}</Notice>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LinkButton to={manualTo}>{t.manual}</LinkButton>
          <LinkButton to="/more/ai" variant="secondary">
            {t.setup}
          </LinkButton>
        </div>
      </>
    );
  }
  if (!cfg.consent) {
    return (
      <Card title={t.consentTitle}>
        <p>{t.consentText}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button onClick={() => void repos.settings.set(AI_KEYS.consent, true)}>
            {t.consentAccept}
          </Button>
          <LinkButton to={manualTo} variant="secondary">
            {t.manual}
          </LinkButton>
        </div>
      </Card>
    );
  }
  return <>{children}</>;
}
