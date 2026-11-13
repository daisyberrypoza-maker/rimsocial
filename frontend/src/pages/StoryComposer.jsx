import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { goBack } from '../lib/goBack.js';
import { STORY_BACKGROUNDS, backgroundCss } from '../lib/storyBackgrounds.js';
import { useAppStore } from '../store.js';
import { toast, logError } from '../toast.js';
import './StoryComposer.css';

const MAX_VOICE_SECONDS = 60;

// Text story: type on a background, add a music track and/or a voice note, then share.
export default function StoryComposer() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [bgKey, setBgKey] = useState(STORY_BACKGROUNDS[0].key);
  const [track, setTrack] = useState(null);
  const [voice, setVoice] = useState(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [musicOpen, setMusicOpen] = useState(false);
  const [musicQuery, setMusicQuery] = useState('');
  const [musicItems, setMusicItems] = useState([]);
  const [posting, setPosting] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startedRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  // Music library: the newest tracks first, filtered by what is typed
  useEffect(() => {
    if (!musicOpen) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      api(`/v1/audio/search?q=${encodeURIComponent(musicQuery.trim())}`)
        .then((data) => { if (active) setMusicItems(data.items || []); })
        .catch((error) => { if (active) logError(error); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [musicOpen, musicQuery]);

  function stopVoice() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  // Press and hold to record. Release to stop. Stops by itself at the limit.
  async function startVoice() {
    if (recording || posting) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        clearInterval(timerRef.current);
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const elapsed = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        const ext = type.includes('mp4') ? 'm4a' : 'webm';
        setVoice({ file: new File([blob], `voice.${ext}`, { type }), seconds: Math.min(elapsed, MAX_VOICE_SECONDS) });
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

  async function share() {
    if (posting || (!text.trim() && !voice)) return;
    setPosting(true);
    try {
      const form = new FormData();
      form.append('text', text.trim());
      form.append('background', bgKey);
      if (track) form.append('musicId', track.id);
      if (voice) form.append('voice', voice.file);
      await api('/v1/stories/composed', { method: 'POST', body: form });
      api('/v1/stories/rail').then((rail) => useAppStore.getState().setStoryRail(rail.items || [])).catch(() => {});
      toast('Story posted. It disappears in 24 hours.');
      navigate('/stories', { replace: true });
    } catch (error) {
      logError(error);
      toast(`Story not posted: ${error?.message || 'try again'}`);
      setPosting(false);
    }
  }

  const canShare = Boolean(text.trim() || voice) && !posting;

  return (
    <main className="sc-page" style={{ background: backgroundCss(bgKey) }}>
      <header className="sc-top">
        <button type="button" className="sc-round" aria-label="Close" onClick={() => goBack(navigate)}><Icon name="x" size={24} /></button>
        <button type="button" className="sc-chip" aria-label="Add music" onClick={() => setMusicOpen(true)}>
          <Icon name="music" size={18} /> {track ? track.title : 'Music'}
        </button>
      </header>

      <div className="sc-body">
        <textarea
          className="sc-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={200}
          placeholder="Type a status"
          aria-label="Story text"
          disabled={posting}
        />
      </div>

      <div className="sc-bottom">
        <div className="sc-swatches" role="radiogroup" aria-label="Background">
          {STORY_BACKGROUNDS.map((bg) => (
            <button
              key={bg.key}
              type="button"
              role="radio"
              aria-checked={bgKey === bg.key}
              aria-label={bg.label}
              className={bgKey === bg.key ? 'sc-swatch on' : 'sc-swatch'}
              style={{ background: bg.css }}
              onClick={() => setBgKey(bg.key)}
            />
          ))}
        </div>

        <div className="sc-row">
          <button
            type="button"
            className={recording ? 'sc-voice recording' : 'sc-voice'}
            aria-label="Hold to record a voice note"
            onPointerDown={startVoice}
            onPointerUp={stopVoice}
            onPointerLeave={stopVoice}
            onPointerCancel={stopVoice}
            disabled={posting}
          >
            <Icon name="mic" size={20} />
            <span>{recording ? `${seconds}s` : voice ? `Voice ${voice.seconds}s` : 'Hold to record'}</span>
            {voice && !recording && <i role="button" aria-label="Remove voice note" onPointerDown={(event) => { event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setVoice(null); }}><Icon name="x" size={14} /></i>}
          </button>
          <button type="button" className="sc-share" aria-label={posting ? 'Posting story' : 'Share story'} onClick={share} disabled={!canShare}>
            {posting ? <span className="sc-spin" role="status" aria-label="Posting story" /> : <Icon name="send" size={22} />}
          </button>
        </div>
      </div>

      {musicOpen && (
        <div className="sc-sheet-backdrop" onClick={() => setMusicOpen(false)}>
          <section className="sc-sheet" role="dialog" aria-label="Choose music" onClick={(event) => event.stopPropagation()}>
            <input value={musicQuery} onChange={(event) => setMusicQuery(event.target.value)} placeholder="Search music" aria-label="Search music" />
            {track && <button type="button" className="sc-sheet-row" onClick={() => { setTrack(null); setMusicOpen(false); }}>No music</button>}
            {musicItems.length === 0 && <p className="sc-empty">No music found.</p>}
            {musicItems.map((item) => (
              <button key={item.id} type="button" className={track?.id === item.id ? 'sc-sheet-row on' : 'sc-sheet-row'} onClick={() => { setTrack(item); setMusicOpen(false); }}>
                <span>{item.title}</span><small>{item.artist}</small>
              </button>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
