import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PROMPT_PHOTO } from '../../ai/prompts';
import { runAi } from '../../ai/run';
import { validatePhoto } from '../../ai/validators';
import type { FoodDraft } from '../../domain/off';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { labelToDraft, mealToDraft } from '../../services/aiFood';
import { useReview } from '../../state/review';
import { toast } from '../../state/ui';
import { Button, LinkButton, Notice, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { addQs, useAddTarget } from '../add/addTarget';
import { VISION_AI_ENABLED } from '../flags';
import { FoodForm } from '../foods/FoodForm';
import { AiGate } from './AiGate';
import { toImageBlocks } from './images';
import { PhotoPicker } from './PhotoPicker';
import { Unavailable } from './Unavailable';

const t = ru.ai;

/**
 * One "Фото" screen for both cases: the model decides whether the picture shows a meal
 * (estimate → review screen) or a nutrition label (read → product form).
 */
function AiPhotoInner() {
  const target = useAddTarget();
  const [params] = useSearchParams();
  const barcode = params.get('barcode') ?? undefined;
  const log = params.get('log') === '1';
  const navigate = useNavigate();
  const setDraft = useReview((s) => s.setDraft);
  const manualTo = barcode
    ? `/foods/new?barcode=${encodeURIComponent(barcode)}`
    : `/add/search${target.qs}`;
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<{ draft: FoodDraft; warnings: string[] } | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const images = await toImageBlocks(files);
      const { value, runId } = await runAi(repos, {
        kind: 'photo',
        vision: true,
        system: PROMPT_PHOTO,
        content: [
          ...images,
          { type: 'text', text: note.trim() ? `Уточнение: ${note.trim()}` : 'Что на фото?' },
        ],
        validate: validatePhoto,
      });
      if (value.kind === 'label') {
        setProduct(labelToDraft(value.label, barcode));
      } else {
        setDraft(
          await mealToDraft(repos, value.meal, target, { entrySource: 'ai_photo', aiRunId: runId }),
        );
        navigate('/review');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (product) {
    return (
      <>
        <h2 style={{ fontSize: 'var(--fs-4)' }}>{t.photo.productTitle}</h2>
        {product.warnings.map((w) => (
          <Notice key={w}>{w}</Notice>
        ))}
        <FoodForm
          initial={product.draft}
          saveLabel={log ? ru.foods.saveAndLog : ru.foods.save}
          onSave={async (d) => {
            const f = await repos.foods.add({ ...d, source: 'ai_label', verified: true });
            toast({ text: t.photo.productSaved });
            navigate(log ? `/add/food/${f.id}${addQs(target.date, target.time)}` : '/foods', {
              replace: true,
            });
          }}
          extraActions={
            <Button variant="secondary" onClick={() => setProduct(null)}>
              {ru.common.cancel}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <p className={styles0.muted}>{t.photo.hint}</p>
      <PhotoPicker files={files} onChange={setFiles} max={4} label={t.photo.add} />
      <TextField
        label={t.photo.note}
        placeholder={t.photo.notePlaceholder}
        value={note}
        onChange={setNote}
      />
      {error && (
        <Notice>
          {t.error(error)}{' '}
          <LinkButton to={manualTo} variant="ghost">
            {t.manual}
          </LinkButton>
        </Notice>
      )}
      <Button block onClick={() => void go()} disabled={busy || files.length === 0}>
        {busy ? t.working : t.photo.go}
      </Button>
    </>
  );
}

import styles0 from '../add/add.module.css';

export default function AiPhotoPage() {
  const target = useAddTarget();
  if (!VISION_AI_ENABLED) return <Unavailable title={t.photo.title} />;
  return (
    <Page title={t.photo.title}>
      <AiGate manualTo={`/add/search${target.qs}`}>
        <AiPhotoInner />
      </AiGate>
    </Page>
  );
}
