// Use React Router's history index as the source of truth. window.history.length
// includes entries outside the app (for example the page that opened a deep link),
// so it must never decide whether an in-app Back action is available.
export function goBack(navigate, fallback = '/') {
  if (typeof navigate !== 'function') throw new TypeError('goBack requires a navigate function');
  const idx = window.history.state?.idx;
  if (typeof idx === 'number' && idx > 0) {
    navigate(-1);
    return;
  }
  navigate(fallback, { replace: true });
}
