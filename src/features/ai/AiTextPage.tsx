import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PROMPT_MEAL } from '../../ai/prompts';
import { runAi } from '../../ai/run';
import { AI_KEYS } from '../../ai/settings';
import { validateMeal } from '../../ai/validators';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { mealToDraft } from '../../services/aiFood';
import { analyzeMealLocally } from '../../services/localMeal';
import { useReview } from '../../state/review';
import { Button, Card, LinkButton, Notice } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';
import { useAddTarget } from '../add/addTarget';
import { SHOW_AI_SETUP_HINT } from '../flags';
import { useAiConfig } from './useAi';

const t = ru.ai;

/** Describe a meal in words → "Анализировать": AI when configured, otherwise catalog + OFF. */
export default function AiTextPage() {
  const target = useAddTarget();
  const navigate = useNavigate();
  const setDraft = useReview((s) => s.setDraft);
  const cfg = useAiConfig();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useAiNow = !!cfg?.ready && cfg.consent;

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      if (useAiNow) {
        try {
          const { value, runId } = await runAi(repos, {
            kind: 'text',
            vision: false,
            system: PROMPT_MEAL,
            content: [{ type: 'text', text: text.trim() }],
            validate: validateMeal,
          });
          setDraft(
            await mealToDraft(repos, value, target, { entrySource: 'ai_text', aiRunId: runId }),
          );
          navigate('/review');
          return;
        } catch (e) {
          // AI unavailable → still give the user a result.
          setDraft(
            await analyzeMealLocally(repos, text, target, {
              note: t.text.aiFailedNote((e as Error).message),
            }),
          );
          navigate('/review');
          return;
        }
      }
      setDraft(await analyzeMealLocally(repos, text, target));
      navigate('/review');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={t.text.title}>
      <label className={styles.muted} htmlFor="ai-text">
        {t.text.label}
      </label>
      <textarea
        id="ai-text"
        className={styles.input}
        style={{ minHeight: 140, padding: 12, marginTop: 4 }}
        placeholder={t.text.placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <p className={styles.muted}>{t.text.hint}</p>
      {useAiNow && <p className={styles.muted}>{t.enabled}</p>}
      {error && <Notice>{t.error(error)}</Notice>}
      <Button block onClick={() => void analyze()} disabled={busy || text.trim().length < 2}>
        {busy ? (useAiNow ? t.workingText : t.working) : t.text.go}
      </Button>
      {cfg && !useAiNow && (cfg.ready || SHOW_AI_SETUP_HINT) && (
        <Card>
          <p className={styles.muted} style={{ marginTop: 0 }}>
            {cfg.ready ? t.text.consentNote : t.text.localNote}
          </p>
          {cfg.ready ? (
            <Button
              variant="secondary"
              onClick={() => void repos.settings.set(AI_KEYS.consent, true)}
            >
              {t.consentAccept}
            </Button>
          ) : (
            <LinkButton to="/more/ai" variant="secondary">
              {t.setup}
            </LinkButton>
          )}
        </Card>
      )}
    </Page>
  );
}
