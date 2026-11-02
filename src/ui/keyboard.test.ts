import { afterEach, describe, expect, it, vi } from 'vitest';
import { startKeyboardWatcher } from './keyboard';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.kbd;
});

const kbd = () => document.documentElement.dataset.kbd;
const get = (id: string) => document.getElementById(id) as HTMLElement;

describe('keyboard watcher', () => {
  it('marks the page while a text field is focused and clears it shortly after', () => {
    vi.useFakeTimers();
    const stop = startKeyboardWatcher();
    document.body.innerHTML = '<input id="a" />';
    get('a').focus();
    expect(kbd()).toBe('1');
    get('a').blur();
    vi.advanceTimersByTime(200);
    expect(kbd()).toBeUndefined();
    stop();
  });

  it('moving to another field keeps the mark; checkboxes and buttons do not set it', () => {
    vi.useFakeTimers();
    const stop = startKeyboardWatcher();
    document.body.innerHTML =
      '<input id="a" /><textarea id="b"></textarea><input id="c" type="checkbox" /><button id="d">x</button>';
    get('a').focus();
    get('b').focus();
    vi.advanceTimersByTime(500);
    expect(kbd()).toBe('1');
    get('c').focus();
    vi.advanceTimersByTime(500);
    expect(kbd()).toBeUndefined();
    get('d').focus();
    expect(kbd()).toBeUndefined();
    stop();
  });

  it('never stays behind: a focused field that disappears (screen changed) clears the mark', () => {
    vi.useFakeTimers();
    const stop = startKeyboardWatcher();
    document.body.innerHTML = '<input id="a" />';
    get('a').focus();
    expect(kbd()).toBe('1');
    // The screen is replaced while the field has the focus: no blur event is sent.
    document.body.innerHTML = '<p>new screen</p>';
    vi.advanceTimersByTime(1100);
    expect(kbd()).toBeUndefined();
    stop();
  });

  it('is checked again on resume from the background', () => {
    vi.useFakeTimers();
    const stop = startKeyboardWatcher();
    document.documentElement.dataset.kbd = '1'; // left over
    document.dispatchEvent(new Event('visibilitychange'));
    expect(kbd()).toBeUndefined();
    stop();
  });

  it('stopping removes the mark and the listeners', () => {
    vi.useFakeTimers();
    const stop = startKeyboardWatcher();
    document.body.innerHTML = '<input id="a" />';
    get('a').focus();
    stop();
    expect(kbd()).toBeUndefined();
    get('a').blur();
    get('a').focus();
    expect(kbd()).toBeUndefined();
  });
});
