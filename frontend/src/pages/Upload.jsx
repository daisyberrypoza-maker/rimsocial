import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { trimVideo, POST_MAX_SECONDS, STORY_MAX_SECONDS } from '../lib/videoTrim.js';
import { startUpload } from '../lib/uploader.js';
import { FILTERS, cssFilterFor, bakeFilter, CROP_RATIOS, STROKE_WIDTH } from '../lib/photoFilters.js';
import { TEXT_COLORS, TEXT_FONTS } from '../lib/textLayers.js';
import TextEditor from '../components/TextEditor.jsx';
import { cameraZoom } from '../lib/cameraZoom.js';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import Avatar from '../components/Avatar.jsx';
import { toast, logError } from '../toast.js';
import StoryAudioControls from '../components/StoryAudioControls.jsx';
import MusicPicker from '../components/MusicPicker.jsx';
import CameraSettings, { readCameraPref } from '../components/CameraSettings.jsx';
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
function CameraView({ onCapture, onGallery }) {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.user);
  const videoRef = useRef(null);
  const [facing, setFacing] = useState(() => (readCameraPref('startFront', true) ? 'user' : 'environment'));
  const [error, setError] = useState("");
  const [streamKey, setStreamKey] = useState(0);
  const [torch, setTorch] = useState(false);
  // Zoom: hardware zoom when the camera reports it, otherwise a digital zoom that is cropped on capture
  const [zoom, setZoom] = useState(1);
  const zoomState = useRef({ active: false, startY: 0, startZoom: 1, hardware: false, max: 1, track: null });
  // Press and hold the shutter to record video (up to 60s); a quick tap takes a photo
  const streamRef = useRef(null);
  const recRef = useRef({ holdTimer: null, tick: null, recorder: null, chunks: [], startedAt: 0, held: false, cancelled: false });
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const HOLD_MS = 250;
  const MAX_RECORD_MS = 60000;

  useEffect(() => {
    let stream = null;
    let alive = true;
    setTorch(false);
    if (!navigator.mediaDevices?.getUserMedia) { setError("The camera is not available in this browser."); return undefined; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((s) => {
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        const track = s.getVideoTracks()[0] || null;
        const caps = track?.getCapabilities?.() || {};
        zoomState.current = { active: false, startY: 0, startZoom: 1, hardware: Boolean(caps.zoom), max: caps.zoom?.max || 3, track };
        setZoom(1);
        setError("");
      })
      .catch(() => { if (alive) setError("Allow camera access to take a photo, or choose one from your gallery."); });
    return () => { alive = false; streamRef.current = null; stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing, streamKey]);

  // Stop any recording and timers when the camera closes (no capture is sent)
  useEffect(() => () => {
    const rec = recRef.current;
    clearTimeout(rec.holdTimer);
    clearInterval(rec.tick);
    if (rec.recorder && rec.recorder.state !== 'inactive') { rec.recorder.onstop = null; rec.recorder.stop(); }
  }, []);

  function pickVideoType() {
    const types = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || !window.MediaRecorder) { setError('Video recording is not available in this browser.'); return; }
    const type = pickVideoType();
    const rec = recRef.current;
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    rec.recorder = recorder;
    rec.chunks = [];
    rec.cancelled = false;
    rec.startedAt = Date.now();
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    recorder.onstop = () => {
      const mime = recorder.mimeType || type || 'video/webm';
      const blob = new Blob(rec.chunks, { type: mime });
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      rec.chunks = [];
      rec.recorder = null;
      setRecording(false);
      setRecordProgress(0);
      if (blob.size && !rec.cancelled) onCapture(new File([blob], `capture.${ext}`, { type: mime }));
    };
    recorder.start(500);
    setRecording(true);
    setRecordProgress(0);
    rec.tick = setInterval(() => {
      const elapsed = Date.now() - rec.startedAt;
      setRecordProgress(Math.min(1, elapsed / MAX_RECORD_MS));
      if (elapsed >= MAX_RECORD_MS) stopRecording();
    }, 100);
  }

  function stopRecording() {
    const rec = recRef.current;
    clearInterval(rec.tick);
    rec.tick = null;
    if (rec.recorder && rec.recorder.state !== 'inactive') rec.recorder.stop();
  }

  function onShutterDown(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rec = recRef.current;
    rec.held = false;
    clearTimeout(rec.holdTimer);
    rec.holdTimer = setTimeout(() => { rec.held = true; startRecording(); }, HOLD_MS);
  }

  function onShutterUp() {
    const rec = recRef.current;
    clearTimeout(rec.holdTimer);
    if (rec.held) {
      rec.held = false;
      stopRecording();
    } else {
      capture();
    }
  }

  // The system can cancel the pointer during a long press (long-press menu, scroll): stop recording, take no photo
  function onShutterCancel() {
    const rec = recRef.current;
    clearTimeout(rec.holdTimer);
    if (rec.held) {
      rec.held = false;
      rec.cancelled = true;
      stopRecording();
    }
  }

  // Drag up on the preview to zoom in
  function onZoomDown(event) {
    zoomState.current = { ...zoomState.current, active: true, startY: event.clientY, startZoom: zoom };
  }
  function onZoomMove(event) {
    const st = zoomState.current;
    if (!st.active) return;
    const next = cameraZoom(st.startY - event.clientY + (st.startZoom - 1) * 150, st.hardware ? st.max : 3);
    setZoom(next);
    if (st.hardware) st.track?.applyConstraints?.({ advanced: [{ zoom: Math.min(next, st.max) }] }).catch(() => {});
  }
  function onZoomUp() {
    zoomState.current = { ...zoomState.current, active: false };
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    // Digital zoom: keep the centre of the frame that the preview shows
    const digital = !zoomState.current.hardware && zoom > 1 ? zoom : 1;
    const sw = canvas.width / digital;
    const sh = canvas.height / digital;
    const sx = (canvas.width - sw) / 2;
    const sy = (canvas.height - sh) / 2;
    if (facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], "capture.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  // Flash: the torch of the camera, where the device has one
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track?.getCapabilities?.().torch) { toast('Flash is not available on this camera'); return; }
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch { toast('Flash is not available on this camera'); }
  }

  return (
    <main className="cam-page">
      <video ref={videoRef} className={facing === "user" ? "cam-video mirror" : "cam-video"} autoPlay playsInline muted
        style={zoomState.current.hardware || zoom === 1 ? undefined : { transform: facing === "user" ? `scaleX(-${zoom}) scaleY(${zoom})` : `scale(${zoom})` }}
        onPointerDown={onZoomDown} onPointerMove={onZoomMove} onPointerUp={onZoomUp} onPointerCancel={onZoomUp} />
      {error && <p className="cam-error">{error}</p>}
      <header className="cam-top">
        <button type="button" className="cam-avatar" onClick={() => me?.username && navigate('/u/' + me.username)} aria-label="Your profile"><Avatar user={me || {}} size={40} noRing /></button>
        <div className="cam-top-actions">
          <button type="button" onClick={() => navigate('/search')} aria-label="Search"><Icon name="search" size={24} /></button>
          <button type="button" onClick={() => navigate('/friends')} aria-label="Find friends"><Icon name="user-plus" size={24} /></button>
          <button type="button" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} aria-label="Flip camera"><Icon name="refresh" size={24} /></button>
        </div>
      </header>
      <div className={`cam-side cam-side-${readCameraPref('tools', 'left') === 'right' ? 'right' : 'left'}`}>
        <button type="button" onClick={toggleTorch} aria-label={torch ? 'Turn flash off' : 'Turn flash on'} aria-pressed={torch}><Icon name={torch ? 'zap' : 'zap-off'} size={24} /></button>
      </div>
      <div className="cam-bottom">
        <span className="cam-side-wrap"><button type="button" className="cam-side-btn" onClick={onGallery} aria-label="Choose from gallery"><Icon name="image" size={28} /></button><span className="cam-side-label">Gallery</span></span>
        <button type="button" className={`cam-shutter ${recording ? 'recording' : ''}`} onPointerDown={onShutterDown} onPointerUp={onShutterUp} onPointerCancel={onShutterCancel} onPointerLeave={(e) => { if (e.pointerType !== 'mouse') onShutterCancel(); }} onContextMenu={(e) => e.preventDefault()} aria-label="Take photo, or hold to record video">
          <span />
          {recording && (
            <svg className="cam-ring" viewBox="0 0 92 92" aria-hidden="true">
              <circle cx="46" cy="46" r="42" fill="none" stroke="#ff2d55" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 42} strokeDashoffset={(1 - recordProgress) * 2 * Math.PI * 42}
                transform="rotate(-90 46 46)" />
            </svg>
          )}
        </button>
        <span className="cam-spacer" aria-hidden="true" />
      </div>
    </main>
  );
}

