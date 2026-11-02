import { afterEach, describe, expect, it, vi } from 'vitest';
import { startKeyboardWatcher } from './keyboard';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const field = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
};

describe('keyboard watcher', () => {
  it('marks the page while a text field is focused and clears it shortly after', () => {
    vi.useFakeTimers();
    const stop = startKeyboardWatcher();
    const input = field('<input id="a" />') as HTMLInputElement;
    input.focus();
    expect(document.documentElement.dataset.kbd).toBe('1');
    input.blur();
    expect(document.documentElement.dataset.kbd).toBe('1');
    vi.advanceTimersByTime(200);
    expect(document.documentElement.dataset.kbd).toBeUndefined();
    stop();
  });

  it('moving to another field keeps the mark; checkboxes and buttons do not set it', () => {
    vi.useFakeTimers();
    const stop = startKeyboardWatcher();
    document.body.innerHTML =
      '<input id="a" /><textarea id="b"></textarea><input id="c" type="checkbox" /><button id="d">x</button>';
    const get = (id: string) => document.getElementById(id) as HTMLElement;
    const a = get('a');
    const b = get('b');
    const c = get('c');
    const d = get('d');
    a.focus();
    b.focus();
    vi.advanceTimersByTime(500);
    expect(document.documentElement.dataset.kbd).toBe('1');
    c.focus();
    vi.advanceTimersByTime(500);
    expect(document.documentElement.dataset.kbd).toBeUndefined();
    d.focus();
    expect(document.documentElement.dataset.kbd).toBeUndefined();
    stop();
  });

  it('stopping removes the mark and the listeners', () => {
    vi.useFakeTimers();
    const stop = startKeyboardWatcher();
    const input = field('<input />') as HTMLInputElement;
    input.focus();
    stop();
    expect(document.documentElement.dataset.kbd).toBeUndefined();
    input.blur();
    input.focus();
    expect(document.documentElement.dataset.kbd).toBeUndefined();
  });
});
