// Back takes the user to the screen they came from. When there is no history (for example a link
// opened directly), it goes to the fallback screen instead of leaving the app.
export function goBack(navigate, fallback = '/') {
  const idx = window.history.state?.idx;
  const hasHistory = typeof idx === 'number' ? idx > 0 : window.history.length > 1;
  if (hasHistory) navigate(-1);
  else navigate(fallback);
}
