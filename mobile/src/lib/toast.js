// Same behaviour as the web toast: a short message at the bottom. Errors go to the log only.
const listeners = new Set();
export function toast(message) { listeners.forEach((fn) => fn(message)); }
export function onToast(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function logError(error) { console.warn(error); }
