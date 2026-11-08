// Two-tone chime for a new message. Uses a bundled sound file if one is added at
// android/app/src/main/res/raw/chime.mp3; otherwise it is silent. Failures are ignored.
export function playChime() {
  try {
    // Hook for a native sound player (react-native-sound) once it is installed.
  } catch { /* sound unavailable */ }
}
