/** Fields that bring up the on-screen keyboard (not checkboxes, sliders, buttons, files). */
const TEXTUAL =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]):not([type=color]), textarea, [contenteditable=""], [contenteditable="true"]';

const isTextual = (t: EventTarget | null): boolean => t instanceof Element && t.matches(TEXTUAL);

/**
 * Marks the page (`<html data-kbd="1">`) while a text field has the focus, i.e. the phone
 * keyboard is open. The styles then drop the bottom safe-area padding, so the tab bar sits
 * right on the keyboard with no empty strip. Nothing is hidden. Returns a stop function.
 */
export function startKeyboardWatcher(root: HTMLElement = document.documentElement): () => void {
  let timer = 0;
  const on = (e: FocusEvent) => {
    if (!isTextual(e.target)) return;
    window.clearTimeout(timer);
    root.dataset.kbd = '1';
  };
  const off = (e: FocusEvent) => {
    if (!isTextual(e.target)) return;
    // Moving from one field to the next must not flash the bar back.
    window.clearTimeout(timer);
    timer = window.setTimeout(() => delete root.dataset.kbd, 150);
  };
  document.addEventListener('focusin', on);
  document.addEventListener('focusout', off);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener('focusin', on);
    document.removeEventListener('focusout', off);
    delete root.dataset.kbd;
  };
}
