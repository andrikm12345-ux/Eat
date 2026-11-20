import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_KEYS } from '../../ai/settings';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { loadCookHistory } from '../../services/cookHistory';
import { useCook } from '../../state/cook';
import { renderApp } from '../../test/renderApp';

afterEach(() => {
  vi.unstubAllGlobals();
  useCook.setState({ result: null, dish: null, steps: {} });
});

const t = ru.cook;
const n = (kcal: number, protein = 0, fat = 0, carbs = 0) => ({ kcal, protein, fat, carbs });

const IDEAS = {
  dishes: [
    {
      name: 'Омлет с помидорами',
      minutes: 15,
      difficulty: 'easy',
      portionGrams: 200,
      ingredients: [
        {
          name: 'Яйцо куриное',
          grams: 110,
          pieces: 2,
          pieceGrams: 55,
          per100g: n(143, 12.6, 9.5, 0.7),
        },
        { name: 'Помидоры', grams: 80, per100g: n(20, 0.9, 0.2, 3.9) },
        { name: 'Масло подсолнечное', grams: 5, per100g: n(899, 0, 99.9, 0) },
        { name: 'Соль', grams: 1, per100g: n(0) },
      ],
    },
    {
      name: 'Курица с рисом',
      minutes: 35,
      difficulty: 'easy',
      ingredients: [
        { name: 'Куриное филе', grams: 150, per100g: n(113, 23.6, 1.9, 0.4) },
        { name: 'Рис круглозёрный', grams: 70, per100g: n(340, 7, 1, 77) },
        { name: 'Морковь', grams: 40, per100g: n(35, 1.3, 0.1, 6.9) },
      ],
    },
    {
      name: 'Борщ',
      minutes: 90,
      difficulty: 'medium',
      ingredients: [
        { name: 'Говядина', grams: 150, per100g: n(187, 18.9, 12.4, 0) },
        { name: 'Свёкла', grams: 100, per100g: n(42, 1.5, 0.1, 8.8) },
        { name: 'Помидоры', grams: 30, per100g: n(20) },
      ],
    },
  ],
};
const STEPS = {
  steps: [
    { text: 'Взбейте яйца с солью.', minutes: 2 },
    {
      text: 'Обжарьте помидоры на масле, залейте яйцами и готовьте под крышкой до схватывания.',
      minutes: 6,
    },
  ],
  tip: 'Подавайте сразу.',
};

/** The AI: dishes for the pantry request, steps for a recipe request. */
function ai(ideas: unknown = IDEAS, verify: unknown = { fake: [] }) {
  const calls: string[] = [];
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { system?: string };
    const system = body.system ?? '';
    const kind = system.includes('по шагам')
      ? 'steps'
      : system.includes('редактор кулинарной книги')
        ? 'verify'
        : 'ideas';
    calls.push(kind);
    if (kind === 'verify' && verify === 'fail') return new Response('{}', { status: 400 });
    const obj = kind === 'steps' ? STEPS : kind === 'verify' ? verify : ideas;
    return new Response(
      JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify(obj) }],
        stop_reason: 'end_turn',
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

async function setup() {
  await repos.settings.set(AI_KEYS.enabled, true);
  await repos.settings.set(AI_KEYS.apiKey, 'sk-ant-xxxxxxxxxxxx');
  await repos.settings.set(AI_KEYS.consent, true);
}