// Gallery (choose), then editor (preview, tools, Post or My Story)
// Emoji stickers placed as text layers (no background), baked into photos on publish.
const STICKERS = ['😀', '😂', '😍', '🔥', '💯', '👍', '🎉', '❤️', '😎', '🙌', '✨', '🌟'];

export default function Upload() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const remixId = searchParams.get('remix');
  const draft = useAppStore((s) => s.uploadDraft);
  const setDraft = useAppStore((s) => s.setUploadDraft);
  const asStory = searchParams.get('story') === '1';
  const asReel = searchParams.get('reel') === '1';
  const [view, setView] = useState('gallery');
  const [tab, setTab] = useState('Camera Roll');
  const [recents, setRecents] = useState([]);
  const [memories, setMemories] = useState([]);
  const [file, setFile] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [trimming, setTrimming] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState([]);
  const [carousel, setCarousel] = useState([]);
  const [storyTrack, setStoryTrack] = useState(() => location.state?.storyTrack || null);
  const [galleryMusicOpen, setGalleryMusicOpen] = useState(false);
  const [galleryMusicPlaying, setGalleryMusicPlaying] = useState(false);
  const galleryAudioRef = useRef(null);
  useEffect(() => () => { galleryAudioRef.current?.pause(); }, []);
  const [storyVoice, setStoryVoice] = useState(null);
  const [preview, setPreview] = useState('');
  const [soundOn, setSoundOn] = useState(false);
  const [filterKey, setFilterKey] = useState('original');
  const [textLayers, setTextLayers] = useState([]);
  const [stickersOpen, setStickersOpen] = useState(false);
  // Draw: strokes are stored as fractions of the photo, so they line up on any screen size.
  const [strokes, setStrokes] = useState([]);
  const [liveStroke, setLiveStroke] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState('#ffffff');
  const [photoSize, setPhotoSize] = useState(null);
  const [cropRatio, setCropRatio] = useState('original');
  const [cropOpen, setCropOpen] = useState(false);
  const [loopVideo, setLoopVideo] = useState(true);
  const [textEdit, setTextEdit] = useState(null);
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
      // The chosen photo filter is baked into the file, so the published photo matches the preview.
      if (isVideo && textLayers.length) toast('Text is shown on photos only for now');
      if (isVideo && (strokes.length || cropRatio !== 'original')) toast('Drawing and crop are applied to photos only for now');
      const uploadFile = await bakeFilter(file, filterKey, textLayers, { strokes, crop: cropRatio }).catch(() => file);
      startUpload({
        toStory, file: toStory ? (storyFile || uploadFile) : uploadFile, storyFile, files: !toStory && carousel.length > 1 ? carousel : null,
        storyFiles: toStory && carousel.length > 1 ? await Promise.all(carousel.map((f) => (String(f.type).startsWith('video/') ? trimVideo(f, STORY_MAX_SECONDS) : f))) : null,
        caption: draft.caption || '', topic: topic.trim(), aiLabel, allowRemix, visibility,
        sourcePostId: sourcePost?.id, sponsor, shareToStory, loopVideo,
        storyAudio: { music: storyTrack, voice: storyVoice?.file || null },
      });
      setDraft({ caption: '', topic: '', aiLabel: false, shareToStory: false });
      setTopic(''); setAiLabel(false); setShareToStory(false);
      setFilterKey('original');
      setTextLayers([]);
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

  async function playGalleryMusic(track) {
    if (!track) return;
    try {
      if (!galleryAudioRef.current) galleryAudioRef.current = new Audio();
      const audio = galleryAudioRef.current;
      audio.pause();
      audio.src = track.previewUrl || (track.source === 'audius'
        ? (await api(`/v1/audio/audius/${encodeURIComponent(track.id)}/stream`)).url
        : mediaUrl(track.mediaUrl));
      audio.onended = () => setGalleryMusicPlaying(false);
      await audio.play();
      setGalleryMusicPlaying(true);
    } catch (error) {
      logError(error);
      setGalleryMusicPlaying(false);
      toast('This sound could not be played');
    }
  }

  function clearGalleryMusic() {
    galleryAudioRef.current?.pause();
    setGalleryMusicPlaying(false);
    setStoryTrack(null);
  }

  function toggleGalleryMusic() {
    if (galleryMusicPlaying) {
      galleryAudioRef.current?.pause();
      setGalleryMusicPlaying(false);
      return;
    }
    if (storyTrack) playGalleryMusic(storyTrack);
  }

  if (view === 'camera') return <CameraView onCapture={chooseFile} onGallery={() => setView('gallery')} />;

  if (view === 'settings') return <CameraSettings onDone={() => setView('gallery')} onStory={() => { setView('gallery'); navigate('/upload?story=1'); }} onReel={() => { setView('gallery'); navigate('/upload?reel=1'); }} />;

  if (view === 'gallery') {
    const onRecents = tab === 'Camera Roll';
    const shownRecents = recents.filter((item) => !asReel || String(item.file.type).startsWith('video/'));
    const modes = [
      { key: 'text', label: 'Text', path: asStory ? '/story/text' : '/post/text' },
      { key: 'story', label: 'Story', path: '/upload?story=1' },
      { key: 'music', label: 'Music' },
      { key: 'post', label: 'Post', path: '/upload' },
    ];
    const activeMode = asStory ? 'story' : asReel ? 'reel' : 'post';
    return <main className="up-page up-gallery ig-create">
      <header className="ig-create-top">
        <button type="button" className="ig-create-x" onClick={() => goBack(navigate, '/')} aria-label="Close"><Icon name="x" size={28} /></button>
        <h1 className="ig-create-heading">Add to story</h1>
        <button type="button" className="ig-create-gear" onClick={() => setView('settings')} aria-label="Settings"><Icon name="settings" size={28} /></button>
      </header>
      <nav className="ig-create-modes" aria-label="Create type">
        {modes.map((mode) => <button key={mode.key} type="button" className={mode.key === activeMode ? 'on' : ''} onClick={() => mode.key === 'music' ? setGalleryMusicOpen(true) : navigate(mode.path, { replace: true, state: { storyTrack } })}>{mode.label}</button>)}
      </nav>
      <div className="ig-create-sub">
        <button type="button" className="ig-create-source" onClick={() => setTab(onRecents ? 'Memories' : 'Camera Roll')} aria-label="Change album">
          {onRecents ? 'Recents' : 'Memories'} <Icon name="chevron-down" size={18} />
        </button>
        {asStory && <button type="button" className="ig-create-pick" onClick={() => navigate('/story/text')} aria-label="Text story"><span className="ig-create-aa">Aa</span> Text story</button>}
        {!asStory && !asReel && <button type="button" className="ig-create-pick" onClick={() => navigate('/post/text')} aria-label="Text post"><span className="ig-create-aa">Aa</span> Text post</button>}
        {onRecents && !asReel && <button type="button" className={selectMode ? 'ig-create-select on' : 'ig-create-select'} onClick={() => { setSelectMode((on) => !on); setSelection([]); }} aria-pressed={selectMode}>{selectMode ? 'Cancel' : 'Select'}</button>}
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
      {storyTrack && <div className="ig-music-bar">
        <button type="button" className="ig-music-open" onClick={() => setGalleryMusicOpen(true)} aria-label="Change selected music">
          <span className="ig-music-disc">{storyTrack.artwork ? <img src={storyTrack.artwork} alt="" /> : <Icon name="music" size={20} />}</span>
          <span className="ig-music-text"><strong>{storyTrack.title || storyTrack.name || 'Selected sound'}</strong><small>{storyTrack.artist || storyTrack.artistName || 'Selected for your story'}</small></span>
        </button>
        <button type="button" className="ig-music-btn" onClick={toggleGalleryMusic} aria-label={galleryMusicPlaying ? 'Pause selected music' : 'Play selected music'}><Icon name={galleryMusicPlaying ? 'pause' : 'play'} size={20} /></button>
        <button type="button" className="ig-music-btn" onClick={clearGalleryMusic} aria-label="Remove selected music"><Icon name="x" size={22} /></button>
      </div>}
      {galleryMusicOpen && <MusicPicker selectedId={storyTrack?.id || null} onSelect={(item) => { setStoryTrack({ ...item }); setGalleryMusicOpen(false); playGalleryMusic(item); }} onClose={() => setGalleryMusicOpen(false)} onSettings={() => { setGalleryMusicOpen(false); setView('settings'); }} />}
      {selectMode && selection.length > 0 && <button type="button" className="up-select-next" onClick={openSelection}>Next ({selection.length})</button>}
      <input id="up-file" className="hidden" type="file" accept={asReel ? 'video/*' : ACCEPT} multiple={!asReel} onChange={(e) => { pickMany(Array.from(e.target.files || [])); e.target.value = ''; }} />
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

  function saveTextLayer(layer) {
    setTextLayers((list) => (textEdit?.index >= 0 ? list.map((l, i) => (i === textEdit.index ? layer : l)) : [...list, layer]));
    setTextEdit(null);
  }
  function deleteTextLayer() {
    setTextLayers((list) => list.filter((_, i) => i !== textEdit.index));
    setTextEdit(null);
  }
  // Only tools that work in the editor
  const rail = [
    { key: 'draw', label: 'Draw', glyph: 'pencil' },
    { key: 'sticker', label: 'Stickers', glyph: 'sticker' },
    { key: 'crop', label: 'Crop', glyph: 'crop' },
    { key: 'loop', label: 'Loop', glyph: 'infinity' },
  ];

  function railAction(key) {
    return () => {
      if (key === 'sticker') { setStickersOpen((open) => !open); setDrawMode(false); setCropOpen(false); return; }
      if (key === 'draw') { setDrawMode((on) => !on); setStickersOpen(false); setCropOpen(false); return; }
      if (key === 'loop') { const next = !loopVideo; setLoopVideo(next); setStickersOpen(false); setDrawMode(false); setCropOpen(false); toast(isVideo ? (next ? 'Video will loop in feeds' : 'Video will play once in feeds') : 'Loop applies to videos'); return; }
      if (key === 'crop') { setCropOpen((open) => !open); setStickersOpen(false); setDrawMode(false); return; }
    };
  }
  // Pointer position in photo fractions, using the same cover-fit mapping as the preview SVG.
  function photoPoint(event, svg) {
    const ctm = svg.getScreenCTM();
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y / (photoSize.h / photoSize.w))) };
  }
  const cropFrame = CROP_RATIOS[cropRatio] ?? null;

  return <main className="up-page up-editor">
    <div className="up-media">
      {textLayers.map((layer, i) => (
        <button key={i} type="button" className="up-text-layer" onClick={() => setTextEdit({ index: i, layer })} style={{ left: `${layer.x * 100}%`, top: `${layer.y * 100}%`, transform: layer.align === 'left' ? 'translate(0,-50%)' : layer.align === 'right' ? 'translate(-100%,-50%)' : 'translate(-50%,-50%)', color: layer.color, fontFamily: TEXT_FONTS[layer.font]?.family, fontWeight: TEXT_FONTS[layer.font]?.weight, textAlign: layer.align, background: layer.bg === 'box' ? 'rgba(0,0,0,.55)' : 'transparent', textShadow: layer.bg === 'box' ? 'none' : '0 2px 6px rgba(0,0,0,.5)' }} aria-label={`Edit text: ${layer.text}`}>{layer.text}</button>
      ))}
      {carousel.length > 1 && <span className="up-carousel-count">1 / {carousel.length}</span>}
      {isVideo ? <video ref={previewRef} src={preview} loop muted={!soundOn} playsInline onClick={togglePreview} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} aria-label="Preview: tap to play or pause" /> : preview && <img onLoad={(e) => setPhotoSize({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })} src={preview} alt="Selected media" style={{ filter: cssFilterFor(filterKey) }} />}
      {photoSize && !isVideo && (strokes.length > 0 || liveStroke || drawMode) && <svg className={`up-draw-layer${drawMode ? ' is-drawing' : ''}`} viewBox={`0 0 1 ${photoSize.h / photoSize.w}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true"
        onPointerDown={drawMode ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); setLiveStroke({ color: drawColor, points: [photoPoint(e, e.currentTarget)] }); } : undefined}
        onPointerMove={drawMode && liveStroke ? (e) => setLiveStroke((st) => ({ ...st, points: [...st.points, photoPoint(e, e.currentTarget)] })) : undefined}
        onPointerUp={drawMode && liveStroke ? () => { setStrokes((list) => [...list, liveStroke]); setLiveStroke(null); } : undefined}>
        {[...strokes, ...(liveStroke ? [liveStroke] : [])].map((stroke, i) => <polyline key={i} fill="none" stroke={stroke.color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" points={stroke.points.map((p) => `${p.x},${p.y * (photoSize.h / photoSize.w)}`).join(' ')} />)}
      </svg>}
      {cropFrame && <div className="up-crop-frame" style={{ aspectRatio: String(cropFrame), width: `min(100vw, ${100 * cropFrame}vh)` }} aria-hidden="true" />}
    </div>
    <header className="up-editor-top">
      <button type="button" className="up-icon" onClick={() => setView('gallery')} aria-label="Back to gallery"><Icon name="x" size={28} /></button>
      <button type="button" className="up-music" onClick={() => setMusicOpen((open) => !open)} aria-expanded={musicOpen}>
        <span className="up-music-disc" aria-hidden="true"><Icon name="music" size={14} /></span>
        <span className="up-music-title">{musicLabel}</span>
        <span className="up-music-sep" aria-hidden="true" />
        <span className="up-music-plus" aria-hidden="true"><Icon name="plus" size={18} /></span>
      </button>
      <button type="button" className="up-icon up-t-btn" onClick={() => setTextEdit({ index: -1, layer: null })} aria-label="Add text"><span className="up-t">T</span></button>
    </header>
    <nav className="up-rail" aria-label="Editing tools">
      {isVideo && <button type="button" onClick={() => setSoundOn((on) => !on)} aria-label={soundOn ? 'Mute' : 'Turn sound on'}><Icon name={soundOn ? 'volume-2' : 'volume-x'} size={24} /></button>}
      {rail.map((tool) => <button key={tool.key} type="button" onClick={railAction(tool.key)} aria-label={tool.label}><RailGlyph name={tool.glyph} /></button>)}
    </nav>
    {drawMode && <div className="up-draw-bar" role="toolbar" aria-label="Drawing">
      {TEXT_COLORS.slice(0, 6).map((color) => <button key={color} type="button" className={`up-draw-color${drawColor === color ? ' on' : ''}`} style={{ background: color }} aria-label={`Draw in ${color}`} onClick={() => setDrawColor(color)} />)}
      <button type="button" onClick={() => setStrokes((list) => list.slice(0, -1))} disabled={!strokes.length}>Undo</button>
      <button type="button" className="up-draw-done" onClick={() => setDrawMode(false)}>Done</button>
    </div>}
    {cropOpen && <div className="up-crop-panel" role="group" aria-label="Crop">
      {Object.keys(CROP_RATIOS).map((key) => <button key={key} type="button" className={cropRatio === key ? 'on' : ''} onClick={() => { setCropRatio(key); setCropOpen(false); }}>{key === 'original' ? 'Original' : key}</button>)}
    </div>}
    {stickersOpen && <div className="up-sticker-panel" role="group" aria-label="Stickers">
      {STICKERS.map((emoji) => <button key={emoji} type="button" aria-label={`Add sticker ${emoji}`} onClick={() => { setTextLayers((list) => [...list, { text: emoji, x: 0.5, y: 0.5, color: '#ffffff', font: 'sans', align: 'center', bg: 'none' }]); setStickersOpen(false); }}>{emoji}</button>)}
    </div>}
    {musicOpen && <div className="up-music-panel"><StoryAudioControls track={storyTrack} onTrack={setStoryTrack} voice={storyVoice} onVoice={setStoryVoice} /></div>}
    {textEdit && <TextEditor initial={textEdit.layer} onDone={saveTextLayer} onCancel={() => setTextEdit(null)} onDelete={textEdit.index >= 0 ? deleteTextLayer : undefined} />}
    <div className="up-filters">
      {FILTERS.map((f) => (
        <span key={f.key} className="up-filter-col">
          <button type="button" className={`up-filter-thumb${filterKey === f.key ? ' on' : ''}`} onClick={() => setFilterKey(f.key)} disabled={isVideo || !preview} aria-pressed={filterKey === f.key} aria-label={`${f.label} filter`} title={isVideo ? 'Filters are for photos' : f.label} style={{ padding: 0, cursor: 'pointer' }}>
            {preview && !isVideo && <img src={preview} alt="" style={{ filter: cssFilterFor(f.key) }} />}
          </button>
          <span className="up-filter-name">{f.label}</span>
        </span>
      ))}
    </div>
    {isVideo && preview && <div className="up-timeline-wrap">
      <div className="up-timeline" aria-hidden="true">
        <video src={preview} muted playsInline preload="metadata" />
        {durLabel && <span>{durLabel}</span>}
      </div>
    </div>}
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
