import React from 'react';
import Video from 'react-native-video';
import { useAppStore } from '../store';
import { logError, toast } from '../lib/toast';

// Mounted beside NavigationContainer for the lifetime of the native app. The player is
// intentionally independent of MusicPicker so closing or navigating away never stops audio.
export default function GlobalMusicPlayer() {
  const music = useAppStore((state) => state.music);
  const setMusic = useAppStore((state) => state.setMusic);
  const uri = music?.playbackUrls?.[music?.playbackIndex || 0];

  if (!uri) return null;

  function tryNext(error) {
    logError(error);
    const nextIndex = (music.playbackIndex || 0) + 1;
    if (nextIndex < (music.playbackUrls || []).length) {
      setMusic({ playbackIndex: nextIndex, playing: true });
    } else {
      setMusic({ playing: false });
      toast('This sound could not be played');
    }
  }

  return (
    <Video
      source={{ uri }}
      audioOnly
      paused={!music.playing}
      playInBackground
      playWhenInactive
      ignoreSilentSwitch="ignore"
      onError={tryNext}
      onEnd={() => setMusic({ playing: false })}
      onAudioFocusChanged={({ hasAudioFocus }) => {
        if (!hasAudioFocus) setMusic({ playing: false });
      }}
      style={{ width: 0, height: 0 }}
    />
  );
}
