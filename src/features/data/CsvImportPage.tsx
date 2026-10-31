import { useMemo, useState } from 'react';
import { guessColumns, mapRows, parseCsv, type CsvField, type ImportedRow } from '../../domain/csv';
import { formatDateRu } from '../../domain/dates';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { importRows } from '../../services/csvImport';
import { toast } from '../../state/ui';
import { Button, Card, Notice } from '../../ui/kit';
import { Page } from '../../ui/Page';
import styles from '../add/add.module.css';

const t = ru.csv;
const FIELDS: CsvField[] = [
  'date',
  'weight',
  'steps',
  'activeKcal',
  'workoutType',
  'duration',
  'workoutKcal',
];

export default function CsvImportPage() {
  const [table, setTable] = useState<string[][] | null>(null);
  const [cols, setCols] = useState<Record<CsvField, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const headers = table?.[0] ?? [];
  const mapped = useMemo(
    () => (table && cols ? mapRows(table.slice(1), cols) : null),
    [table, cols],
  );

  async function onFile(f: File | undefined) {
    if (!f) return;
    const rows = parseCsv(await f.text());
    setTable(rows);
    setCols(rows[0] ? guessColumns(rows[0]) : null);
  }

  async function run(rows: ImportedRow[]) {
    setBusy(true);
    try {
      const res = await importRows(repos, rows);
      toast({ text: t.done(res.weights, res.days, res.workouts), durationMs: 7000 });
      setTable(null);
      setCols(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={t.title}>
      <p className={styles.muted}>{t.intro}</p>
      <label
        className={styles.input}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          marginBottom: 12,
        }}
      >
        {t.file}
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          hidden
          data-testid="csv-file"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
      {table && table.length < 2 && <Notice>{t.empty}</Notice>}
      {cols && table && table.length >= 2 && (
        <>
          <Card title={t.columns}>
            {FIELDS.map((f) => (
              <div key={f} style={{ marginBottom: 8 }}>
                <label className={styles.muted} htmlFor={`col-${f}`}>
                  {t.fields[f]}
                </label>
                <select
                  id={`col-${f}`}
                  className={styles.input}
                  value={cols[f]}
                  onChange={(e) => setCols({ ...cols, [f]: Number(e.target.value) })}
                >
                  <option value={-1}>{t.none}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `#${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </Card>
          {mapped && (
            <Card title={t.preview}>
              <p>{t.rows(mapped.ok.length, mapped.skipped)}</p>
              <ul className={styles.list}>
                {mapped.ok.slice(0, 8).map((r, i) => (
                  <li key={i} className={styles.row}>
                    <div className={styles.rowLink}>
                      <span className={styles.rowMain}>
                        <span className={styles.rowName}>{formatDateRu(r.date)}</span>
                        <span className={styles.rowSub}>
                          {[
                            r.weight !== undefined &&
                              `${ru.csv.fields.weight}: ${String(r.weight).replace('.', ',')}`,
                            r.steps !== undefined && `${ru.csv.fields.steps}: ${r.steps}`,
                            r.activeKcal !== undefined &&
                              `${ru.csv.fields.activeKcal}: ${r.activeKcal}`,
                            r.workout && `${r.workout.type}, ${r.workout.durationMin} мин`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div style={{ height: 12 }} />
              <Button
                block
                disabled={busy || mapped.ok.length === 0}
                onClick={() => void run(mapped.ok)}
              >
                {t.import}
              </Button>
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
