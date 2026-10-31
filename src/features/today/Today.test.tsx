import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addDays, toLocalDate, toLocalTime } from '../../domain/dates';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { logFood } from '../../services/entries';
import { useUi } from '../../state/ui';
import { renderApp } from '../../test/renderApp';

const today = () => toLocalDate(new Date());

async function oats() {
  return repos.foods.add({
    name: 'Овсяные хлопья',
    per100g: { kcal: 380, protein: 13, fat: 6.5, carbs: 67 },
    servings: [],
    source: 'base',
    verified: true,
  });
}

describe('Today', () => {
  it('adds a frequent food in 3 taps (FAB → food → Добавить)', async () => {
    useUi.setState({ date: today() });
    const f = await oats();
    // Eaten around this time yesterday → becomes "frequent now".
    await logFood(repos, f, 60, { date: addDays(today(), -1), time: toLocalTime(new Date()) });
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    let taps = 0;
    await user.click(await screen.findByRole('button', { name: ru.add.fab }));
    taps++;
    await user.click(await screen.findByRole('link', { name: /Овсяные хлопья/ }));
    taps++;
    await user.click(await screen.findByRole('button', { name: ru.portion.add }));
    taps++;
    expect(taps).toBe(3);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const list = await repos.entries.byDate(today());
    expect(list).toHaveLength(1);
    expect(list[0]!.items[0]!.grams).toBe(60);
  });

  it('stacks entries within 30 minutes and expands them', async () => {
    useUi.setState({ date: '2026-03-01' });
    const f = await oats();
    for (const time of ['08:00', '08:20', '08:45', '13:00'])
      await logFood(repos, f, 50, { date: '2026-03-01', time });
    const user = userEvent.setup();
    await renderApp('/');
    const stack = await screen.findByText('×3');
    expect(screen.getAllByRole('button', { name: ru.today.actions })).toHaveLength(1);
    await user.click(stack);
    expect(screen.getAllByRole('button', { name: ru.today.actions })).toHaveLength(4);
  });

  it('deletes from the menu with Undo', async () => {
    useUi.setState({ date: '2026-03-01' });
    const f = await oats();
    const e = await logFood(repos, f, 50, { date: '2026-03-01', time: '08:00' });
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: ru.today.actions }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: ru.common.delete }));
    await waitFor(async () => expect(await repos.entries.get(e.id)).toBeUndefined());
    await user.click(await screen.findByRole('button', { name: ru.common.undo }));
    await waitFor(async () => expect(await repos.entries.get(e.id)).toBeDefined());
  });

  it('changes time from the menu', async () => {
    useUi.setState({ date: '2026-03-01' });
    const e = await logFood(repos, await oats(), 50, { date: '2026-03-01', time: '08:00' });
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: ru.today.actions }));
    await user.click(screen.getByRole('button', { name: ru.today.changeTime }));
    fireEvent.change(screen.getByLabelText(ru.today.time), { target: { value: '09:30' } });
    await user.click(screen.getByRole('button', { name: ru.today.apply }));
    await waitFor(async () => expect((await repos.entries.get(e.id))?.time).toBe('09:30'));
  });

  it('tap on the empty line opens "add at time"', async () => {
    useUi.setState({ date: '2026-03-01' });
    const user = userEvent.setup();
    await renderApp('/');
    const gaps = await screen.findAllByRole('button', { name: /Добавить на/ });
    await user.click(gaps[0]!);
    expect(screen.getByRole('dialog', { name: /Добавить на \d\d:\d\d/ })).toBeVisible();
  });

  it('shows over-target neutrally and tracks water', async () => {
    useUi.setState({ date: '2026-03-01' });
    const f = await oats();
    await logFood(repos, f, 630, { date: '2026-03-01', time: '08:00' }); // 2394 kcal vs 2200
    const user = userEvent.setup();
    await renderApp('/');
    expect(await screen.findByText('+194')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '+250 мл' }));
    await waitFor(async () => expect((await repos.dayMeta.get('2026-03-01')).waterMl).toBe(250));
  });

  it('switches days with arrows', async () => {
    useUi.setState({ date: today() });
    const user = userEvent.setup();
    await renderApp('/');
    await screen.findByRole('heading', { name: ru.today.today });
    await user.click(screen.getByRole('button', { name: ru.today.prevDay }));
    expect(screen.getByRole('heading', { name: ru.today.yesterday })).toBeVisible();
  });
});

