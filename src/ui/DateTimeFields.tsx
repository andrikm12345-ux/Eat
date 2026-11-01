import { useId, useState } from 'react';
import { parseLocalDate, toLocalDate } from '../domain/dates';
import { isoToRu, maskDate, maskTime, parseRuDate, parseRuTime } from './dateText';
import type { LocalDate, LocalTime } from '../domain/types';
import { ru } from '../i18n/ru';
import { BottomSheet } from './BottomSheet';
import { IconCalendar, IconClock } from './icons';
import { Button } from './kit';
import styles from './kit.module.css';
import pick from './DateTimeFields.module.css';

const t = ru.dateTime;
const pad = (n: number) => String(n).padStart(2, '0');

type Common = {
  label: string;
  hint?: string;
  autoFocus?: boolean;
};

type Parts<V extends string> = {
  value: V;
  mask: (raw: string) => string;
  parse: (text: string) => V | null;
  show: (v: V) => string;
  full: number;
  allowEmpty: boolean;
  validate?: (v: V) => string | null;
  onChange: (v: V) => void;
};

/** A masked text field: keeps what is being typed, reports only complete valid values. */
function useMasked<V extends string>(p: Parts<V>) {
  const [text, setText] = useState(() => (p.value ? p.show(p.value) : ''));
  const [seen, setSeen] = useState(p.value);
  if (p.value !== seen) {
    setSeen(p.value);
    if (p.parse(text) !== p.value) setText(p.value ? p.show(p.value) : '');
  }
  const typed = p.parse(text);
  const error =
    text.length >= p.full && (typed === null ? t.invalid : (p.validate?.(typed) ?? null));
  return {
    text,
    error,
    input: (raw: string) => {
      const m = p.mask(raw);
      setText(m);
      const v = p.parse(m);
      if (v !== null && !p.validate?.(v)) {
        setSeen(v);
        p.onChange(v);
      } else if (m === '' && p.allowEmpty) {
        setSeen('' as V);
        p.onChange('' as V);
      }
    },
    /** An unfinished entry goes back to the last good value. */
    settle: () => {
      if (p.parse(text) === null || p.validate?.(p.parse(text) as V))
        setText(p.value ? p.show(p.value) : '');
    },
    set: (v: V) => {
      setText(p.show(v));
      setSeen(v);
      p.onChange(v);
    },
  };
}

/** Date as 01.11.2026: type it or pick it on a calendar. */
export function DateField({
  label,
  value,
  onChange,
  max,
  allowEmpty = false,
  hint,
  autoFocus,
}: Common & {
  value: LocalDate;
  onChange: (v: LocalDate) => void;
  /** Latest allowed date. */
  max?: LocalDate;
  allowEmpty?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const f = useMasked<LocalDate>({
    value,
    mask: maskDate,
    parse: parseRuDate,
    show: isoToRu,
    full: 10,
    allowEmpty,
    ...(max ? { validate: (v: LocalDate) => (v > max ? t.future : null) } : {}),
    onChange,
  });
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          id={id}
          className={styles.input}
          inputMode="numeric"
          autoComplete="off"
          placeholder={t.datePlaceholder}
          value={f.text}
          autoFocus={autoFocus}
          onChange={(e) => f.input(e.target.value)}
          onBlur={f.settle}
        />
        <button
          type="button"
          className={pick.iconBtn}
          aria-label={`${t.pickDate}: ${label}`}
          onClick={() => setOpen(true)}
        >
          <IconCalendar />
        </button>
      </div>
      {f.error ? <span className={styles.error}>{f.error}</span> : null}
      {hint && !f.error ? <span className={styles.hint}>{hint}</span> : null}
      <BottomSheet open={open} title={label} onClose={() => setOpen(false)}>
        <Calendar
          value={value}
          {...(max ? { max } : {})}
          onPick={(d) => {
            f.set(d);
            setOpen(false);
          }}
        />
      </BottomSheet>
    </div>
  );
}

const WEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

