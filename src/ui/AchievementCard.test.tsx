import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLeaving } from '../features/today/useLeaving';
import { useCelebrate } from '../state/celebrate';
import { AchievementCard } from './AchievementCard';
import { buzz } from './haptics';

describe('AchievementCard', () => {
  it('показывает карточку и скрывается по нажатию', () => {
    render(<AchievementCard />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => useCelebrate.getState().showCard('Первая запись'));
    expect(screen.getByText('Первая запись')).toBeTruthy();
    fireEvent.click(screen.getByRole('status'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('buzz', () => {
  it('не падает без поддержки вибрации и вызывает её при наличии', () => {
    expect(() => buzz()).not.toThrow();
    const v = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: v, configurable: true });
    buzz([1, 2]);
    expect(v).toHaveBeenCalledWith([1, 2]);
  });
});

describe('useLeaving', () => {
  it('удалённая запись остаётся на время схлопывания, новая помечается', () => {
    vi.useFakeTimers();
    const a = { id: 'a', time: '08:00' };
    const b = { id: 'b', time: '09:00' };
    const { result, rerender } = renderHook(({ items }) => useLeaving(items), {
      initialProps: { items: [a] },
    });
    expect(result.current.isFresh('a')).toBe(false);
    rerender({ items: [a, b] });
    expect(result.current.isFresh('b')).toBe(true);
    rerender({ items: [b] });
    expect(result.current.leaving.has('a')).toBe(true);
    expect(result.current.list.map((i) => i.id)).toEqual(['a', 'b']);
    act(() => void vi.advanceTimersByTime(400));
    expect(result.current.list.map((i) => i.id)).toEqual(['b']);
    vi.useRealTimers();
  });
});
