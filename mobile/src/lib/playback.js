// Only one video plays at a time. Each video registers a stop function; starting one stops the rest.
// Leaving a screen or minimising the app stops everything at once (see App.js and the screens).
const players = new Map();
let activeId = null;

export function registerPlayer(id, stop) {
  players.set(id, stop);
  return () => { players.delete(id); if (activeId === id) activeId = null; };
}

export function claimPlayback(id) {
  if (activeId && activeId !== id) players.get(activeId)?.();
  activeId = id;
}

export function stopAllPlayback() {
  players.forEach((stop) => stop());
  activeId = null;
}
