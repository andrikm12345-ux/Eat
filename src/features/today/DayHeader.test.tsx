import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../domain/dates';
import { ru } from '../../i18n/ru';
import { useUi } from '../../state/ui';
import { renderApp } from '../../test/renderApp';

const today = toLocalDate(new Date());

function swipe(el: Element, dx: number, dy = 0) {
  fireEvent.pointerDown(el, { clientX: 200, clientY: 100 });
  fireEvent.pointerMove(el, { clientX: 200 + dx / 2, clientY: 100 + dy / 2 });
  fireEvent.pointerUp(el, { clientX: 200 + dx, clientY: 100 + dy });
}

beforeEach(() => useUi.getState().setDate(today));

/** The strip re-renders once the week has loaded: wait for its 7 days and take the fresh node. */
async function loadedWeek() {
  const name = ru.today.weekLabel;
  await waitFor(() =>
    expect(screen.getByRole('group', { name }).querySelectorAll('button')).toHaveLength(7),
  );
  return screen.getByRole('group', { name });
}

describe('day header swipes', () => {
  it('swiping the week strip moves by whole weeks', async () => {
    await renderApp('/');
    const week = await screen.findByRole('group', { name: ru.today.weekLabel });
    swipe(week, 120);
    await waitFor(() => expect(useUi.getState().date).toBe(addDays(today, -7)));
    swipe(screen.getByRole('group', { name: ru.today.weekLabel }), -120);
    await waitFor(() => expect(useUi.getState().date).toBe(today));
  });

  it('swiping the title moves by one day', async () => {
    await renderApp('/');
    const title = await screen.findByRole('heading', { level: 1 });
    swipe(title.parentElement as Element, -120);
    await waitFor(() => expect(useUi.getState().date).toBe(addDays(today, 1)));
  });

  it('short or vertical moves and cancelled gestures do nothing; taps still pick a day', async () => {
    await renderApp('/');
    const week = await loadedWeek();
    swipe(week, 30);
    swipe(week, 80, 200);
    fireEvent.pointerDown(week, { clientX: 200, clientY: 100 });
    fireEvent.pointerCancel(week);
    fireEvent.pointerUp(week, { clientX: 400, clientY: 100 });
    fireEvent.pointerMove(week, { clientX: 300, clientY: 100 });
    expect(useUi.getState().date).toBe(today);
    const buttons = week.querySelectorAll('button');
    const other = Array.from(buttons).find((b) => b.getAttribute('aria-pressed') === 'false')!;
    fireEvent.click(other);
    await waitFor(() => expect(useUi.getState().date).not.toBe(today));
  });

  it('the click that ends a swipe does not select a day', async () => {
    await renderApp('/');
    const week = await loadedWeek();
    const first = week.querySelector('button')!;
    swipe(first, -120);
    fireEvent.click(first);
    await waitFor(() => expect(useUi.getState().date).toBe(addDays(today, 7)));
  });
});
