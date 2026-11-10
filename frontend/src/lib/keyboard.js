// Keyboard avoidance for every screen.
// 1. The app shell is sized to the visible area above the on-screen keyboard (--app-vh),
//    so the bottom of the page is never hidden behind the keyboard.
// 2. When an input, textarea or select gains focus, it is scrolled into the middle of its
//    scroll container once the keyboard has finished opening.
// 3. The page itself is never pushed off-screen by the keyboard.

const FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

export function startKeyboardAvoidance() {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const vv = window.visualViewport;

  function setShellHeight() {
    const height = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--app-vh', `${Math.round(height)}px`);
  }

  function resetPageOffset() {
    // The keyboard can scroll the layout viewport; the app manages its own scrolling, so keep it at the top.
    if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
  }

  function onViewportChange() {
    setShellHeight();
    resetPageOffset();
  }

  setShellHeight();
  if (vv) {
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);
  } else {
    window.addEventListener('resize', onViewportChange);
  }

  document.addEventListener('focusin', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement) || !field.matches(FIELD_SELECTOR)) return;
    // Wait for the keyboard animation to finish, then bring the field into view.
    window.setTimeout(() => {
      setShellHeight();
      field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }, 300);
  });
}
