// Shared HTMLAudioElement: it is intentionally module-scoped so route/screen unmounts do not stop music.
let audio = null;
export function sharedMusicAudio() {
  if (typeof Audio === 'undefined') return null;
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => window.dispatchEvent(new CustomEvent('rimsocial:music-ended')));
  }
  return audio;
}
