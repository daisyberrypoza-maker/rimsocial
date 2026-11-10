// Single keyboard/viewport controller shared by every screen.
// Keeps the app shell and its keyboard-specific layout rules on the same viewport height.
const FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const KEYBOARD_THRESHOLD = 100;

export function startKeyboardAvoidance() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const root = document.documentElement;
  const viewport = window.visualViewport;
  let focusTimer = null;

  function updateViewport() {
    const height = Math.max(0, viewport?.height || window.innerHeight);
    const offsetTop = viewport?.offsetTop || 0;
    const keyboardInset = Math.max(0, window.innerHeight - height - offsetTop);
    const heightValue = `${Math.round(height)}px`;

    // Both names are retained because existing layout rules consume both variables.
    root.style.setProperty('--app-vh', heightValue);
    root.style.setProperty('--app-viewport-height', heightValue);
    root.style.setProperty('--keyboard-inset', `${Math.round(keyboardInset)}px`);
    root.classList.toggle('keyboard-open', keyboardInset > KEYBOARD_THRESHOLD);
  }

  function keepFocusedFieldVisible(event) {
    const field = event.target;
    if (!(field instanceof HTMLElement) || !field.matches(FIELD_SELECTOR)) return;

    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      updateViewport();
      if (!field.isConnected || document.activeElement !== field) return;
      // Nearest avoids unnecessarily moving the whole screen or pushing fixed headers away.
      field.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }, 220);
  }

  updateViewport();
  viewport?.addEventListener('resize', updateViewport);
  viewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
  document.addEventListener('focusin', keepFocusedFieldVisible);

  return () => {
    window.clearTimeout(focusTimer);
    viewport?.removeEventListener('resize', updateViewport);
    viewport?.removeEventListener('scroll', updateViewport);
    window.removeEventListener('resize', updateViewport);
    document.removeEventListener('focusin', keepFocusedFieldVisible);
    root.classList.remove('keyboard-open');
    root.style.removeProperty('--app-vh');
    root.style.removeProperty('--app-viewport-height');
    root.style.removeProperty('--keyboard-inset');
  };
}
