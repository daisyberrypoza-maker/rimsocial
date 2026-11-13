import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import StoryAudioControls from '../components/StoryAudioControls.jsx';
import { goBack } from '../lib/goBack.js';
import { STORY_BACKGROUNDS, backgroundCss } from '../lib/storyBackgrounds.js';
import { useAppStore } from '../store.js';
import { toast, logError } from '../toast.js';
import './StoryComposer.css';

// Text story: type on a background, add a music track and/or a voice note, then share.
export default function StoryComposer() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [bgKey, setBgKey] = useState(STORY_BACKGROUNDS[0].key);
  const [track, setTrack] = useState(null);
  const [voice, setVoice] = useState(null);
  const [posting, setPosting] = useState(false);

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
          <StoryAudioControls track={track} onTrack={setTrack} voice={voice} onVoice={setVoice} disabled={posting} />
          <button type="button" className="sc-share" aria-label={posting ? 'Posting story' : 'Share story'} onClick={share} disabled={!canShare}>
            {posting ? <span className="sc-spin" role="status" aria-label="Posting story" /> : <Icon name="send" size={22} />}
          </button>
        </div>
      </div>
    </main>
  );
}
