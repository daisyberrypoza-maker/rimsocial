import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trimVideo, POST_MAX_SECONDS, STORY_MAX_SECONDS } from '../lib/videoTrim.js';
import { startUpload } from '../lib/uploader.js';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast, logError } from '../toast.js';
import Icon from '../components/Icon.jsx';
import { mediaUrl } from '../lib/config.js';
import { goBack } from '../lib/goBack.js';

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
  const [view, setView] = useState(remixId || asStory ? 'gallery' : 'camera');
  const [tab, setTab] = useState('Camera Roll');
  const [recents, setRecents] = useState([]);
  const [memories, setMemories] = useState([]);
  const [file, setFile] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [trimming, setTrimming] = useState(false);
  const [preview, setPreview] = useState('');
  const [soundOn, setSoundOn] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
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
        toStory, file: toStory ? (storyFile || file) : file, storyFile,
        caption: draft.caption || '', topic: topic.trim(), aiLabel, allowRemix, visibility,
        sourcePostId: sourcePost?.id, sponsor, shareToStory,
      });
      setDraft({ caption: '', topic: '', aiLabel: false, shareToStory: false });
      setTopic(''); setAiLabel(false); setShareToStory(false);
      setFile(null);
      setRawFile(null);
      setSourcePost(null);
      setSheetOpen(false);
      navigate(toStory ? '/stories' : '/');
    } catch (error) {
      toast(error?.message || 'This video could not be prepared for your Story');
      logError(error);
    } finally {
      setTrimming(false);
    }
  }

  if (view === 'camera') return <CameraView onCapture={chooseFile} onGallery={() => setView('gallery')} onClose={() => goBack(navigate)} />;

  if (view === 'gallery') {
    return <main className="up-page up-gallery">
      <header className="up-top">
        <button type="button" className="up-icon" onClick={() => goBack(navigate)} aria-label="Close"><Icon name="chevron-down" size={30} /></button>
        <h1>{asStory ? 'Post To Story' : 'Post'}</h1>
        <button type="button" className="up-icon" onClick={() => document.getElementById('up-capture')?.click()} aria-label="Take a photo or video"><Icon name="camera" size={26} /></button>
      </header>
      <div className="up-tabs" role="tablist" aria-label="Media sources">
        {['Memories', 'Camera Roll'].map((name) => <button type="button" role="tab" key={name} aria-selected={tab === name} className={tab === name ? 'on' : ''} onClick={() => setTab(name)}>{name}</button>)}
      </div>
      {tab === 'Camera Roll' ? <div className="up-grid">
        <button type="button" className="up-tile up-pick" onClick={() => document.getElementById('up-file')?.click()} aria-label="Choose from your phone"><Icon name="image" size={30} /></button>
        {recents.map((item) => <button type="button" key={item.url} className="up-tile" onClick={() => chooseFile(item.file)} aria-label="Select this media">
          {String(item.file.type).startsWith('video/') ? <video src={item.url} muted playsInline preload="metadata" /> : <img src={item.url} alt="" />}
        </button>)}
      </div> : <div className="up-grid">
        {memories.map((item) => <button type="button" key={item.id} className="up-tile" onClick={() => navigate(`/p/${item.id}`)} aria-label="Open this post">
          {item.kind === 'video' ? <video src={mediaUrl(item.mediaUrl)} muted playsInline preload="metadata" /> : <img src={mediaUrl(item.mediaUrl)} alt="" />}
        </button>)}
      </div>}
      <input id="up-file" className="hidden" type="file" accept={ACCEPT} onChange={(e) => { chooseFile(e.target.files?.[0] || null); e.target.value = ''; }} />
      <input id="up-capture" className="hidden" type="file" accept="image/*,video/*" capture="environment" onChange={(e) => { chooseFile(e.target.files?.[0] || null); e.target.value = ''; }} />
    </main>;
  }

  return <main className="up-page up-editor">
    <div className="up-media">
      {isVideo ? <video ref={previewRef} src={preview} loop muted={!soundOn} playsInline onClick={togglePreview} aria-label="Preview: tap to play or pause" /> : preview && <img src={preview} alt="Selected media" />}
    </div>
    <header className="up-editor-top">
      <button type="button" className="up-icon" onClick={() => setView('gallery')} aria-label="Back to gallery"><Icon name="x" size={28} /></button>
      <button type="button" className="up-caption-pill" onClick={() => setSheetOpen(true)}>
        <span>{(draft.caption || '').trim() ? draft.caption.trim().slice(0, 28) : 'Add a caption'}</span><Icon name="plus" size={16} />
      </button>
      <span className="up-spacer" aria-hidden="true" />
    </header>
    <div className="up-tools">
      <button type="button" onClick={() => setSheetOpen(true)} aria-label="Caption and options"><span className="up-t">T</span></button>
      {isVideo && <button type="button" onClick={() => setSoundOn((on) => !on)} aria-label={soundOn ? 'Mute' : 'Turn sound on'}><Icon name={soundOn ? 'volume-2' : 'volume-x'} size={26} /></button>}
    </div>
    <footer className="up-bottom">
      <button type="button" className="up-round" onClick={saveToDevice} aria-label="Save to your phone"><DownloadGlyph /></button>
      <button type="button" className="up-pill up-post" onClick={() => publish(false)} disabled={trimming}>+ Post</button>
      <button type="button" className="up-pill up-story" onClick={() => publish(true)} disabled={trimming}>My Story <Icon name="send" size={20} /></button>
    </footer>

    {sheetOpen && <div className="up-sheet-backdrop" role="presentation" onClick={() => setSheetOpen(false)}>
      <section className="up-sheet" role="dialog" aria-label="Caption and options" onClick={(e) => e.stopPropagation()}>
        <div className="up-sheet-top">
          <h2>Caption and options</h2>
          <button type="button" className="up-done" onClick={() => setSheetOpen(false)}>Done</button>
        </div>
        <textarea ref={captionRef} id="post-caption" aria-label="Caption" placeholder="Write a caption… add #hashtags and @mentions" maxLength={asStory ? 200 : 500} value={draft.caption || ''} onChange={handleCaptionChange} rows={3} />
        <div className="up-count">{(draft.caption || '').length}/{asStory ? 200 : 500}</div>
        {mentionAnchor && (mentionLoading || mentionSuggestions.length > 0) && <div className="ig-mentions" role="listbox" aria-label="People to mention">
          {mentionLoading ? <p className="ig-empty"></p> : mentionSuggestions.map((person) => <button type="button" key={person.id} role="option" className="ig-mention" onClick={() => insertMention(person)}><span className="ig-mention-avatar">{(person.displayName || person.username || '?').slice(0, 1).toUpperCase()}</span><span><strong>{person.username}</strong><small>{person.displayName}</small></span></button>)}
        </div>}
        <label className="up-row"><span>Topic</span><input id="post-topic" type="text" value={topic} maxLength={60} placeholder="Fashion, comedy, tech…" onChange={(e) => { setTopic(e.target.value); setDraft({ ...(draft || {}), topic: e.target.value, aiLabel, shareToStory }); }} /></label>
        <div className="up-row"><span>Who can see this</span>
          <div className="up-choice">
            <button type="button" className={visibility === 'public' ? 'on' : ''} onClick={() => setVisibility('public')}>Public</button>
            <button type="button" className={visibility === 'private' ? 'on' : ''} onClick={() => setVisibility('private')}>Only me</button>
          </div>
        </div>
        <label className="up-row"><span>Share to story</span><input type="checkbox" checked={shareToStory} onChange={(e) => { setShareToStory(e.target.checked); setDraft({ ...(draft || {}), topic, aiLabel, shareToStory: e.target.checked }); }} /></label>
        <label className="up-row"><span>Allow remixing</span><input type="checkbox" checked={allowRemix} onChange={(e) => setAllowRemix(e.target.checked)} /></label>
        <label className="up-row"><span>AI-generated or AI-altered</span><input type="checkbox" checked={aiLabel} onChange={(e) => { setAiLabel(e.target.checked); setDraft({ ...(draft || {}), topic, aiLabel: e.target.checked, shareToStory }); }} /></label>
        {visibility === 'public' && <label className="up-row"><span>Paid partnership</span><input type="checkbox" checked={isSponsored} onChange={(e) => setIsSponsored(e.target.checked)} /></label>}
        {visibility === 'public' && isSponsored && <div className="up-sponsor">
          <p>Disclose a business or paid partner. Your post shows an Ad label.</p>
          <label>Sponsor or business name<input type="text" value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} maxLength={100} placeholder="Business name" /></label>
          <label>Short description<input type="text" value={sponsorDescription} onChange={(e) => setSponsorDescription(e.target.value)} maxLength={200} placeholder="What is being promoted?" /></label>
          <label>Call-to-action label<select value={sponsorCta} onChange={(e) => setSponsorCta(e.target.value)}><option>Shop Now</option><option>Learn More</option><option>Sign Up</option><option>Contact Us</option><option>Download</option></select></label>
          <label>Destination URL<input type="url" value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://example.com" required={isSponsored} /></label>
        </div>}
        <p className="up-note">{visibility === 'public' ? 'Your post is visible to everyone.' : 'Only you can see this post.'} Stories are public and disappear after 24 hours.</p>
      </section>
    </div>}
  </main>;
}
