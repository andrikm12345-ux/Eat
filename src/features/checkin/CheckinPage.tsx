import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toLocalDate } from '../../domain/dates';
import { formatKcal } from '../../domain/format';
import type { Checkin } from '../../domain/types';
import { useGoalFor } from '../../db/hooks';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { acceptCheckin, skipCheckin } from '../../services/tdee';
import { toast } from '../../state/ui';
import { Button, Card, NumberField, Stat } from '../../ui/kit';
import { Page } from '../../ui/Page';
import listStyles from '../add/add.module.css';

const t = ru.checkin;

export default function CheckinPage() {
  const pending = useLiveQuery(
    async () =>
      (await repos.checkins.where('status', 'pending')).sort((a, b) =>
        b.weekStart.localeCompare(a.weekStart),
      )[0] ?? null,
    [],
  );
  if (pending === undefined) return <Page title={t.title}>{ru.common.loading}</Page>;
  if (!pending) {
    return (
      <Page title={t.title}>
        <p className={listStyles.muted}>{t.none}</p>
      </Page>
    );
  }
  return <CheckinView c={pending} />;
}

function CheckinView({ c }: { c: Checkin }) {
  const navigate = useNavigate();
  const today = toLocalDate(new Date());
  const goal = useGoalFor(today);
  const [manual, setManual] = useState(false);
  const [kcal, setKcal] = useState<number | null>(c.proposedKcal);

  async function accept(value: number) {
    await acceptCheckin(repos, c, Math.round(value), today);
    toast({ text: t.accepted });
    navigate('/', { replace: true });
  }

  return (
    <Page title={t.title}>
      <Card>
        <Stat label={t.current} value={goal ? `${formatKcal(goal.kcal)} ккал` : '—'} />
        <Stat label={t.proposed} value={`${formatKcal(c.proposedKcal)} ккал`} />
        <p>{c.explanation}</p>
        <p className={listStyles.muted}>{t.note}</p>
      </Card>
      {manual && (
        <NumberField label={t.manualKcal} suffix="ккал" value={kcal} onChange={setKcal} autoFocus />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {manual ? (
          <Button
            onClick={() => kcal && void accept(kcal)}
            disabled={!kcal || kcal < 800 || kcal > 6000}
          >
            {t.applyManual}
          </Button>
        ) : (
          <Button onClick={() => void accept(c.proposedKcal)}>{t.accept}</Button>
        )}
        <Button variant="secondary" onClick={() => setManual(!manual)}>
          {t.manual}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await skipCheckin(repos, c);
            toast({ text: t.skipped });
            navigate('/', { replace: true });
          }}
        >
          {t.skip}
        </Button>
      </div>
    </Page>
  );
}
