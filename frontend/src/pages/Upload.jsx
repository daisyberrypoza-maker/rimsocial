import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trimVideo, POST_MAX_SECONDS, STORY_MAX_SECONDS } from '../lib/videoTrim.js';
import { startUpload } from '../lib/uploader.js';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast, logError } from '../toast.js';
import StoryAudioControls from '../components/StoryAudioControls.jsx';
import Icon from '../components/Icon.jsx';
import { mediaUrl } from '../lib/config.js';
import { goBack } from '../lib/goBack.js';
import './UploadCreate.css';
import './UploadEditor.css';

// Gallery video tile: shows the clip length (m:ss) once the metadata loads
function GalleryVideo({ url }) {
  const [seconds, setSeconds] = useState(null);
  const shown = Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : null;
  return <>
    <video src={url} muted playsInline preload="metadata" onLoadedMetadata={(e) => setSeconds(e.currentTarget.duration)} />
    {shown && <span className="up-tile-dur">{shown}</span>}
  </>;
}

const ACCEPT = 'video/mp4,video/webm,image/jpeg,image/png,image/webp,image/gif';

function DownloadGlyph() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 19h14" /></svg>;
}

// Camera first, as in Snapchat: a live viewfinder opens when you tap Add.
// Flip, flash-free photo capture; the gallery icon opens the older picker. Photos go to the same editor.
function CameraView({ onCapture, onGallery, onClose }) {
  const videoRef = useRef(null);
  const [facing, setFacing] = useState("user");
  const [error, setError] = useState("");
  const [streamKey, setStreamKey] = useState(0);

  useEffect(() => {
    let stream = null;
    let alive = true;
    if (!navigator.mediaDevices?.getUserMedia) { setError("The camera is not available in this browser."); return undefined; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((s) => {
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setError("");
      })
      .catch(() => { if (alive) setError("Allow camera access to take a photo, or choose one from your gallery."); });
    return () => { alive = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing, streamKey]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], "capture.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  return (
    <main className="cam-page">
      <video ref={videoRef} className={facing === "user" ? "cam-video mirror" : "cam-video"} autoPlay playsInline muted />
      {error && <p className="cam-error">{error}</p>}
      <button type="button" className="cam-close" onClick={onClose} aria-label="Close"><Icon name="x" size={26} /></button>
      <div className="cam-side">
        <button type="button" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} aria-label="Flip camera"><Icon name="refresh" size={26} /></button>
        <button type="button" onClick={() => setStreamKey((k) => k + 1)} aria-label="Restart camera"><Icon name="chevron-down" size={24} /></button>
      </div>
      <div className="cam-bottom">
        <button type="button" className="cam-side-btn" onClick={onGallery} aria-label="Choose from gallery"><Icon name="image" size={28} /></button>
        <button type="button" className="cam-shutter" onClick={capture} aria-label="Take photo"><span /></button>
        <span className="cam-spacer" aria-hidden="true" />
      </div>
    </main>
  );
}