describe('«Что приготовить»', () => {
  it('reads the pantry into chips; a chip can be removed', async () => {
    await setup();
    const user = userEvent.setup();
    await renderApp('/cook?date=2026-11-20&time=19:00');
    const field = await screen.findByRole('textbox', { name: t.pantryLabel });
    await user.type(field, 'курица 500 г, 4 яйца, лук');
    const chips = screen.getByRole('list', { name: t.pantryParsed });
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.replaceAll(' ', ' ')),
    ).toEqual(['курица · 500 г', 'яйца · 4 шт', 'лук']);
    await user.click(screen.getByRole('button', { name: t.removeItem('яйца') }));
    expect(field).toHaveValue('курица 500 г, лук');
  });

  it('shows the dishes that pass the check, opens the recipe, logs a serving and saves the recipe', async () => {
    await setup();
    const calls = ai();
    const user = userEvent.setup();
    await renderApp('/cook?date=2026-11-20&time=19:00');
    await user.type(
      await screen.findByRole('textbox', { name: t.pantryLabel }),
      'яйца 4 шт, помидоры, курица 500 г, рис, морковь',
    );
    await user.click(screen.getByRole('button', { name: t.go }));

    const list = await screen.findByRole('region', { name: t.resultsTitle });
    // Борщ needs beef (its base) that is not at home: it is not offered, and as only two dishes
    // passed, the AI was asked once more.
    await waitFor(() => expect(calls).toEqual(['ideas', 'verify', 'ideas', 'verify']));
    expect(within(list).queryByText('Борщ')).toBeNull();
    const omelet = within(list).getByRole('button', { name: /Омлет с помидорами/ });
    expect(omelet).toHaveTextContent(t.haveAll);
    expect(within(list).getByRole('button', { name: /Курица с рисом/ })).toHaveTextContent(
      t.haveAll,
    );

    await user.click(omelet);
    expect(await screen.findByRole('heading', { name: 'Омлет с помидорами' })).toBeVisible();
    expect(await screen.findByText(STEPS.steps[0]!.text)).toBeVisible();
    expect(screen.getByText(STEPS.tip)).toBeVisible();
    expect(calls.filter((c) => c === 'steps')).toHaveLength(1);
    // The search and the opened recipe are in the history (it goes to the cloud with the diary).
    await waitFor(async () => {
      const [h] = await loadCookHistory(repos);
      expect(h?.pantry).toBe('яйца 4 шт, помидоры, курица 500 г, рис, морковь');
      expect(h?.dishes.map((d) => d.name)).toContain('Омлет с помидорами');
      expect(h?.recipes.map((r) => r.name)).toEqual(['Омлет с помидорами']);
    });

    await user.click(screen.getByRole('button', { name: t.save }));
    await waitFor(async () => expect(await repos.recipes.list()).toHaveLength(1));
    const [recipe] = await repos.recipes.list();
    expect(recipe).toMatchObject({
      name: 'Омлет с помидорами',
      servingsCount: 1,
      cookedWeightG: 200,
    });
    expect(recipe!.steps).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: t.log }));
    expect(await screen.findByRole('heading', { name: ru.review.title })).toBeVisible();
    // Salt (0 kcal) is not logged; nothing is saved before "Сохранить".
    expect(screen.queryByText('Соль')).toBeNull();
    expect(screen.getByText('Яйцо куриное')).toBeVisible();
    expect(await repos.entries.byDate('2026-11-20')).toHaveLength(0);
  });

  it('servings change the amounts and show what is not enough', async () => {
    await setup();
    ai();
    const user = userEvent.setup();
    await renderApp('/cook?date=2026-11-20&time=19:00');
    await user.type(
      await screen.findByRole('textbox', { name: t.pantryLabel }),
      'яйца 2 шт, помидоры, курица 500 г, рис, морковь',
    );
    await user.click(screen.getByRole('button', { name: t.go }));
    const list = await screen.findByRole('region', { name: t.resultsTitle });
    await user.click(await within(list).findByRole('button', { name: /Омлет с помидорами/ }));
    await screen.findByText(STEPS.steps[0]!.text);
    expect(screen.getAllByText(t.status.have).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '+' }));
    // 2 servings need 4 eggs, there are 2.
    expect(
      await screen.findByText(`${t.status.short} · ${t.haveAmount(t.pieces('2'))}`),
    ).toBeVisible();
    expect(screen.getByText(`${t.pieces('4')} (220 г)`)).toBeVisible();
  });

  it('the form is remembered between visits', async () => {
    await setup();
    const user = userEvent.setup();
    const { unmount } = await renderApp('/cook');
    await user.type(await screen.findByRole('textbox', { name: t.pantryLabel }), 'творог, мука');
    await user.click(screen.getByRole('switch', { name: t.noBuy }));
    await new Promise((r) => setTimeout(r, 500));
    unmount();
    await renderApp('/cook');
    expect(await screen.findByRole('textbox', { name: t.pantryLabel })).toHaveValue('творог, мука');
    expect(screen.getByRole('switch', { name: t.noBuy })).toBeChecked();
  });

  it('is on the "+" sheet and in "Ещё"', async () => {
    const user = userEvent.setup();
    const more = await renderApp('/more');
    expect(await screen.findByRole('link', { name: ru.more.items.cook })).toHaveAttribute(
      'href',
      '/cook',
    );
    more.unmount();
    await renderApp('/');
    await user.click((await screen.findAllByRole('button', { name: ru.add.fab }))[0]!);
    expect(await screen.findByRole('button', { name: ru.add.tiles.cook })).toBeVisible();
  });

  it('a dish the editor calls made up is not shown; without the check all dishes stay', async () => {
    await setup();
    // "Курица с рисом" (the second of the three) is called made up.
    ai(IDEAS, { fake: [2] });
    const user = userEvent.setup();
    const first = await renderApp('/cook?date=2026-11-20&time=19:00');
    await user.type(
      await screen.findByRole('textbox', { name: t.pantryLabel }),
      'яйца 4 шт, помидоры, курица 500 г, рис, морковь',
    );
    await user.click(screen.getByRole('button', { name: t.go }));
    const list = await screen.findByRole('region', { name: t.resultsTitle });
    expect(within(list).getByRole('button', { name: /Омлет с помидорами/ })).toBeVisible();
    expect(within(list).queryByRole('button', { name: /Курица с рисом/ })).toBeNull();

    first.unmount();
    useCook.setState({ result: null, dish: null, steps: {} });
    ai(IDEAS, 'fail');
    await renderApp('/cook?date=2026-11-20&time=19:00', { seed: false });
    const field = await screen.findByRole('textbox', { name: t.pantryLabel });
    await user.clear(field);
    await user.type(field, 'яйца 4 шт, помидоры, курица 500 г, рис, морковь');
    await user.click(screen.getByRole('button', { name: t.go }));
    const again = await screen.findByRole('region', { name: t.resultsTitle });
    expect(within(again).getByRole('button', { name: /Курица с рисом/ })).toBeVisible();
  });

  it('"no real dish from this" is an answer, not an error; an old list does not stay under a new search', async () => {
    await setup();
    ai(IDEAS);
    const user = userEvent.setup();
    await renderApp('/cook?date=2026-11-20&time=19:00');
    await user.type(
      await screen.findByRole('textbox', { name: t.pantryLabel }),
      'яйца 4 шт, помидоры, курица 500 г, рис, морковь',
    );
    await user.click(screen.getByRole('button', { name: t.go }));
    expect(await screen.findByRole('region', { name: t.resultsTitle })).toBeVisible();

    // Now the AI says there is nothing real to cook (an empty list).
    ai({ dishes: [] });
    await user.click(screen.getByRole('button', { name: t.go }));
    expect(await screen.findByText(t.nothing)).toBeVisible();
    expect(screen.queryByText(ru.ai.error('ИИ вернул данные в неверном формате'))).toBeNull();
    expect(screen.queryByRole('button', { name: /Омлет с помидорами/ })).toBeNull();
  });

  it('the meal follows the time of day; a change by hand stays while the screen is open', async () => {
    await setup();
    const user = userEvent.setup();
    const first = await renderApp('/cook?date=2026-11-20&time=08:15');
    expect(await screen.findByRole('radio', { name: t.meals.breakfast })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: t.meals.snack }));
    expect(screen.getByRole('radio', { name: t.meals.snack })).toBeChecked();
    await new Promise((r) => setTimeout(r, 500));
    first.unmount();
    // Next visit in the evening: the saved "snack" does not stick, the time decides.
    await renderApp('/cook?date=2026-11-20&time=19:30', { seed: false });
    expect(await screen.findByRole('radio', { name: t.meals.dinner })).toBeChecked();
  });
});
