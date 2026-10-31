import { formatKcal } from '../../domain/format';
import type { DayMeta } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Button, Card } from '../../ui/kit';
import styles from './today.module.css';

const t = ru.water;

export function WaterCard({ meta, goalMl }: { meta: DayMeta; goalMl: number | undefined }) {
  const add = (ml: number) =>
    repos.dayMeta.upsert(meta.date, { waterMl: Math.max(0, meta.waterMl + ml) });
  return (
    <Card title={t.title}>
      <p className={styles.waterValue}>
        {goalMl
          ? t.of(formatKcal(meta.waterMl), formatKcal(goalMl))
          : `${formatKcal(meta.waterMl)} мл`}
      </p>
      <div className={styles.waterRow}>
        <Button
          variant="secondary"
          onClick={() => void add(-250)}
          disabled={meta.waterMl <= 0}
          aria-label={t.remove}
        >
          −
        </Button>
        <Button variant="secondary" onClick={() => void add(250)}>
          {t.add(250)}
        </Button>
        <Button variant="secondary" onClick={() => void add(500)}>
          {t.add(500)}
        </Button>
      </div>
      {goalMl ? (
        <div className={styles.bar} style={{ marginTop: 10 }} aria-hidden="true">
          <div
            className={styles.barFill}
            style={{ width: `${Math.min(1, meta.waterMl / goalMl) * 100}%` }}
          />
        </div>
      ) : null}
    </Card>
  );
}
