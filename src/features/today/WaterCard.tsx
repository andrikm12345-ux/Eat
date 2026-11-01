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
      <div key={meta.waterMl} className={`${styles.miniBig} ${styles.bump}`}>
        {formatKcal(meta.waterMl)}
      </div>
      <div className={styles.miniSub} style={{ marginBottom: 'var(--sp-2)' }}>
        {goalMl ? `из ${formatKcal(goalMl)} мл` : 'мл'}
      </div>
      {goalMl ? (
        <div className={styles.bar} style={{ marginBottom: 'var(--sp-3)' }} aria-hidden="true">
          <div
            className={styles.barFill}
            style={{ width: `${Math.min(1, meta.waterMl / goalMl) * 100}%` }}
          />
        </div>
      ) : null}
      <div className={styles.waterBtns}>
        <Button variant="secondary" aria-label={t.add(250)} onClick={() => void add(250)}>
          +250
        </Button>
        <Button variant="secondary" aria-label={t.add(500)} onClick={() => void add(500)}>
          +500
        </Button>
      </div>
      {meta.waterMl > 0 && (
        <button
          type="button"
          className={styles.undoWater}
          aria-label={t.remove}
          onClick={() => void add(-250)}
        >
          {t.remove}
        </button>
      )}
    </Card>
  );
}
