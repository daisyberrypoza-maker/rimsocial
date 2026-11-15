// Asks the person to confirm an action in the app's own dialog (never the browser's alert/confirm).
// Resolves true when confirmed, false when cancelled or dismissed.
export function confirmDialog(message, { title = 'Are you sure?', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = null } = {}) {
  const isDanger = danger ?? /delete|block|remove|leave|clear|unfollow/i.test(message);
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent('cv-confirm', { detail: { title, message, confirmLabel, cancelLabel, danger: isDanger, resolve } }));
  });
}
