import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { addDays, toLocalTime } from '../../domain/dates';
import { frequentAround, timeToMinutes } from '../../domain/day';
import { formatKcal } from '../../domain/format';
import type { Food } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { useUi } from '../../state/ui';
import { BottomSheet } from '../../ui/BottomSheet';
import { useAiConfig } from '../ai/useAi';
import { addQs } from './addTarget';
import { ADD_TILES } from './addTiles';
import styles from './AddSheet.module.css';

export function AddSheet() {
  const { open, time: atTime } = useUi((s) => s.addSheet);
  const close = useUi((s) => s.closeAdd);
  const date = useUi((s) => s.date);
  const navigate = useNavigate();
  const time = atTime ?? toLocalTime(new Date());
  const qs = addQs(date, time);
  const ai = useAiConfig();

  const frequent = useLiveQuery(async () => {
    if (!open) return [];
    const entries = await repos.entries.inRange(addDays(date, -60), date);
    const ids = frequentAround(entries, timeToMinutes(time), { limit: 5 });
    const foods = await repos.db.foods.bulkGet(ids);
    return foods.filter((f): f is Food => !!f && !f.deletedAt);
  }, [open, date, time]);

  const go = (path: string) => {
    close();
    navigate(path);
  };

  return (
    <BottomSheet open={open} title={atTime ? ru.today.addAt(atTime) : ru.add.title} onClose={close}>
      <div className={styles.grid}>
        {ADD_TILES.map((tile) => {
          const { key, path } = tile;
          // Without AI set up, AI tiles lead to the manual equivalent.
          const manual = 'manual' in tile && !ai?.ready ? tile.manual : null;
          return path ? (
            <button
              key={key}
              type="button"
              className={styles.tile}
              onClick={() => go(`${manual ?? path}${qs}`)}
            >
              <span>{ru.add.tiles[key]}</span>
              {manual && <span className={styles.soon}>{ru.add.manualHint}</span>}
            </button>
          ) : (
            <button key={key} type="button" className={styles.tile} disabled>
              <span>{ru.add.tiles[key]}</span>
              <span className={styles.soon}>{ru.add.soon}</span>
            </button>
          );
        })}
      </div>
      {frequent && frequent.length > 0 && (
        <>
          <h3 className={styles.subtitle}>{ru.search.frequent}</h3>
          <ul className={styles.freq}>
            {frequent.map((f) => (
              <li key={f.id}>
                <Link to={`/add/food/${f.id}${qs}`} className={styles.freqItem} onClick={close}>
                  <span className={styles.freqName}>{f.name}</span>
                  <span className={styles.soon}>
                    {f.lastGrams ? `${f.lastGrams} г · ` : ''}
                    {formatKcal(((f.lastGrams ?? 100) * f.per100g.kcal) / 100)} ккал
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </BottomSheet>
  );
}
