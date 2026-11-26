import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import StoryAudioControls from '../components/StoryAudioControls.jsx';
import { goBack } from '../lib/goBack.js';
import { STORY_BACKGROUNDS, backgroundCss } from '../lib/storyBackgrounds.js';
import { refreshMyThumb } from '../lib/myThumb.js';
import { useAppStore } from '../store.js';
import { toast, logError } from '../toast.js';
import { appendStoryMusic } from '../lib/storyMusic.js';
import './StoryComposer.css';

// Text story: type on a background, add a music track and/or a voice note, then share.
export default function StoryComposer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const isPost = pathname.startsWith('/post/text');
  const [text, setText] = useState('');
  const [bgKey, setBgKey] = useState(STORY_BACKGROUNDS[0].key);
  const [track, setTrack] = useState(() => location.state?.storyTrack || null);
  const [voice, setVoice] = useState(null);
  const [posting, setPosting] = useState(false);
  const me = useAppStore((st) => st.user);

  // The circle cycles through the backgrounds, like the editor reference
  function cycleBackground() {
    const index = STORY_BACKGROUNDS.findIndex((bg) => bg.key === bgKey);
    setBgKey(STORY_BACKGROUNDS[(index + 1) % STORY_BACKGROUNDS.length].key);
  }

  async function share() {
    if (posting || (!text.trim() && !voice && !track)) return;
    setPosting(true);
    if (isPost) {
      try {
        await api('/v1/posts/text', { method: 'POST', body: { text: text.trim(), background: bgKey, visibility: 'public', ...(track?.source === 'audius' ? { audiusTrackId: track.id } : track?.id ? { musicId: track.id } : {}) } });
        refreshMyThumb();
        toast('Post published');
        navigate('/', { replace: true });
      } catch (error) {
        logError(error);
        toast(`Post not published: ${error?.message || 'try again'}`);
        setPosting(false);
      }
      return;
    }
    try {
      const form = new FormData();
      form.append('text', text.trim());
      form.append('background', bgKey);
      appendStoryMusic(form, track);
      if (voice) form.append('voice', voice.file);
      await api('/v1/stories/composed', { method: 'POST', body: form });
      api('/v1/stories/rail').then((rail) => useAppStore.getState().setStoryRail(rail.items || [])).catch(() => {});
      refreshMyThumb();
      toast('Story posted. It disappears in 24 hours.');
      navigate('/stories', { replace: true });
    } catch (error) {
      logError(error);
      toast(`Story not posted: ${error?.message || 'try again'}`);
      setPosting(false);
    }
  }

  const canShare = Boolean(text.trim() || voice || track) && !posting;

  return (
    <main className="sc-page" style={{ background: backgroundCss(bgKey) }}>
      <header className="sc-top">
        <button type="button" className="sc-round" aria-label="Back" onClick={() => goBack(navigate)}><Icon name="arrow-left" size={22} /></button>
        <div className="sc-tools">
          <StoryAudioControls compact track={track} onTrack={setTrack} voice={voice} onVoice={setVoice} disabled={posting} />
          <button type="button" className="sa-round sc-bg" aria-label="Change background" onClick={cycleBackground} disabled={posting}>
            <span className="sc-bg-dot" style={{ background: backgroundCss(bgKey) }} />
          </button>
        </div>
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
        <div className="sc-row">
          {!isPost && <button type="button" className="sc-owner" onClick={share} disabled={!canShare} aria-label="Share to your stories">
            <Avatar user={me || {}} size={36} />
            <span>Your stories</span>
          </button>}
          <button type="button" className="sc-share" aria-label={posting ? (isPost ? 'Publishing post' : 'Posting story') : (isPost ? 'Publish post' : 'Share story')} onClick={share} disabled={!canShare}>
            {posting ? <span className="sc-spin" role="status" aria-label="Posting story" /> : <Icon name="arrow-right" size={26} />}
          </button>
        </div>
      </div>
    </main>
  );
}