// Gallery (choose), then editor (preview, tools, Post or My Story)
export default function Upload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const remixId = searchParams.get('remix');
  const draft = useAppStore((s) => s.uploadDraft);
  const setDraft = useAppStore((s) => s.setUploadDraft);
  const asStory = searchParams.get('story') === '1';
  const asReel = searchParams.get('reel') === '1';
  const [view, setView] = useState(remixId || asStory || asReel ? 'gallery' : 'camera');
  const [tab, setTab] = useState('Camera Roll');
  const [recents, setRecents] = useState([]);
  const [memories, setMemories] = useState([]);
  const [file, setFile] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [trimming, setTrimming] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState([]);
  const [carousel, setCarousel] = useState([]);
  const [storyTrack, setStoryTrack] = useState(null);
  const [storyVoice, setStoryVoice] = useState(null);
  const [preview, setPreview] = useState('');
  const [soundOn, setSoundOn] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const me = useAppStore((s) => s.user);
  const [allowRemix, setAllowRemix] = useState(false);
  const [sourcePost, setSourcePost] = useState(null);
  const [visibility, setVisibility] = useState('public');
  const [isSponsored, setIsSponsored] = useState(false);
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorDescription, setSponsorDescription] = useState('');
  const [sponsorCta, setSponsorCta] = useState('Shop Now');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [topic, setTopic] = useState(draft.topic || '');
  const [aiLabel, setAiLabel] = useState(Boolean(draft.aiLabel));
  const [shareToStory, setShareToStory] = useState(Boolean(draft.shareToStory));
  const [mentionAnchor, setMentionAnchor] = useState(null);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const captionRef = useRef(null);
  const previewRef = useRef(null);
  const isVideo = Boolean(file && String(file.type).startsWith('video/'));

  // The preview starts paused: tap to play or pause. It stops when replaced or left.
  function togglePreview() {
    const video = previewRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  useEffect(() => {
    const video = previewRef.current;
    return () => { video?.pause(); };
  }, [preview, view]);

  useEffect(() => {
    if (!remixId) { setSourcePost(null); return undefined; }
    let active = true;
    api(`/v1/posts/${encodeURIComponent(remixId)}`).then((item) => {
      if (!active) return;
      if (!item.allowRemix) { toast('The creator has not allowed remixing this post'); setSourcePost(null); return; }
      setSourcePost(item);
      setDraft((current) => ({ ...current, caption: item.caption ? `Remix of @${item.author?.username || 'creator'}: ` : '' }));
    }).catch((error) => { if (active) logError(error); });
    return () => { active = false; };
  }, [remixId, setDraft]);

  // Memories: the person's own posts
  useEffect(() => {
    if (tab !== 'Memories') return undefined;
    let active = true;
    api('/v1/users/me/posts').then((d) => { if (active) setMemories(d.items || []); }).catch((error) => { if (active) logError(error); });
    return () => { active = false; };
  }, [tab]);

  // Choosing a file: video is trimmed to the post length, then the editor opens
  async function chooseFile(picked) {
    if (!picked) return;
    setCarousel([]);
    setRecents((list) => [{ file: picked, url: URL.createObjectURL(picked) }, ...list.filter((item) => item.file !== picked)].slice(0, 15));
    setRawFile(picked);
    if (!String(picked.type).startsWith('video/')) { setFile(picked); setView('editor'); return; }
    setTrimming(true);
    try {
      setFile(await trimVideo(picked, POST_MAX_SECONDS));
      setView('editor');
    } catch (error) {
      setFile(null);
      setRawFile(null);
      logError(error);
    } finally {
      setTrimming(false);
    }
  }

  // Select mode: tap photos and/or videos in order to post them as one carousel post (up to 10)
  function pickMany(list) {
    if (!list.length) return;
    if (list.length === 1) { chooseFile(list[0]); return; }
    const chosen = list.slice(0, 10);
    setRecents((current) => [...chosen.map((f) => ({ file: f, url: URL.createObjectURL(f) })), ...current].slice(0, 40));
    setSelectMode(true);
    setSelection(chosen);
  }

  function onTileTap(picked) {
    if (!selectMode) return chooseFile(picked);
    setSelection((list) => (list.includes(picked) ? list.filter((f) => f !== picked) : list.length < 10 ? [...list, picked] : list));
  }

  function openSelection() {
    if (!selection.length) return;
    setSelectMode(false);
    if (selection.length === 1) { const only = selection[0]; setSelection([]); chooseFile(only); return; }
    setCarousel(selection);
    setRawFile(selection[0]);
    setFile(selection[0]);
    setSelection([]);
    setView('editor');
  }

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!mentionAnchor?.query) { setMentionSuggestions([]); return undefined; }
    let active = true;
    setMentionLoading(true);
    api('/v1/search?q=' + encodeURIComponent(mentionAnchor.query) + '&type=people')
      .then((result) => { if (active) setMentionSuggestions((result.people || []).slice(0, 5)); })
      .catch(() => { if (active) setMentionSuggestions([]); })
      .finally(() => { if (active) setMentionLoading(false); });
    return () => { active = false; };
  }, [mentionAnchor?.query]);

  function handleCaptionChange(event) {
    const value = event.target.value;
    const caret = event.target.selectionStart ?? value.length;
    setDraft({ ...(draft || {}), caption: value, topic, aiLabel, shareToStory });
    const match = value.slice(0, caret).match(/(^|\s)@([a-zA-Z0-9_.]{0,30})$/);
    if (match) setMentionAnchor({ start: caret - match[2].length - 1, end: caret, query: match[2] });
    else setMentionAnchor(null);
  }

  function insertMention(person) {
    const value = String(draft.caption || '');
    const anchor = mentionAnchor;
    if (!anchor) return;
    const next = value.slice(0, anchor.start) + '@' + person.username + ' ' + value.slice(anchor.end);
    setDraft({ ...(draft || {}), caption: next, topic, aiLabel, shareToStory });
    setMentionAnchor(null); setMentionSuggestions([]);
    requestAnimationFrame(() => {
      const input = captionRef.current;
      if (input) { const caret = anchor.start + person.username.length + 2; input.focus(); input.setSelectionRange(caret, caret); }
    });
  }

  // The "@" chip: adds an @ to the description and lets the person type a name for suggestions
  function addMention() {
    const value = String(draft.caption || '');
    const next = value + (value && !/\s$/.test(value) ? ' ' : '') + '@';
    setDraft({ ...(draft || {}), caption: next, topic, aiLabel, shareToStory });
    requestAnimationFrame(() => captionRef.current?.focus());
  }

  function saveToDevice() {
    if (!preview) return;
    const link = document.createElement('a');
    link.href = preview;
    link.download = file?.name || 'rimsocial-media';
    link.click();
  }

  // Post (toStory false) or My Story (toStory true): checked here, then uploaded in the background
  // while the person goes straight to Rimlight or Stories.
  async function publish(toStory) {
    if (trimming) return;
    if (!file) return toast('Choose a photo or video first');
    if (remixId && !sourcePost) return toast('This post cannot be remixed. Choose a post whose creator allows remixing.');
    let sponsor = null;
    if (!toStory && isSponsored) {
      if (!sponsorName.trim()) return toast('Enter the sponsor or business name');
      if (!/^https?:\/\//i.test(sponsorUrl.trim())) return toast('Enter a valid sponsor destination URL');
      sponsor = { name: sponsorName.trim(), description: sponsorDescription.trim(), cta: sponsorCta.trim() || 'Shop Now', url: sponsorUrl.trim() };
    }

    // Prepare story media while the editor is still open. Background upload only sends
    // the prepared file; it never decodes or plays the source video after navigation.
    setTrimming(true);
    try {
      const storyFile = (toStory || shareToStory)
        ? await trimVideo(rawFile || file, STORY_MAX_SECONDS)
        : null;
      startUpload({
        toStory, file: toStory ? (storyFile || file) : file, storyFile, files: !toStory && carousel.length > 1 ? carousel : null,
        caption: draft.caption || '', topic: topic.trim(), aiLabel, allowRemix, visibility,
        sourcePostId: sourcePost?.id, sponsor, shareToStory,
        storyAudio: { musicId: storyTrack?.id || null, voice: storyVoice?.file || null },
      });
      setDraft({ caption: '', topic: '', aiLabel: false, shareToStory: false });
      setTopic(''); setAiLabel(false); setShareToStory(false);
      setFile(null);
      setRawFile(null);
      setCarousel([]);
      setStoryTrack(null);
      setStoryVoice(null);
      setSourcePost(null);
      setDetailsOpen(false);
      // A story (alone or shared with a post) lands on Stories; a post alone lands on Rimlight
      navigate(toStory || shareToStory ? '/stories' : '/');
    } catch (error) {
      toast(error?.message || 'This video could not be prepared for your Story');
      logError(error);
    } finally {
      setTrimming(false);
    }
  }

  if (view === 'camera') return <CameraView onCapture={chooseFile} onGallery={() => setView('gallery')} onClose={() => goBack(navigate)} />;

  if (view === 'gallery') {
    const onRecents = tab === 'Camera Roll';
    const shownRecents = recents.filter((item) => !asReel || String(item.file.type).startsWith('video/'));
    const modes = [{ key: 'post', label: 'POST', path: '/upload' }, { key: 'story', label: 'STORY', path: '/upload?story=1' }, { key: 'reel', label: 'REEL', path: '/upload?reel=1' }];
    const activeMode = asStory ? 'story' : asReel ? 'reel' : 'post';
    return <main className="up-page up-gallery ig-create">
      <header className="ig-create-top">
        <button type="button" className="ig-create-x" onClick={() => goBack(navigate)} aria-label="Close"><Icon name="x" size={28} /></button>
        <nav className="ig-create-modes" aria-label="Create type">
          {modes.map((mode) => <button key={mode.key} type="button" className={mode.key === activeMode ? 'on' : ''} onClick={() => navigate(mode.path, { replace: true })}>{mode.label}</button>)}
        </nav>
        <button type="button" className="ig-create-gear" onClick={() => toast('Not available yet')} aria-label="Settings"><Icon name="settings" size={28} /></button>
      </header>
      <div className="ig-create-sub">
        <button type="button" className="ig-create-source" onClick={() => setTab(onRecents ? 'Memories' : 'Camera Roll')} aria-label="Change album">
          {onRecents ? 'Gallery' : 'Memories'} <Icon name="chevron-down" size={18} />
        </button>
        {asStory && <button type="button" className="ig-create-pick" onClick={() => navigate('/story/text')} aria-label="Text story"><span className="ig-create-aa">Aa</span> Text story</button>}
        {onRecents && !asStory && !asReel && <button type="button" className={selectMode ? 'ig-create-select on' : 'ig-create-select'} onClick={() => { setSelectMode((on) => !on); setSelection([]); }} aria-pressed={selectMode}>{selectMode ? 'Cancel' : 'Select'}</button>}
      </div>
      {onRecents ? <div className="ig-grid">
        <button type="button" className="ig-tile ig-tile-camera" onClick={() => setView('camera')} aria-label="Open camera"><Icon name="camera" size={34} /><span>Camera</span></button>
        <button type="button" className="ig-tile ig-tile-choose" onClick={() => document.getElementById('up-file')?.click()} aria-label="Choose from your phone"><Icon name="image" size={30} /><span>Choose</span></button>
        {shownRecents.map((item) => <button type="button" key={item.url} className="ig-tile" onClick={() => onTileTap(item.file)} aria-label="Select this media">
          {String(item.file.type).startsWith('video/') ? <GalleryVideo url={item.url} /> : <img src={item.url} alt="" />}
          {selectMode && <span className={selection.includes(item.file) ? 'up-tile-num' : 'up-tile-ring'}>{selection.includes(item.file) ? selection.indexOf(item.file) + 1 : ''}</span>}
        </button>)}
      </div> : <div className="ig-grid">
        {memories.map((item) => <button type="button" key={item.id} className="ig-tile" onClick={() => navigate(`/p/${item.id}`)} aria-label="Open this post">
          {item.kind === 'video' ? <video src={mediaUrl(item.mediaUrl)} muted playsInline preload="metadata" /> : <img src={mediaUrl(item.mediaUrl)} alt="" />}
        </button>)}
      </div>}
      {selectMode && selection.length > 0 && <button type="button" className="up-select-next" onClick={openSelection}>Next ({selection.length})</button>}
      <input id="up-file" className="hidden" type="file" accept={asReel ? 'video/*' : ACCEPT} multiple={!asReel && !asStory} onChange={(e) => { pickMany(Array.from(e.target.files || [])); e.target.value = ''; }} />
      <input id="up-capture" className="hidden" type="file" accept="image/*,video/*" capture="environment" onChange={(e) => { chooseFile(e.target.files?.[0] || null); e.target.value = ''; }} />
    </main>;
  }

  const durLabel = Number.isFinite(duration) && duration >= 1
    ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
    : '';
  const myName = me?.username || 'you';
  const musicLabel = storyTrack?.title || storyTrack?.name || 'Add music';

  if (detailsOpen) {
    const displayName = me?.displayName || myName;
    return <main className="up-page up-details">
      <button type="button" className="up-drag" onClick={() => setDetailsOpen(false)} aria-label="Back to editor"><span /></button>
      <h1 className="up-details-title">New Spotlight Post</h1>
      <div className="up-details-body">
        <div className="up-preview-card">
          <div className="up-preview-media">
            {isVideo ? <video src={preview} muted playsInline autoPlay loop /> : preview && <img src={preview} alt="" />}
            <div className="up-preview-rail" aria-hidden="true"><Icon name="heart" size={22} /><CommentGlyph /><Icon name="share" size={22} /></div>
            <div className="up-preview-meta" aria-hidden="true">
              <span className="up-preview-name">{displayName}</span>
              <span className="up-preview-bar long" />
              <span className="up-preview-bar short" />
            </div>
          </div>
        </div>

        <div className="up-desc-wrap">
          <textarea ref={captionRef} className="up-desc" aria-label="Description" placeholder="Add a description..." maxLength={500} value={draft.caption || ''} onChange={handleCaptionChange} rows={3} />
        </div>
        {mentionAnchor && (mentionLoading || mentionSuggestions.length > 0) && <div className="ig-mentions" role="listbox" aria-label="People to mention">
          {mentionLoading ? <p className="ig-empty"></p> : mentionSuggestions.map((person) => <button type="button" key={person.id} role="option" className="ig-mention" onClick={() => insertMention(person)}><span className="ig-mention-avatar">{(person.displayName || person.username || '?').slice(0, 1).toUpperCase()}</span><span><strong>{person.username}</strong><small>{person.displayName}</small></span></button>)}
        </div>}

        <div className="up-chips">
          <label className="up-chip"><span className="up-chip-sym">#</span><input id="post-topic" type="text" value={topic} maxLength={60} placeholder="Add topic" onChange={(e) => { setTopic(e.target.value); setDraft({ ...(draft || {}), topic: e.target.value, aiLabel, shareToStory }); }} /><Icon name="chevron-right" size={14} /></label>
          <button type="button" className="up-chip" onClick={addMention}><span className="up-chip-sym">@</span><span>Add mention</span><Icon name="chevron-right" size={14} /></button>
        </div>

        <div className="up-section">
          <div className="up-row up-row-share">
            <span className="up-row-avatar" aria-hidden="true">{myName.slice(0, 1).toUpperCase()}</span>
            <div className="up-row-text">
              <strong>Share to Story</strong>
              <button type="button" className="up-row-sub" onClick={() => setVisibility(visibility === 'public' ? 'private' : 'public')}>My Story · {visibility === 'public' ? 'Public' : 'Only me'}<Icon name="chevron-right" size={14} /></button>
            </div>
            <Check on={shareToStory} label="Share to Story" onChange={(v) => { setShareToStory(v); setDraft({ ...(draft || {}), topic, aiLabel, shareToStory: v }); }} />
          </div>
          <div className="up-row">
            <span className="up-row-ico" aria-hidden="true"><RemixGlyph /></span>
            <div className="up-row-text">
              <strong>Allow Remixing</strong>
              <span className="up-row-note">Enable others to use your audio or video content.</span>
            </div>
            <Check on={allowRemix} label="Allow Remixing" onChange={setAllowRemix} />
          </div>
          <div className="up-row">
            <span className="up-row-ico up-row-ai" aria-hidden="true"><AiGlyph /></span>
            <div className="up-row-text">
              <strong>Add AI Label</strong>
              <span className="up-row-note">We require you to label content made with AI.</span>
            </div>
            <Check on={aiLabel} label="Add AI label" onChange={(v) => { setAiLabel(v); setDraft({ ...(draft || {}), topic, aiLabel: v, shareToStory }); }} />
          </div>
        </div>
      </div>
      <button type="button" className="up-post-btn" onClick={() => publish(false)} disabled={trimming}>Post</button>
    </main>;
  }

  const soon = () => toast('This tool is not available yet');
  const rail = [
    { key: 'draw', label: 'Draw', glyph: 'pencil' },
    { key: 'sticker', label: 'Stickers', glyph: 'sticker' },
    { key: 'effects', label: 'Effects', glyph: 'effects' },
    { key: 'face', label: 'Face stickers', glyph: 'face' },
    { key: 'ai', label: 'AI effects', glyph: 'sparkle' },
    { key: 'link', label: 'Link', glyph: 'link' },
    { key: 'crop', label: 'Crop', glyph: 'crop' },
    { key: 'loop', label: 'Loop', glyph: 'infinity' },
    { key: 'friend', label: 'Add friend', glyph: 'friend' },
  ];

  return <main className="up-page up-editor">
    <div className="up-media">
      {carousel.length > 1 && <span className="up-carousel-count">1 / {carousel.length}</span>}
      {isVideo ? <video ref={previewRef} src={preview} loop muted={!soundOn} playsInline onClick={togglePreview} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} aria-label="Preview: tap to play or pause" /> : preview && <img src={preview} alt="Selected media" />}
    </div>
    <header className="up-editor-top">
      <button type="button" className="up-icon" onClick={() => setView('gallery')} aria-label="Back to gallery"><Icon name="x" size={28} /></button>
      <button type="button" className="up-music" onClick={() => setMusicOpen((open) => !open)} aria-expanded={musicOpen}>
        <span className="up-music-disc" aria-hidden="true"><Icon name="music" size={14} /></span>
        <span className="up-music-title">{musicLabel}</span>
        <span className="up-music-sep" aria-hidden="true" />
        <span className="up-music-plus" aria-hidden="true"><Icon name="plus" size={18} /></span>
      </button>
      <button type="button" className="up-icon up-t-btn" onClick={() => setDetailsOpen(true)} aria-label="Add caption"><span className="up-t">T</span></button>
    </header>
    <nav className="up-rail" aria-label="Editing tools">
      {isVideo && <button type="button" onClick={() => setSoundOn((on) => !on)} aria-label={soundOn ? 'Mute' : 'Turn sound on'}><Icon name={soundOn ? 'volume-2' : 'volume-x'} size={24} /></button>}
      {rail.map((tool) => <button key={tool.key} type="button" onClick={soon} aria-label={tool.label}><RailGlyph name={tool.glyph} /></button>)}
    </nav>
    {musicOpen && <div className="up-music-panel"><StoryAudioControls track={storyTrack} onTrack={setStoryTrack} voice={storyVoice} onVoice={setStoryVoice} /></div>}
    <div className="up-filters">
      <span className="up-filter-thumb on">{preview && (isVideo ? <video src={preview} muted playsInline preload="metadata" /> : <img src={preview} alt="" />)}</span>
      <button type="button" className="up-hd" onClick={soon} aria-label="HD">HD</button>
    </div>
    <div className="up-timeline-wrap">
      <div className="up-timeline" aria-hidden="true">
        {preview && (isVideo ? <video src={preview} muted playsInline preload="metadata" /> : <img src={preview} alt="" />)}
        {durLabel && <span>{durLabel}</span>}
      </div>
    </div>
    <footer className="up-bottom">
      <button type="button" className="up-round" onClick={saveToDevice} aria-label="Save to your phone"><DownloadGlyph /></button>
      <button type="button" className="up-next" onClick={() => (asStory ? publish(true) : setDetailsOpen(true))} disabled={trimming}>Next <Icon name="arrow-right" size={22} /></button>
    </footer>
  </main>;
}