describe('add flows', () => {
  it('searches the catalog and logs a portion', async () => {
    useUi.setState({ date: '2026-03-01' });
    await oats();
    const user = userEvent.setup();
    await renderApp('/add/search?date=2026-03-01&time=07:30');
    await user.type(await screen.findByLabelText(ru.search.placeholder), 'jdcz'); // "овся" in EN layout
    await user.click(await screen.findByRole('link', { name: /Овсяные хлопья/ }));
    const grams = await screen.findByLabelText(ru.portion.grams);
    await user.clear(grams);
    await user.type(grams, '45,5');
    await user.click(screen.getByRole('button', { name: ru.portion.plus }));
    await user.click(screen.getByRole('button', { name: ru.portion.add }));
    await waitFor(async () => expect(await repos.entries.byDate('2026-03-01')).toHaveLength(1));
    const [e] = await repos.entries.byDate('2026-03-01');
    expect(e).toMatchObject({ time: '07:30' });
    expect(e!.items[0]!.grams).toBe(55.5);
  });

  it('quick kcal', async () => {
    useUi.setState({ date: '2026-03-01' });
    const user = userEvent.setup();
    await renderApp('/add/quick?date=2026-03-01&time=12:00');
    await user.type(await screen.findByLabelText(ru.quick.kcal), '450');
    await user.click(screen.getByRole('button', { name: ru.quick.save }));
    await waitFor(async () =>
      expect((await repos.entries.byDate('2026-03-01'))[0]?.totals.kcal).toBe(450),
    );
  });

  it('creates a food and logs it', async () => {
    const user = userEvent.setup();
    await renderApp('/foods/new?date=2026-03-01&time=10:00&log=1');
    await user.type(await screen.findByLabelText(ru.foods.name), 'Сырники');
    await user.type(screen.getByLabelText(ru.foods.protein), '15');
    await user.type(screen.getByLabelText(ru.foods.fat), '10');
    await user.type(screen.getByLabelText(ru.foods.carbs), '20');
    await user.click(screen.getByRole('button', { name: ru.foods.saveAndLog }));
    expect(await screen.findByRole('heading', { name: 'Сырники' })).toBeVisible();
    const [f] = (await repos.foods.list()).filter((x) => x.name === 'Сырники');
    expect(f).toMatchObject({ source: 'user', verified: true, per100g: { kcal: 230 } });
  });

  it('repeats yesterday and copies a whole day', async () => {
    useUi.setState({ date: '2026-03-02' });
    const f = await oats();
    await logFood(repos, f, 50, { date: '2026-03-01', time: '08:00' });
    await logFood(repos, f, 70, { date: '2026-03-01', time: '19:00' });
    const user = userEvent.setup();
    await renderApp('/add/repeat?date=2026-03-02&time=12:00');
    await user.click(await screen.findByRole('button', { name: ru.repeat.copyDay }));
    await waitFor(async () => expect(await repos.entries.byDate('2026-03-02')).toHaveLength(2));
  });
});

describe('Diary', () => {
  it('colors days by that day goal and opens a day', async () => {
    useUi.setState({ date: '2026-03-10' });
    const f = await oats();
    await logFood(repos, f, 570, { date: '2026-03-05', time: '08:00' }); // 2166 ≈ goal 2200
    const user = userEvent.setup();
    const { router } = await renderApp('/diary');
    const cell = await screen.findByRole('button', { name: '5 марта 2026' });
    await waitFor(() => expect(cell.className).toMatch(/close/));
    await user.click(cell);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(useUi.getState().date).toBe('2026-03-05');
  });
});
