import { useState } from 'react';
import { formatDateRu, toLocalTime } from '../../domain/dates';
import { parseDecimal } from '../../domain/format';
import { repos } from '../../db/repos';
import { useLatestWeight } from '../../db/hooks';
import { ru } from '../../i18n/ru';
import { toast, useUi } from '../../state/ui';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/kit';
import styles from './weigh.module.css';

const t = ru.weight;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'] as const;

export function WeighSheet() {
  const open = useUi((s) => s.weighOpen);
  const setOpen = useUi((s) => s.setWeighOpen);
  const latest = useLatestWeight();
  if (!open || latest === undefined) return null;
  return <Weigh initial={latest?.kg ?? null} onClose={() => setOpen(false)} />;
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

function Weigh({ initial, onClose }: { initial: number | null; onClose: () => void }) {
  const date = useUi((s) => s.date);
  const [text, setText] = useState(initial !== null ? fmt(initial) : '');
  // A prefilled/stepped value is replaced by the first typed digit.
  const [fresh, setFresh] = useState(true);
  const value = parseDecimal(text);
  const valid = value !== null && value >= 30 && value <= 300;

  const press = (k: (typeof KEYS)[number]) => {
    if (k === '⌫') {
      setText(fresh ? '' : text.slice(0, -1));
    } else {
      const base = fresh ? '' : text;
      if (k === ',' && base.includes(',')) return;
      const next = base === '' && k === ',' ? '0,' : base + k;
      const [, dec = ''] = next.split(',');
      if (dec.length > 1 || next.replace(',', '').length > 4) return;
      setText(next);
    }
    setFresh(false);
  };
  const step = (d: number) => {
    const v = value ?? initial ?? 70;
    setText(fmt(v + d));
    // Typing after ± starts a new number (like the prefilled value).
    setFresh(true);
  };

  async function save() {
    if (!valid) return;
    await repos.weights.create({
      date,
      time: toLocalTime(new Date()),
      kg: Math.round((value as number) * 10) / 10,
      source: 'manual',
    });
    toast({ text: t.saved });
    onClose();
  }

  return (
    <BottomSheet open title={t.sheetTitle} onClose={onClose}>
      <p className={styles.date}>{formatDateRu(date)}</p>
      <div className={styles.display}>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => step(-0.1)}
          aria-label={t.minus}
        >
          −
        </button>
        <output
          className={`${styles.value} ${fresh ? styles.fresh : ''}`}
          aria-live="polite"
          aria-label={t.title}
        >
          {text || '—'} <span className={styles.unit}>кг</span>
        </output>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => step(0.1)}
          aria-label={t.plus}
        >
          +
        </button>
      </div>
      {!valid && text && !fresh && <p className={styles.invalid}>{t.invalid}</p>}
      <div className={styles.keypad}>
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={styles.key}
            onClick={() => press(k)}
            aria-label={k === '⌫' ? t.backspace : k}
          >
            {k}
          </button>
        ))}
      </div>
      <Button block onClick={() => void save()} disabled={!valid}>
        {ru.common.save}
      </Button>
    </BottomSheet>
  );
}