function Check({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'up-check on' : 'up-check'} onClick={() => onChange(!on)}>{on && <Icon name="check" size={16} />}</button>;
}

function CommentGlyph() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1z" /></svg>;
}

function RemixGlyph() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="3" /><circle cx="12" cy="13.5" r="3.5" /><path d="M9 7l1.5-2.5h3L15 7" /></svg>;
}

function AiGlyph() {
  return <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 27L8 9l6 18" /><path d="M4.5 21h7" /><path d="M21 6l1.2 3.3L25.5 10.5 22.2 11.7 21 15l-1.2-3.3L16.5 10.5l3.3-1.2z" fill="currentColor" stroke="none" /></svg>;
}

function RailGlyph({ name }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (name) {
    case 'pencil': return <svg {...common}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M4 21h16" /></svg>;
    case 'sticker': return <svg {...common}><path d="M5 3h10l6 6v8a4 4 0 0 1-4 4H5z" /><path d="M15 3v5a1 1 0 0 0 1 1h5" /></svg>;
    case 'effects': return <svg {...common}><path d="M9 4l1.5 3.5L14 9l-3.5 1.5L9 14l-1.5-3.5L4 9l3.5-1.5z" /><path d="M17 12l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" /></svg>;
    case 'face': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4 4 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" /></svg>;
    case 'sparkle': return <svg {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" /></svg>;
    case 'link': return <svg {...common}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
    case 'crop': return <svg {...common}><path d="M6 2v16h16" /><path d="M2 6h16v16" /></svg>;
    case 'infinity': return <svg {...common}><path d="M12 12c-2-3-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1 6-4s4-4 6-4a4 4 0 0 1 0 8c-2 0-4-1-6-4z" /></svg>;
    case 'friend': return <svg {...common}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M19 8v6M16 11h6" /></svg>;
    default: return null;
  }
}
