import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { addDays } from '../../domain/dates';
import { frequentAround, timeToMinutes } from '../../domain/day';
import type { Food } from '../../domain/types';
import type { FoodDraft } from '../../domain/off';
import { formatKcal } from '../../domain/format';
import { cacheOffDraft, searchOff } from '../../services/off';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Button, LinkButton } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { useAddTarget } from './addTarget';
import { useCatalog } from './catalog';
import { FoodRow } from './FoodRow';
import styles from './add.module.css';

const t = ru.search;

/** Food picker. With `onPick` it works as an embedded chooser (e.g. "заменить на продукт"). */
export function FoodSearch({
  onPick,
  autoFocus = true,
}: {
  onPick?: (f: Food) => void;
  autoFocus?: boolean;
}) {
  const { date, time, qs } = useAddTarget();
  const [q, setQ] = useState('');
  const catalog = useCatalog();
  const recentEntries = useLiveQuery(() => repos.entries.inRange(addDays(date, -60), date), [date]);

  const byId = useMemo(() => new Map((catalog.foods ?? []).map((f) => [f.id, f])), [catalog.foods]);
  const frequent = useMemo(
    () =>
      frequentAround(recentEntries ?? [], timeToMinutes(time), { limit: 6 })
        .map((id) => byId.get(id))
        .filter((f): f is Food => !!f),
    [recentEntries, time, byId],
  );
  const recent = useMemo(
    () =>
      (catalog.foods ?? [])
        .filter((f) => f.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt as string).localeCompare(a.lastUsedAt as string))
        .slice(0, 10),
    [catalog.foods],
  );
  const results = q.trim() ? catalog.search(q) : [];
  const [off, setOff] = useState<{
    q: string;
    state: 'busy' | 'ok' | 'offline' | 'error';
    drafts: FoodDraft[];
  } | null>(null);
  const navigate = useNavigate();

  async function searchOnline() {
    const query = q.trim();
    setOff({ q: query, state: 'busy', drafts: [] });
    const res = await searchOff(query);
    setOff({ q: query, state: res.kind, drafts: res.kind === 'ok' ? res.drafts : [] });
  }

  async function pickOff(d: FoodDraft) {
    const food = await cacheOffDraft(repos, d);
    if (onPick) onPick(food);
    else navigate(link(food));
  }
  const link = (f: Food) => `/add/food/${f.id}${qs}`;
  const list = (foods: Food[]) => (
    <ul className={styles.list}>
      {foods.map((f) => (
        <FoodRow key={f.id} food={f} to={link(f)} {...(onPick ? { onPick } : {})} />
      ))}
    </ul>
  );

  return (
    <>
      <div className={styles.searchBox}>
        <input
          className={styles.input}
          type="search"
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>
      {!onPick && (
        <div className={styles.actions}>
          <LinkButton to={`/foods/new${qs}&log=1`} variant="secondary">
            {t.createFood}
          </LinkButton>
          <LinkButton to={`/add/quick${qs}`} variant="secondary">
            {t.quick}
          </LinkButton>
        </div>
      )}
      {q.trim() ? (
        <>
          {results.length ? (
            <>
              <h2 className={styles.sectionTitle}>{t.results}</h2>
              {list(results)}
            </>
          ) : (
            <p className={styles.muted}>{t.nothing}</p>
          )}
          <p className={styles.muted}>{t.notFoundHint}</p>
          <Button
            block
            variant="secondary"
            disabled={off?.state === 'busy'}
            onClick={() => void searchOnline()}
          >
            {off?.state === 'busy' ? t.searchingOff : t.searchOff}
          </Button>
          {off && off.q === q.trim() && off.state === 'offline' && (
            <p className={styles.muted}>{t.offOffline}</p>
          )}
          {off && off.q === q.trim() && off.state === 'error' && (
            <p className={styles.muted}>{t.offError}</p>
          )}
          {off && off.q === q.trim() && off.state === 'ok' && (
            <>
              <h2 className={styles.sectionTitle}>{t.offResults}</h2>
              {off.drafts.length === 0 ? (
                <p className={styles.muted}>{t.offNothing}</p>
              ) : (
                <>
                  <ul className={styles.list}>
                    {off.drafts.map((d, i) => (
                      <li key={`${d.barcode ?? ''}-${i}`} className={styles.row}>
                        <button
                          type="button"
                          className={styles.rowLink}
                          onClick={() => void pickOff(d)}
                        >
                          <span className={styles.rowMain}>
                            <span className={styles.rowName}>
                              {d.name}
                              {d.brand ? ` · ${d.brand}` : ''}
                            </span>
                            <span className={styles.rowSub}>
                              {t.per100(formatKcal(d.per100g.kcal))}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.muted}>{t.offUnverified}</p>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {frequent.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>{t.frequent}</h2>
              {list(frequent)}
            </>
          )}
          {recent.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>{t.recent}</h2>
              {list(recent)}
            </>
          )}
        </>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <Page title={t.title}>
      <FoodSearch />
    </Page>
  );
}
