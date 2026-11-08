export function toast(message) {
  window.dispatchEvent(new CustomEvent('cv-toast', { detail: message }));
}

// Errors are never shown on screen: they go to the console so the app stays quiet
export function logError(error) {
  console.warn(error);
}
