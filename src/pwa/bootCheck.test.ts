import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const code = readFileSync(join(process.cwd(), 'public/boot-check.js'), 'utf8');
const run = () => new Function(code)();

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('boot watchdog (the white screen)', () => {
  it('stays silent when the app has drawn something', () => {
    run();
    document.getElementById('root')!.innerHTML = '<div>app</div>';
    vi.advanceTimersByTime(20_000);
    expect(document.getElementById('boot-fix-box')).toBeNull();
  });

  it('offers a way out when nothing is drawn after the wait', () => {
    run();
    vi.advanceTimersByTime(7_000);
    expect(document.getElementById('boot-fix-box')).toBeNull();
    vi.advanceTimersByTime(2_000);
    const box = document.getElementById('boot-fix-box');
    expect(box).not.toBeNull();
    expect(box?.textContent).toContain('Обновить приложение');
    expect(box?.textContent).toContain('не удаляются');
  });

  it('the button unregisters workers, clears caches and reloads, never touching the data', async () => {
    const unregister = vi.fn(async () => true);
    const del = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: async () => ['a', 'b'], delete: del });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: async () => [{ unregister }, { unregister }] },
    });
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });
    run();
    vi.advanceTimersByTime(9_000);
    (document.getElementById('boot-fix-button') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(10);
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalled();
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('goes away by itself when the app finally appears on a slow network', () => {
    run();
    vi.advanceTimersByTime(9_000);
    expect(document.getElementById('boot-fix-box')).not.toBeNull();
    document.getElementById('root')!.innerHTML = '<div>app</div>';
    vi.advanceTimersByTime(1_000);
    expect(document.getElementById('boot-fix-box')).toBeNull();
  });

  it('shows only once', () => {
    run();
    run();
    vi.advanceTimersByTime(20_000);
    expect(document.querySelectorAll('#boot-fix-box')).toHaveLength(1);
  });
});
