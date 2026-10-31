import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Food } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { attachBarcode, lookupBarcode } from '../../services/off';
import { toast } from '../../state/ui';
import { BottomSheet } from '../../ui/BottomSheet';
import { FoodSearch } from '../add/SearchPage';
import { reviewKey, useReview } from '../../state/review';
import { Button, Card, LinkButton, Notice, TextField } from '../../ui/kit';
import { VISION_AI_ENABLED } from '../flags';
import { Page } from '../../ui/Page';
import { addQs, useAddTarget } from '../add/addTarget';
import { startScanner, type ScanError, type ScanHandle } from './scanner';
import styles from './barcode.module.css';

const t = ru.barcode;
type Status =
  | { s: 'scanning' }
  | { s: 'looking'; code: string }
  | { s: 'notFound' | 'offline' | 'error'; code: string };

export default function BarcodePage() {
  const navigate = useNavigate();
  const target = useAddTarget();
  const setDraft = useReview((s) => s.setDraft);
  const video = useRef<HTMLVideoElement>(null);
  const handle = useRef<ScanHandle | null>(null);
  const [status, setStatus] = useState<Status>({ s: 'scanning' });
  const [camError, setCamError] = useState<ScanError | null>(null);
  const [manual, setManual] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [finding, setFinding] = useState(false);

  async function handleCode(code: string) {
    handle.current?.stop();
    navigator.vibrate?.(40);
    setStatus({ s: 'looking', code });
    const r = await lookupBarcode(repos, code);
    if (r.kind === 'local' || r.kind === 'off') {
      openReview(r.food, r.kind === 'off' ? 'off' : 'catalog');
      return;
    }
    setStatus({ s: r.kind, code });
  }

  function openReview(food: Food, source: 'off' | 'catalog') {
    setDraft({
      items: [
        {
          key: reviewKey(),
          name: food.brand ? `${food.name} · ${food.brand}` : food.name,
          grams: food.lastGrams ?? food.servings[0]?.grams ?? 100,
          per100g: food.per100g,
          source,
          foodId: food.id,
        },
      ],
      entrySource: 'barcode',
      date: target.date,
      time: target.time,
    });
    navigate('/review', { replace: true });
  }

  useEffect(() => {
    if (status.s !== 'scanning' || !video.current) return;
    let cancelled = false;
    startScanner(video.current, (code) => void handleCode(code))
      .then((h) => {
        if (cancelled) h.stop();
        else handle.current = h;
      })
      .catch((e: ScanError) => setCamError(e));
    return () => {
      cancelled = true;
      handle.current?.stop();
      handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.s, attempt]);

  const createUrl = (code: string) =>
    `/foods/new${addQs(target.date, target.time)}&log=1&barcode=${encodeURIComponent(code)}`;

  return (
    <Page title={t.title}>
      {status.s === 'scanning' && (
        <>
          {!camError && (
            <div className={styles.viewport}>
              <video ref={video} className={styles.video} muted playsInline aria-label={t.hint} />
              <div className={styles.frame} aria-hidden="true" />
            </div>
          )}
          {camError ? (
            <Notice>{camError === 'denied' ? t.cameraDenied : t.cameraUnavailable}</Notice>
          ) : (
            <p className={styles.hint}>{t.hint}</p>
          )}
          <Card title={t.manual}>
            <TextField
              label={t.code}
              value={manual}
              onChange={(v) => setManual(v.replace(/\D/g, ''))}
              inputMode="numeric"
            />
            <Button block disabled={manual.length < 6} onClick={() => void handleCode(manual)}>
              {t.find}
            </Button>
          </Card>
        </>
      )}
      {status.s === 'looking' && <p className={styles.hint}>{t.looking}</p>}
      {(status.s === 'notFound' || status.s === 'offline' || status.s === 'error') && (
        <Card>
          <p>
            {status.s === 'notFound'
              ? t.notFound(status.code)
              : status.s === 'offline'
                ? t.offline
                : t.error}
          </p>
          {status.s === 'notFound' && <p className={styles.hint}>{t.notInOpenBase}</p>}
          <div className={styles.actions}>
            <Button onClick={() => setFinding(true)}>{t.findByName}</Button>
            <LinkButton to={createUrl(status.code)} variant="secondary">
              {t.createManual}
            </LinkButton>
            {VISION_AI_ENABLED && (
              <LinkButton
                to={`/add/ai-label${addQs(target.date, target.time)}&log=1&barcode=${encodeURIComponent(status.code)}`}
                variant="secondary"
              >
                {t.createLabel}
              </LinkButton>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setCamError(null);
                setStatus({ s: 'scanning' });
                setAttempt((a) => a + 1);
              }}
            >
              {t.again}
            </Button>
          </div>
        </Card>
      )}
      <BottomSheet open={finding} title={t.findTitle} onClose={() => setFinding(false)}>
        <p className={styles.hint}>{t.findHint}</p>
        <FoodSearch
          autoFocus={false}
          onPick={async (f) => {
            if (status.s !== 'notFound') return;
            const bound = await attachBarcode(repos, f, status.code);
            toast({ text: t.bound });
            setFinding(false);
            openReview(bound, 'catalog');
          }}
        />
      </BottomSheet>
    </Page>
  );
}
