import { daysBetween, toLocalDate } from '../../domain/dates';
import { formatKg } from '../../domain/format';
import { direction } from '../../domain/progress';
import { trendChange, trendOn } from '../../domain/weightTrend';
import { ru } from '../../i18n/ru';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProfile } from '../../db/hooks';
import { repos } from '../../db/repos';
import { ACCOUNT } from '../../services/account';
import { useUi } from '../../state/ui';
import { Button, Card } from '../../ui/kit';
import { useTrend } from '../progress/useTrend';
import styles from './weigh.module.css';

const t = ru.weight;
const ARROWS = { down: '↓', up: '↑', flat: '→' } as const;

export function TrendCard() {
  const data = useTrend();
  const profile = useProfile();
  const setOpen = useUi((s) => s.setWeighOpen);
  // The administrator can give a person their own text for this button.
  const labels = useLiveQuery(
    () => repos.settings.get<Record<string, string>>(ACCOUNT.labels, {}),
    [],
  );
  const today = toLocalDate(new Date());
  if (!data) return null;
  const last = data.weights[data.weights.length - 1];
  const trend = trendOn(data.points, today);
  const delta = trendChange(data.points, today, 7);
  const dir = direction(delta);
  return (
    <Card title={t.title}>
      {last ? (
        <>
          <div className={styles.big}>
            {trend !== undefined ? formatKg(trend) : formatKg(last.kg)}
          </div>
          <div className={styles.small}>
            {t.trend}
            {delta !== undefined && (
              <>
                {' · '}
                <span className={styles.arrow} aria-label={t.arrow[dir]}>
                  {ARROWS[dir]}
                </span>{' '}
                {`${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatKg(Math.abs(delta))} кг`}
              </>
            )}
          </div>
          <div className={styles.small} style={{ marginBottom: 'var(--sp-3)' }}>
            {t.raw(profile?.sex ?? 'male')} {formatKg(last.kg)} ·{' '}
            {t.daysAgo(daysBetween(last.date, today))}
          </div>
        </>
      ) : (
        <p className={styles.small}>{t.none}</p>
      )}
      <Button block variant="secondary" onClick={() => setOpen(true)}>
        {labels?.['weigh'] || t.weigh}
      </Button>
    </Card>
  );
}