function Calendar({
  value,
  max,
  onPick,
}: {
  value: LocalDate;
  max?: LocalDate;
  onPick: (d: LocalDate) => void;
}) {
  const today = toLocalDate(new Date());
  const start = value || today;
  const [view, setView] = useState(() => {
    const d = parseLocalDate(start);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const move = (dm: number, dy = 0) =>
    setView(({ y, m }) => {
      const n = new Date(y + dy, m + dm, 1);
      return { y: n.getFullYear(), m: n.getMonth() };
    });
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (LocalDate | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${view.y}-${pad(view.m + 1)}-${pad(i + 1)}`),
  ];
  return (
    <div className={pick.calendar}>
      <div className={pick.head}>
        <button type="button" aria-label={t.prevYear} onClick={() => move(0, -1)}>
          «
        </button>
        <button type="button" aria-label={t.prevMonth} onClick={() => move(-1)}>
          ‹
        </button>
        <b className={pick.title}>
          {MONTHS[view.m]} {view.y}
        </b>
        <button type="button" aria-label={t.nextMonth} onClick={() => move(1)}>
          ›
        </button>
        <button type="button" aria-label={t.nextYear} onClick={() => move(0, 1)}>
          »
        </button>
      </div>
      <div className={pick.grid}>
        {WEEK.map((w) => (
          <span key={w} className={pick.dow}>
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              disabled={!!max && d > max}
              aria-pressed={d === value}
              aria-label={isoToRu(d)}
              className={`${pick.day} ${d === value ? pick.on : ''} ${d === today ? pick.today : ''}`}
              onClick={() => onPick(d)}
            >
              {i - lead + 1}
            </button>
          ) : (
            <span key={`b${i}`} />
          ),
        )}
      </div>
      {!max || today <= max ? (
        <Button variant="ghost" block onClick={() => onPick(today)}>
          {t.today}
        </Button>
      ) : null}
    </div>
  );
}

/** 24-hour time as 06:00: type it or pick the hour and the minutes. */
export function TimeField({
  label,
  value,
  onChange,
  hint,
  autoFocus,
}: Common & { value: LocalTime; onChange: (v: LocalTime) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const f = useMasked<LocalTime>({
    value,
    mask: maskTime,
    parse: parseRuTime,
    show: (v) => v,
    full: 5,
    allowEmpty: false,
    onChange,
  });
  const [h, m] = (parseRuTime(value) ?? '00:00').split(':').map(Number) as [number, number];
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          id={id}
          className={styles.input}
          inputMode="numeric"
          autoComplete="off"
          placeholder={t.timePlaceholder}
          value={f.text}
          autoFocus={autoFocus}
          onChange={(e) => f.input(e.target.value)}
          onBlur={f.settle}
        />
        <button
          type="button"
          className={pick.iconBtn}
          aria-label={`${t.pickTime}: ${label}`}
          onClick={() => setOpen(true)}
        >
          <IconClock />
        </button>
      </div>
      {f.error ? <span className={styles.error}>{f.error}</span> : null}
      {hint && !f.error ? <span className={styles.hint}>{hint}</span> : null}
      <BottomSheet open={open} title={label} onClose={() => setOpen(false)}>
        <div className={pick.timeSheet}>
          <p className={pick.caption}>{t.hours}</p>
          <div className={pick.timeGrid}>
            {Array.from({ length: 24 }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === h}
                aria-label={`${t.hours}: ${pad(i)}`}
                className={`${pick.cell} ${i === h ? pick.on : ''}`}
                onClick={() => f.set(`${pad(i)}:${pad(m)}`)}
              >
                {pad(i)}
              </button>
            ))}
          </div>
          <p className={pick.caption}>{t.minutes}</p>
          <div className={pick.timeGrid}>
            {Array.from({ length: 12 }, (_, i) => i * 5).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={v === m}
                aria-label={`${t.minutes}: ${pad(v)}`}
                className={`${pick.cell} ${v === m ? pick.on : ''}`}
                onClick={() => f.set(`${pad(h)}:${pad(v)}`)}
              >
                {pad(v)}
              </button>
            ))}
          </div>
          <Button block onClick={() => setOpen(false)}>
            {t.done}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
