import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import MusicPicker from './MusicPicker.jsx';
import { toast, logError } from '../toast.js';
import '../pages/StoryComposer.css';

export const MAX_VOICE_SECONDS = 60;

// Music and voice-note controls for every kind of story (text, photo, video).
// track: { id, title, artist } or null. voice: { file, seconds } or null.
export default function StoryAudioControls({ track, onTrack, voice, onVoice, disabled = false, compact = false }) {
  const [musicOpen, setMusicOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startedRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  function stopVoice() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  // Press and hold to record. Release to stop. Stops by itself at the limit.
  async function startVoice() {
    if (recording || disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((item) => item.stop());
        clearInterval(timerRef.current);
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const elapsed = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        const ext = type.includes('mp4') ? 'm4a' : 'webm';
        onVoice({ file: new File([blob], `voice.${ext}`, { type }), seconds: Math.min(elapsed, MAX_VOICE_SECONDS) });
      };
      recorder.start();
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedRef.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_VOICE_SECONDS) stopVoice();
      }, 250);
    } catch (error) {
      logError(error);
      toast('Allow microphone access to record a voice note');
    }
  }

  const MUSIC_SHEET = (
    <MusicPicker
      selectedId={track?.id || null}
      onSelect={(item) => { onTrack({ id: item.id, title: item.title, artist: item.artist }); setMusicOpen(false); }}
      onClose={() => setMusicOpen(false)}
    />
  );

  if (compact) {
    return (
      <>
        <div className="sa-round-row">
          <button type="button" className="sa-round" aria-label={track ? `Music: ${track.title}` : 'Add music'} disabled={disabled} onClick={() => setMusicOpen(true)}>
            <Icon name="music" size={22} />
            {track && <span className="sa-dot" aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={recording ? 'sa-round sa-voice recording' : voice ? 'sa-round sa-voice' : 'sa-round'}
            aria-label={voice ? `Voice note ${voice.seconds} seconds. Hold to replace` : 'Hold to record a voice note'}
            disabled={disabled}
            onPointerDown={startVoice}
            onPointerUp={stopVoice}
            onPointerLeave={stopVoice}
            onPointerCancel={stopVoice}
          >
            {recording ? <span className="sa-timer">{seconds}s</span> : <Icon name="mic" size={22} />}
            {voice && !recording && <span className="sa-dot" aria-hidden="true" />}
          </button>
        </div>
        {musicOpen && MUSIC_SHEET}
      </>
    );
  }

  return (
    <>
      <div className="sa-row">
        <button type="button" className="sa-chip" aria-label="Add music" disabled={disabled} onClick={() => setMusicOpen(true)}>
          <Icon name="music" size={18} />
          <span>{track ? track.title : 'Music'}</span>
          {track && <i role="button" aria-label="Remove music" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onTrack(null); }}><Icon name="x" size={14} /></i>}
        </button>
        <button
          type="button"
          className={recording ? 'sa-chip sa-voice recording' : 'sa-chip sa-voice'}
          aria-label="Hold to record a voice note"
          disabled={disabled}
          onPointerDown={startVoice}
          onPointerUp={stopVoice}
          onPointerLeave={stopVoice}
          onPointerCancel={stopVoice}
        >
          <Icon name="mic" size={18} />
          <span>{recording ? `${seconds}s` : voice ? `Voice ${voice.seconds}s` : 'Hold to record'}</span>
          {voice && !recording && <i role="button" aria-label="Remove voice note" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onVoice(null); }}><Icon name="x" size={14} /></i>}
        </button>
      </div>

      {musicOpen && MUSIC_SHEET}
    </>
  );
}
