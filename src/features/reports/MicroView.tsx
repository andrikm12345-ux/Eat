import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { addDays, ageOn, toLocalDate } from '../../domain/dates';
import { formatGrams } from '../../domain/format';
import { microReport } from '../../domain/micros';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { Card, Segmented } from '../../ui/kit';
import listStyles from '../add/add.module.css';
import todayStyles from '../today/today.module.css';

const t = ru.reports;

export function MicroView() {
  const [period, setPeriod] = useState<'7' | '30'>('7');
  const today = toLocalDate(new Date());
  const rows = useLiveQuery(async () => {
    const from = addDays(today, 1 - Number(period));
    const to = today;
    const [entries, profile] = await Promise.all([
      repos.entries.inRange(from, to),
      repos.profile.get(),
    ]);
    const days = new Set(entries.map((e) => e.date)).size;
    const list = microReport(
      entries.flatMap((e) => e.items.map((i) => i.nutrients)),
      Math.max(1, days),
      profile?.sex ?? 'male',
      profile ? ageOn(profile.birthDate, today) : 35,
    );
    // Deficits first, then low-data rows last.
    return list.sort((a, b) => Number(a.lowData) - Number(b.lowData) || a.ratio - b.ratio);
  }, [period, today]);

  return (
    <>
      <Segmented
        label={t.microPeriod}
        value={period}
        onChange={setPeriod}
        options={[
          { value: '7', label: t.micro7 },
          { value: '30', label: t.micro30 },
        ]}
      />
      <p className={listStyles.muted}>{t.microIntro}</p>
      <Card>
        {rows?.map((m) => (
          <div key={m.def.key} style={{ marginBottom: 12 }}>
            <div className={todayStyles.barLabel}>
              <span>{m.def.name}</span>
              <span className={todayStyles.barValue}>
                {formatGrams(m.avg)} {m.def.unit} ·{' '}
                {m.lowData ? t.microLow : t.microNorm(Math.round(m.ratio * 100))}
              </span>
            </div>
            <div
              className={todayStyles.bar}
              role="meter"
              aria-label={m.def.name}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(m.ratio * 100)}
            >
              <div
                className={`${todayStyles.barFill} ${m.above ? todayStyles.barOver : ''}`}
                style={{ width: `${Math.min(1, m.ratio) * 100}%`, opacity: m.lowData ? 0.35 : 1 }}
              />
            </div>
            <span className={listStyles.muted} style={{ fontSize: 12 }}>
              {t.microCoverage(Math.round(m.coverage * 100))}
              {m.deficit ? ` · ${t.microBelow}` : ''}
              {m.above ? ` · ${t.microAbove}` : ''}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}
