import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PROMPT_LABEL } from '../../ai/prompts';
import { runAi } from '../../ai/run';
import { validateLabel } from '../../ai/validators';
import type { FoodDraft } from '../../domain/off';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { labelToDraft } from '../../services/aiFood';
import { toast } from '../../state/ui';
import { Button, LinkButton, Notice } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { addQs, useAddTarget } from '../add/addTarget';
import { FoodForm } from '../foods/FoodForm';
import { VISION_AI_ENABLED } from '../flags';
import { Unavailable } from './Unavailable';
import { AiGate } from './AiGate';
import { toImageBlocks } from './images';
import { PhotoPicker } from './PhotoPicker';

const t = ru.ai;

function AiLabelPageInner() {
  const [params] = useSearchParams();
  const barcode = params.get('barcode') ?? undefined;
  const manualTo = `/foods/new${barcode ? `?barcode=${encodeURIComponent(barcode)}` : ''}`;
  return (
    <Page title={t.label.title}>
      <AiGate manualTo={manualTo}>
        <AiLabel barcode={barcode} manualTo={manualTo} log={params.get('log') === '1'} />
      </AiGate>
    </Page>
  );
}

function AiLabel({
  barcode,
  manualTo,
  log,
}: {
  barcode: string | undefined;
  manualTo: string;
  log: boolean;
}) {
  const navigate = useNavigate();
  const target = useAddTarget();
  const [table, setTable] = useState<File[]>([]);
  const [front, setFront] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ draft: FoodDraft; warnings: string[] } | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const images = await toImageBlocks([...table, ...front]);
      const { value } = await runAi(repos, {
        kind: 'label',
        vision: true,
        system: PROMPT_LABEL,
        content: [...images, { type: 'text', text: 'Считай пищевую ценность.' }],
        validate: validateLabel,
      });
      setResult(labelToDraft(value, barcode));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <>
        <h2 style={{ fontSize: 18 }}>{t.label.reviewTitle}</h2>
        {result.warnings.map((w) => (
          <Notice key={w}>{w}</Notice>
        ))}
        <FoodForm
          initial={result.draft}
          saveLabel={log ? ru.foods.saveAndLog : ru.foods.save}
          onSave={async (d) => {
            const f = await repos.foods.add({ ...d, source: 'ai_label', verified: true });
            toast({ text: t.label.saved });
            navigate(log ? `/add/food/${f.id}${addQs(target.date, target.time)}` : '/foods', {
              replace: true,
            });
          }}
          extraActions={
            <Button variant="secondary" onClick={() => setResult(null)}>
              {ru.common.cancel}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PhotoPicker files={table} onChange={setTable} max={1} label={t.label.table} />
      <PhotoPicker files={front} onChange={setFront} max={1} label={t.label.front} />
      {error && (
        <Notice>
          {t.error(error)}{' '}
          <LinkButton to={manualTo} variant="ghost">
            {t.manual}
          </LinkButton>
        </Notice>
      )}
      <Button block onClick={() => void go()} disabled={busy || table.length === 0}>
        {busy ? t.working : t.label.go}
      </Button>
    </>
  );
}

export default function AiLabelPage() {
  return VISION_AI_ENABLED ? <AiLabelPageInner /> : <Unavailable title={t.label.title} />;
}
