import React from 'react';
import Video from 'react-native-video';
import { useAppStore } from '../store';

// Mounted once above navigation so audio survives MusicPicker unmounts and route changes.
export default function GlobalMusicPlayer() {
  const music = useAppStore((s) => s.music);
  const setMusic = useAppStore((s) => s.setMusic);
  if (!music?.playbackUri) return null;
  return (
    <Video
      source={{ uri: music.playbackUri }}
      audioOnly
      paused={!music.playing}
      playInBackground
      playWhenInactive
      ignoreSilentSwitch="ignore"
      onEnd={() => setMusic({ playing: false })}
      onError={() => setMusic({ playing: false, playbackUri: null })}
      style={{ width: 0, height: 0 }}
    />
  );
}
