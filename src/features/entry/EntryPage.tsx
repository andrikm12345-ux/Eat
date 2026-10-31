import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { rescaleItem } from '../../domain/day';
import { formatGrams, formatKcal } from '../../domain/format';
import { sumNutrients } from '../../domain/nutrients';
import type { Entry, EntryItem } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { recalcFromFoods } from '../../services/entries';
import { toast } from '../../state/ui';
import { Button, Card, NumberField, Row, Stat, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.entry;

export default function EntryPage() {
  const { id } = useParams();
  const entry = useLiveQuery(
    async () => (id ? ((await repos.entries.get(id)) ?? null) : null),
    [id],
  );
  if (entry === undefined) return <Page title={t.title}>{ru.common.loading}</Page>;
  if (entry === null) return <Page title={t.title}>{t.notFound}</Page>;
  return <EntryEditor key={entry.updatedAt} entry={entry} />;
}

function EntryEditor({ entry }: { entry: Entry }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<EntryItem[]>(entry.items);
  const [date, setDate] = useState(entry.date);
  const [time, setTime] = useState(entry.time);
  const [label, setLabel] = useState(entry.mealLabel ?? '');
  const [note, setNote] = useState(entry.note ?? '');
  const totals = sumNutrients(items.map((i) => i.nutrients));
  const canRecalc = entry.items.some((i) => i.foodId);

  async function save() {
    await repos.entries.edit(entry.id, {
      items,
      date,
      time,
      mealLabel: label.trim() || undefined,
      note: note.trim() || undefined,
    });
    toast({ text: ru.goals.saved });
    navigate(-1);
  }

  async function remove() {
    await repos.entries.softDelete(entry.id);
    toast({
      text: ru.today.deleted,
      action: { label: ru.common.undo, run: () => repos.entries.restore(entry.id) },
    });
    navigate(-1);
  }

  return (
    <Page title={t.title}>
      <Card title={t.items}>
        {items.map((it, i) => (
          <div key={i}>
            <p style={{ margin: '4px 0', fontWeight: 600 }}>{it.name}</p>
            <Row>
              <NumberField
                label={ru.portion.grams}
                suffix="г"
                value={it.grams || null}
                onChange={(v) =>
                  v !== null &&
                  v > 0 &&
                  setItems(items.map((x, j) => (j === i ? rescaleItem(x, v) : x)))
                }
              />
              <div className={styles.muted} style={{ alignSelf: 'center' }}>
                {formatKcal(it.nutrients.kcal)} ккал · Б {formatGrams(it.nutrients.protein)} · Ж{' '}
                {formatGrams(it.nutrients.fat)} · У {formatGrams(it.nutrients.carbs)}
              </div>
            </Row>
            {items.length > 1 && (
              <Button variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                {t.removeItem}
              </Button>
            )}
          </div>
        ))}
        <Stat label={t.total} value={`${formatKcal(totals.kcal)} ${ru.units.kcal}`} />
      </Card>
      <Card>
        <TextField label={t.mealLabel} value={label} onChange={setLabel} />
        <Row>
          <TextField label={ru.today.date} type="date" value={date} onChange={setDate} />
          <TextField label={ru.today.time} type="time" value={time} onChange={setTime} />
        </Row>
        <TextField label={t.note} value={note} onChange={setNote} />
      </Card>
      {canRecalc && (
        <Button
          variant="ghost"
          block
          onClick={async () => {
            const n = await recalcFromFoods(repos, entry);
            toast({ text: t.recalcDone(n) });
          }}
        >
          {t.recalc}
        </Button>
      )}
      <Row>
        <Button variant="secondary" onClick={() => void remove()}>
          {ru.common.delete}
        </Button>
        <Button onClick={() => void save()} disabled={items.length === 0}>
          {ru.common.save}
        </Button>
      </Row>
    </Page>
  );
}
