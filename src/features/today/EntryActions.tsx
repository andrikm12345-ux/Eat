import { useState } from 'react';
import { useNavigate } from 'react-router';
import { entryTitle } from '../../domain/day';
import type { Entry } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { copyEntry, saveAsTemplate } from '../../services/entries';
import { deleteWithUndo, repeatWithUndo } from './entryOps';
import { toast } from '../../state/ui';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button, Row, TextField } from '../../ui/kit';
import styles from './today.module.css';

const t = ru.today;
type Mode = 'menu' | 'time' | 'day' | 'template' | 'copy';

/** Long-press menu for an entry. */
export function EntryActions({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('menu');
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const close = () => {
    setMode('menu');
    onClose();
  };
  if (!entry) return null;
  const go = (m: Mode) => {
    setTime(entry.time);
    setDate(entry.date);
    setName(entryTitle(entry));
    setMode(m);
  };

  return (
    <BottomSheet open title={entryTitle(entry)} onClose={close}>
      {mode === 'menu' && (
        <div className={styles.sheetActions}>
          <Button variant="secondary" onClick={() => navigate(`/entry/${entry.id}`)}>
            {t.open}
          </Button>
          <Button variant="secondary" onClick={() => go('time')}>
            {t.changeTime}
          </Button>
          <Button variant="secondary" onClick={() => go('day')}>
            {t.moveDay}
          </Button>
          <Button variant="secondary" onClick={() => go('copy')}>
            {t.copy}
          </Button>
          <Button variant="secondary" onClick={() => go('template')}>
            {t.saveTemplate}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              close();
              await repeatWithUndo(entry);
            }}
          >
            {t.repeatNow}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              close();
              await deleteWithUndo(entry);
            }}
          >
            {ru.common.delete}
          </Button>
        </div>
      )}
      {mode === 'time' && (
        <>
          <TextField label={t.time} type="time" value={time} onChange={setTime} autoFocus />
          <Row>
            <Button variant="secondary" onClick={() => setMode('menu')}>
              {ru.common.back}
            </Button>
            <Button
              disabled={!time}
              onClick={async () => {
                await repos.entries.edit(entry.id, { time });
                close();
              }}
            >
              {t.apply}
            </Button>
          </Row>
        </>
      )}
      {(mode === 'day' || mode === 'copy') && (
        <>
          <TextField label={t.date} type="date" value={date} onChange={setDate} autoFocus />
          <TextField label={t.time} type="time" value={time} onChange={setTime} />
          <Row>
            <Button variant="secondary" onClick={() => setMode('menu')}>
              {ru.common.back}
            </Button>
            <Button
              disabled={!date || !time}
              onClick={async () => {
                if (mode === 'day') {
                  await repos.entries.edit(entry.id, { date, time });
                  toast({ text: t.moved });
                } else {
                  const c = await copyEntry(repos, entry, { date, time });
                  toast({
                    text: t.copied,
                    action: { label: ru.common.undo, run: () => repos.entries.softDelete(c.id) },
                  });
                }
                close();
              }}
            >
              {t.apply}
            </Button>
          </Row>
        </>
      )}
      {mode === 'template' && (
        <>
          <TextField label={t.templateName} value={name} onChange={setName} autoFocus />
          <Row>
            <Button variant="secondary" onClick={() => setMode('menu')}>
              {ru.common.back}
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={async () => {
                await saveAsTemplate(repos, entry, name.trim());
                toast({ text: t.templateSaved });
                close();
              }}
            >
              {ru.common.save}
            </Button>
          </Row>
        </>
      )}
    </BottomSheet>
  );
}
