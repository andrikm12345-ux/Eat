import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { logQuick } from '../../services/entries';
import { useUi } from '../../state/ui';
import { renderApp } from '../../test/renderApp';

describe('diary: "only full days" is decided automatically', () => {
  it('a day with about half of the goal or more counts, a nearly empty one does not, the old manual mark still does', async () => {
    // A fixed month, so the three days are always on the one calendar page.
    useUi.setState({ date: '2026-03-15' });
    const full = '2026-03-10'; // 1500 of 2200 → full
    const light = '2026-03-11'; // 300 of 2200 → not full
    const marked = '2026-03-12'; // 200, but marked complete by hand earlier
    await logQuick(
      repos,
      { name: 'Обед', nutrients: { kcal: 1500, protein: 0, fat: 0, carbs: 0 } },
      { date: full, time: '12:00' },
    );
    await logQuick(
      repos,
      { name: 'Перекус', nutrients: { kcal: 300, protein: 0, fat: 0, carbs: 0 } },
      { date: light, time: '12:00' },
    );
    await logQuick(
      repos,
      { name: 'Чай', nutrients: { kcal: 200, protein: 0, fat: 0, carbs: 0 } },
      { date: marked, time: '12:00' },
    );
    await repos.dayMeta.upsert(marked, { complete: true });
    const user = userEvent.setup();
    await renderApp('/diary');
    const list = async () => within(await screen.findByRole('list'));
    await waitFor(async () => expect((await list()).getAllByRole('listitem')).toHaveLength(3));
    await user.click(screen.getByRole('switch', { name: ru.diary.onlyComplete }));
    await waitFor(async () => expect((await list()).getAllByRole('listitem')).toHaveLength(2));
  });
});
