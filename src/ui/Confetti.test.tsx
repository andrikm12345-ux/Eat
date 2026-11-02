import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCelebrate } from '../state/celebrate';
import { Confetti } from './Confetti';

describe('Confetti', () => {
  it('leaves no canvas on the screen while idle (an idle canvas can show up as a black rectangle on iOS)', () => {
    render(<Confetti />);
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('shows a full-screen canvas while playing and removes it afterwards', () => {
    vi.useFakeTimers();
    const ctx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    const get = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    document.documentElement.style.setProperty('--green-600', '#1f7266');
    let frame = 0;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frame += 1;
      return window.setTimeout(() => cb(frame * 16), 0) as unknown as number;
    });
    render(<Confetti />);
    act(() => useCelebrate.getState().fire());
    const canvas = document.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.style.width).toBe('100vw');
    act(() => void vi.advanceTimersByTime(5000));
    expect(document.querySelector('canvas')).toBeNull();
    expect(ctx.fillRect).toHaveBeenCalled();
    get.mockRestore();
    raf.mockRestore();
    vi.useRealTimers();
  });

  it('does not appear when the browser has no 2D canvas', () => {
    const get = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<Confetti />);
    act(() => useCelebrate.getState().fire());
    expect(document.querySelector('canvas')).toBeNull();
    get.mockRestore();
  });
});
