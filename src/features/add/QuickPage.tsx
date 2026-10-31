import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { formatKcal } from '../../domain/format';
import { atwaterKcal } from '../../domain/nutrients';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { logQuick } from '../../services/entries';
import { toast, useUi } from '../../state/ui';
import { Button, NumberField, Row, TextField } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { useAddTarget } from './addTarget';

const t = ru.quick;

export default function QuickPage() {
  const target = useAddTarget();
  const navigate = useNavigate();
  const setDate = useUi((s) => s.setDate);
  const [params] = useSearchParams();
  const [name, setName] = useState(params.get('name') ?? '');
  const [kcal, setKcal] = useState<number | null>(null);
  const [p, setP] = useState<number | null>(null);
  const [f, setF] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [date, setD] = useState(target.date);
  const [time, setTime] = useState(target.time);
  const macros = { protein: p ?? 0, fat: f ?? 0, carbs: c ?? 0 };
  const fromMacros = atwaterKcal(macros);
  const finalKcal = kcal ?? (fromMacros > 0 ? fromMacros : null);
  const valid = finalKcal !== null && finalKcal >= 0 && finalKcal < 10000;

  async function save() {
    if (!valid) return;
    await logQuick(
      repos,
      { name: name.trim() || t.defaultName, nutrients: { kcal: finalKcal, ...macros } },
      { date, time },
    );
    setDate(date);
    toast({ text: ru.repeat.added });
    navigate('/');
  }

  return (
    <Page title={t.title}>
      <TextField label={t.name} placeholder={t.namePlaceholder} value={name} onChange={setName} />
      <NumberField
        label={t.kcal}
        suffix={ru.units.kcal}
        value={kcal}
        onChange={setKcal}
        autoFocus
        hint={kcal === null && fromMacros > 0 ? t.autoKcal(formatKcal(fromMacros)) : undefined}
      />
      <Row>
        <NumberField label={ru.foods.protein} suffix="г" value={p} onChange={setP} />
        <NumberField label={ru.foods.fat} suffix="г" value={f} onChange={setF} />
        <NumberField label={ru.foods.carbs} suffix="г" value={c} onChange={setC} />
      </Row>
      <Row>
        <TextField label={ru.today.date} type="date" value={date} onChange={setD} />
        <TextField label={ru.today.time} type="time" value={time} onChange={setTime} />
      </Row>
      <Button block onClick={() => void save()} disabled={!valid}>
        {t.save}
      </Button>
    </Page>
  );
}
