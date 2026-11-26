// One browser audio element shared by every route. It is never destroyed when the
// full-screen picker unmounts, so playback survives navigation and closing the picker.
let audioElement = null;
let audioContext = null;
let streamCandidates = [];
let streamIndex = 0;
let onTrackEnd = null;
let onPlaybackState = null;

function getAudio() {
  if (typeof Audio === 'undefined') return null;
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.preload = 'auto';
    audioElement.crossOrigin = 'anonymous';
    audioElement.addEventListener('ended', () => {
      onPlaybackState?.(false);
      onTrackEnd?.();
    });
    audioElement.addEventListener('error', () => {
      if (streamIndex + 1 < streamCandidates.length) {
        streamIndex += 1;
        startCandidate();
      } else {
        onPlaybackState?.(false);
      }
    });
  }
  return audioElement;
}

// Called synchronously from the tap/click handler before any network await. This resumes
// Web Audio on browsers that require an explicit user gesture before media can start.
export function unlockMusicAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    }
    getAudio();
  } catch {
    // HTMLAudioElement playback below remains available where Web Audio is unsupported.
  }
}

function startCandidate() {
  const audio = getAudio();
  const url = streamCandidates[streamIndex];
  if (!audio || !url) return Promise.reject(new Error('No playable stream URL'));
  audio.pause();
  audio.src = url;
  audio.load();
  try {
    await audio.play();
    onPlaybackState?.(true);
  } catch (error) {
    if (streamIndex + 1 < streamCandidates.length) {
      streamIndex += 1;
      return startCandidate();
    }
    throw error;
  }
}

export async function playMusicTrack(urls, callbacks = {}) {
  const candidates = [...new Set((Array.isArray(urls) ? urls : [urls]).filter((url) => typeof url === 'string' && url))];
  if (!candidates.length) throw new Error('No playable stream URL');
  streamCandidates = candidates;
  streamIndex = 0;
  onTrackEnd = callbacks.onEnded || null;
  onPlaybackState = callbacks.onPlayingChange || null;
  unlockMusicAudio();
  return startCandidate();
}

export function pauseMusic() {
  const audio = getAudio();
  if (audio) audio.pause();
  onPlaybackState?.(false);
}

export function resumeMusic() {
  const audio = getAudio();
  if (!audio || !audio.src) return Promise.resolve(false);
  unlockMusicAudio();
  return audio.play().then(() => {
    onPlaybackState?.(true);
    return true;
  });
}

export function currentMusicElement() {
  return getAudio();
}
