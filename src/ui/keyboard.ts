/** Fields that bring up the on-screen keyboard (not checkboxes, sliders, buttons, files). */
const TEXTUAL =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]):not([type=color]), textarea, [contenteditable=""], [contenteditable="true"]';

const isTextual = (el: Element | null): boolean => !!el && el.matches(TEXTUAL);

/**
 * Marks the page (`<html data-kbd="1">`) while a text field has the focus, i.e. the phone
 * keyboard is open. The styles then drop the bottom safe-area padding, so the tab bar sits
 * right on the keyboard with no empty strip. Nothing is hidden.
 *
 * The mark always follows the element that really has the focus (not the focus events), and
 * is re-checked on resume and once a second, so it can never stay behind when a field
 * disappears while focused (the tab bar would then sit on the home indicator).
 * Returns a stop function.
 */
export function startKeyboardWatcher(root: HTMLElement = document.documentElement): () => void {
  const sync = () => {
    if (isTextual(document.activeElement)) root.dataset.kbd = '1';
    else delete root.dataset.kbd;
  };
  let timer = 0;
  // Moving from one field to the next passes through "no focus": look again a moment later.
  const soon = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(sync, 150);
  };
  const resume = () => {
    if (document.visibilityState === 'visible') sync();
  };
  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', soon);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', sync);
  window.addEventListener('resize', soon);
  const poll = window.setInterval(sync, 1000);
  sync();
  return () => {
    window.clearTimeout(timer);
    window.clearInterval(poll);
    document.removeEventListener('focusin', sync);
    document.removeEventListener('focusout', soon);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('pageshow', sync);
    window.removeEventListener('resize', soon);
    delete root.dataset.kbd;
  };
}
