import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PROMPT_MEAL } from '../../ai/prompts';
import { runAi } from '../../ai/run';
import { validateMeal } from '../../ai/validators';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { mealToDraft } from '../../services/aiFood';
import { useReview } from '../../state/review';
import { Button, LinkButton, Notice, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { useAddTarget } from '../add/addTarget';
import { AiGate } from './AiGate';
import { toImageBlocks } from './images';
import { PhotoPicker } from './PhotoPicker';

const t = ru.ai;

export default function AiPhotoPage() {
  const target = useAddTarget();
  const manualTo = `/add/search${target.qs}`;
  return (
    <Page title={t.photo.title}>
      <AiGate manualTo={manualTo}>
        <AiPhoto manualTo={manualTo} />
      </AiGate>
    </Page>
  );
}

function AiPhoto({ manualTo }: { manualTo: string }) {
  const target = useAddTarget();
  const navigate = useNavigate();
  const setDraft = useReview((s) => s.setDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const images = await toImageBlocks(files);
      const { value, runId } = await runAi(repos, {
        kind: 'photo',
        vision: true,
        system: PROMPT_MEAL,
        content: [
          ...images,
          {
            type: 'text',
            text: note.trim() ? `Уточнение: ${note.trim()}` : 'Оцени приём пищи на фото.',
          },
        ],
        validate: validateMeal,
      });
      setDraft(
        await mealToDraft(repos, value, target, { entrySource: 'ai_photo', aiRunId: runId }),
      );
      navigate('/review');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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
