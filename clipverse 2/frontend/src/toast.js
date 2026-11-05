export function toast(message) {
  window.dispatchEvent(new CustomEvent('cv-toast', { detail: message }));
}
