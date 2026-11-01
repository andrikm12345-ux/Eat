import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { PROMPT_WEEKLY } from '../../ai/prompts';
import { runAi } from '../../ai/run';
import { validateWeekly, type WeeklyResult } from '../../ai/validators';
import { addDays, formatDateRu, toLocalDate, weekStart } from '../../domain/dates';
import { formatGrams, formatKcal, formatKg } from '../../domain/format';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import {
  insightsKey,
  loadWeekReport,
  weeklyAggregates,
  type WeekReport,
} from '../../services/reports';
import { Button, Card, Notice, Stat } from '../../ui/kit';
import listStyles from '../add/add.module.css';
import { useAiConfig } from '../ai/useAi';

const t = ru.reports;
const signed = (v: number, fmt: (x: number) => string) =>
  v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : fmt(0);

export function WeekReportView() {
  const [ws, setWs] = useState(weekStart(toLocalDate(new Date())));
  const data = useLiveQuery(() => loadWeekReport(repos, ws), [ws]);
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <Button variant="ghost" aria-label={t.prevWeek} onClick={() => setWs(addDays(ws, -7))}>
          ‹
        </Button>
        <strong>
          {t.weekRange(formatDateRu(ws, 'd MMM'), formatDateRu(addDays(ws, 6), 'd MMM'))}
        </strong>
        <Button
          variant="ghost"
          aria-label={t.nextWeek}
          onClick={() => setWs(addDays(ws, 7))}
          disabled={addDays(ws, 7) > toLocalDate(new Date())}
        >
          ›
        </Button>
      </div>
      {data ? <Week w={data} /> : <p>{ru.common.loading}</p>}
    </>
  );
}

function Week({ w }: { w: WeekReport }) {
  const g = w.goalAvg;
  const vs = (v: number, goal: number | undefined, unit: string, f = formatGrams) =>
    goal ? t.vsGoal(`${f(v)}`, `${f(goal)} ${unit}`) : `${f(v)} ${unit}`;
  const flagged = w.micros.filter((m) => m.deficit || m.above);
  return (
    <>
      <Card title={t.averages}>
        <p className={listStyles.muted}>{t.logged(w.loggedDays)}</p>
        {w.loggedDays === 0 ? (
          <p className={listStyles.muted}>{t.noData}</p>
        ) : (
          <>
            <Stat label={ru.foods.kcal} value={vs(w.avg.kcal, g?.kcal, 'ккал', formatKcal)} />
            <Stat label={ru.foods.protein} value={vs(w.avg.protein, g?.protein, 'г')} />
            <Stat label={ru.foods.fat} value={vs(w.avg.fat, g?.fat, 'г')} />
            <Stat label={ru.foods.carbs} value={vs(w.avg.carbs, g?.carbs, 'г')} />
            <Stat label={ru.foods.fiber} value={vs(w.avg.fiber ?? 0, g?.fiber || undefined, 'г')} />
          </>
        )}
      </Card>
      <Card>
        {w.trendStart !== null && w.trendEnd !== null && (
          <Stat
            label={t.trend}
            value={
              Math.abs(w.trendEnd - w.trendStart) < 0.05
                ? t.trendSame(formatKg(w.trendEnd))
                : t.trendChange(
                    formatKg(w.trendStart),
                    formatKg(w.trendEnd),
                    signed(w.trendEnd - w.trendStart, formatKg),
                  )
            }
          />
        )}
        {w.tdeeStart !== null && w.tdeeEnd !== null && (
          <Stat
            label={t.energy}
            value={
              Math.round(w.tdeeEnd - w.tdeeStart) === 0
                ? t.energySame(formatKcal(w.tdeeEnd))
                : t.energyChange(
                    formatKcal(w.tdeeStart),
                    formatKcal(w.tdeeEnd),
                    signed(Math.round(w.tdeeEnd - w.tdeeStart), formatKcal),
                  )
            }
          />
        )}
      </Card>
      {w.topKcal.length > 0 && (
        <Card title={t.topKcal}>
          {w.topKcal.map((s) => (
            <Stat
              key={s.name}
              label={s.name}
              value={`${formatKcal(s.value)} ккал · ${Math.round(s.share * 100)} %`}
            />
          ))}
        </Card>
      )}
      {w.topProtein.length > 0 && (
        <Card title={t.topProtein}>
          {w.topProtein.map((s) => (
            <Stat
              key={s.name}
              label={s.name}
              value={`${formatGrams(s.value)} г · ${Math.round(s.share * 100)} %`}
            />
          ))}
        </Card>
      )}
      <Card title={t.microDeficits}>
        {w.loggedDays < 3 ? (
          <p className={listStyles.muted}>{t.microFewDays}</p>
        ) : flagged.length === 0 ? (
          <p className={listStyles.muted}>{t.microNone}</p>
        ) : (
          flagged.map((m) => (
            <div
              key={m.def.key}
              style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}
            >
              <strong>{m.def.name}</strong>
              <div className={listStyles.muted} style={{ fontSize: 13 }}>
                {m.above ? t.microAbove : t.microBelow}: {t.microNorm(Math.round(m.ratio * 100))},{' '}
                {t.microCoverage(Math.round(m.coverage * 100))}
              </div>
            </div>
          ))
        )}
      </Card>
      <Card title={t.activity}>
        <p style={{ margin: '4px 0' }}>{t.water(formatKcal(w.waterAvg))}</p>
        {w.stepsAvg !== null && (
          <p style={{ margin: '4px 0' }}>{t.steps(formatKcal(w.stepsAvg))}</p>
        )}
        <p style={{ margin: '4px 0' }}>{t.workouts(w.workouts.count, w.workouts.minutes)}</p>
      </Card>
      <Insights w={w} />
    </>
  );
}

function Insights({ w }: { w: WeekReport }) {
  const ai = useAiConfig();
  const saved = useLiveQuery(
    () => repos.settings.get<WeeklyResult | null>(insightsKey(w.weekStart), null),
    [w.weekStart],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ai?.ready) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { value } = await runAi(repos, {
        kind: 'weekly',
        vision: true,
        system: PROMPT_WEEKLY,
        content: [{ type: 'text', text: JSON.stringify(weeklyAggregates(w)) }],
        validate: validateWeekly,
      });
      await repos.settings.set(insightsKey(w.weekStart), value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t.aiTitle}>
      <p className={listStyles.muted}>{t.aiHint}</p>
      {saved && (
        <>
          <p className={listStyles.muted}>{t.aiQuality[saved.dataQuality]}</p>
          {saved.observations.map((o, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <strong>{o.title}</strong>
              <p style={{ margin: '2px 0' }}>{o.text}</p>
              {o.evidence && <p className={listStyles.muted}>{o.evidence}</p>}
            </div>
          ))}
          <ul>
            {saved.suggestions.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ul>
        </>
      )}
      {error && <Notice>{ru.ai.error(error)}</Notice>}
      <Button block variant="secondary" disabled={busy} onClick={() => void run()}>
        {busy ? ru.ai.working : saved ? t.aiRefresh : t.aiGet}
      </Button>
    </Card>
  );
}
