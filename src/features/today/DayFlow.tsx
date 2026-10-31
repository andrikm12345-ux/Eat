import { useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { entryTitle, groupStacks, minutesToTime, timeToMinutes } from '../../domain/day';
import { formatGrams, formatKcal } from '../../domain/format';
import { sumNutrients } from '../../domain/nutrients';
import type { Entry } from '../../domain/types';
import { ru } from '../../i18n/ru';
import { useUi } from '../../state/ui';
import { useSwipe } from '../../ui/useSwipe';
import { EntryActions } from './EntryActions';
import { deleteWithUndo, repeatWithUndo } from './entryOps';
import styles from './today.module.css';

const t = ru.today;
const DAY_START = 6 * 60;
const DAY_END = 24 * 60 - 1;

const macroLine = (n: Entry['totals']) =>
  `Б ${formatGrams(n.protein)} · Ж ${formatGrams(n.fat)} · У ${formatGrams(n.carbs)}`;

export function DayFlow({ entries }: { entries: Entry[] }) {
  const [menu, setMenu] = useState<Entry | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const openAdd = useUi((s) => s.openAdd);
  const stacks = groupStacks(entries);

  const parts: React.ReactNode[] = [];
  let cursor = Math.min(
    DAY_START,
    stacks[0] ? timeToMinutes((stacks[0][0] as Entry).time) - 30 : DAY_START,
  );
  const gap = (from: number, to: number, key: string) => {
    if (to - from < 5) return;
    const height = Math.max(14, Math.min(80, (to - from) * 0.4));
    const onClick = (ev: MouseEvent<HTMLButtonElement>) => {
      const rect = ev.currentTarget.getBoundingClientRect();
      const ratio = rect.height ? (ev.clientY - rect.top) / rect.height : 0.5;
      const m = Math.round((from + Math.min(1, Math.max(0, ratio)) * (to - from)) / 5) * 5;
      openAdd(minutesToTime(m));
    };
    parts.push(
      <button
        key={key}
        type="button"
        className={styles.gap}
        style={{ height }}
        onClick={onClick}
        aria-label={t.addAt(minutesToTime(Math.round((from + to) / 2 / 5) * 5))}
      />,
    );
  };

  stacks.forEach((stack, i) => {
    const first = stack[0] as Entry;
    const last = stack[stack.length - 1] as Entry;
    gap(cursor, timeToMinutes(first.time), `g${i}`);
    const id = first.id;
    const expanded = open.has(id) || stack.length === 1;
    parts.push(
      <div key={id} className={styles.stack}>
        <span className={styles.stackTime}>{first.time}</span>
        <span className={styles.dot} aria-hidden="true" />
        {expanded ? (
          <>
            {stack.map((e) => (
              <EntryRow key={e.id} entry={e} onMenu={() => setMenu(e)} />
            ))}
            {stack.length > 1 && (
              <button
                type="button"
                className={styles.more}
                style={{ width: 'auto' }}
                onClick={() => toggle(id)}
              >
                {t.collapse}
              </button>
            )}
          </>
        ) : (
          <StackRow stack={stack} onOpen={() => toggle(id)} />
        )}
      </div>,
    );
    cursor = timeToMinutes(last.time);
  });
  gap(cursor, DAY_END, 'gend');

  function toggle(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <>
      {entries.length === 0 && <p className={styles.empty}>{t.empty}</p>}
      <div className={styles.flow}>{parts}</div>
      <EntryActions entry={menu} onClose={() => setMenu(null)} />
    </>
  );
}

function StackRow({ stack, onOpen }: { stack: Entry[]; onOpen: () => void }) {
  const totals = sumNutrients(stack.map((e) => e.totals));
  return (
    <div className={styles.rowWrap}>
      <div className={styles.row}>
        <button type="button" className={styles.rowMain} onClick={onOpen} aria-expanded={false}>
          <span className={styles.rowTitle}>{stack.map((e) => entryTitle(e, 30)).join(', ')}</span>
          <span className={styles.rowSub}>{macroLine(totals)}</span>
        </button>
        <button
          type="button"
          className={`${styles.count} ${styles.countBtn}`}
          onClick={onOpen}
          tabIndex={-1}
        >
          {t.stackCount(stack.length)}
        </button>
        <span className={styles.rowKcal}>{formatKcal(totals.kcal)}</span>
        <span className={styles.more} aria-hidden="true" />
      </div>
    </div>
  );
}

function EntryRow({ entry, onMenu }: { entry: Entry; onMenu: () => void }) {
  const navigate = useNavigate();
  const sw = useSwipe({
    onLeft: () => void deleteWithUndo(entry),
    onRight: () => void repeatWithUndo(entry),
    onLongPress: onMenu,
  });
  return (
    <div className={styles.rowWrap}>
      {sw.dx !== 0 && (
        <div className={styles.swipeBg} aria-hidden="true">
          <span>{t.repeatNow}</span>
          <span>{ru.common.delete}</span>
        </div>
      )}
      <div
        className={`${styles.row} ${sw.dragging ? styles.rowDragging : ''}`}
        style={{ transform: sw.dx ? `translateX(${sw.dx}px)` : undefined }}
        {...sw.handlers}
      >
        <button
          type="button"
          className={styles.rowMain}
          onClick={() => {
            if (!sw.consumeClick()) navigate(`/entry/${entry.id}`);
          }}
        >
          <span className={styles.rowTitle}>{entryTitle(entry)}</span>
          <span className={styles.rowSub}>
            {entry.time} · {macroLine(entry.totals)}
          </span>
        </button>
        <span className={styles.rowKcal}>{formatKcal(entry.totals.kcal)}</span>
        <button type="button" className={styles.more} aria-label={t.actions} onClick={onMenu}>
          ⋯
        </button>
      </div>
    </div>
  );
}
