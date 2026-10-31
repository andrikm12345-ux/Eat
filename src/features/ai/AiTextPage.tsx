import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PROMPT_MEAL } from '../../ai/prompts';
import { runAi } from '../../ai/run';
import { validateMeal } from '../../ai/validators';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { mealToDraft } from '../../services/aiFood';
import { useReview } from '../../state/review';
import { Button, LinkButton, Notice } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { addQs, useAddTarget } from '../add/addTarget';
import styles from '../add/add.module.css';
import { AiGate } from './AiGate';

const t = ru.ai;

export default function AiTextPage() {
  const target = useAddTarget();
  const [text, setText] = useState('');
  const manualTo = `/add/quick${addQs(target.date, target.time)}${text.trim() ? `&name=${encodeURIComponent(text.trim().slice(0, 80))}` : ''}`;
  return (
    <Page title={t.text.title}>
      <AiGate manualTo={manualTo}>
        <AiText text={text} setText={setText} manualTo={manualTo} />
      </AiGate>
    </Page>
  );
}

function AiText({
  text,
  setText,
  manualTo,
}: {
  text: string;
  setText: (v: string) => void;
  manualTo: string;
}) {
  const target = useAddTarget();
  const navigate = useNavigate();
  const setDraft = useReview((s) => s.setDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const { value, runId } = await runAi(repos, {
        kind: 'text',
        vision: false,
        system: PROMPT_MEAL,
        content: [{ type: 'text', text: text.trim() }],
        validate: validateMeal,
      });
      setDraft(await mealToDraft(repos, value, target, { entrySource: 'ai_text', aiRunId: runId }));
      navigate('/review');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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
      {error && (
        <Notice>
          {t.error(error)}{' '}
          <LinkButton to={manualTo} variant="ghost">
            {t.manual}
          </LinkButton>
        </Notice>
      )}
      <Button block onClick={() => void go()} disabled={busy || text.trim().length < 2}>
        {busy ? t.working : t.text.go}
      </Button>
    </>
  );
}
