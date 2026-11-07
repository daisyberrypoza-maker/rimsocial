import { trimVideo, POST_MAX_SECONDS, STORY_MAX_SECONDS } from '../lib/videoTrim.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';
import Icon from '../components/Icon.jsx';
import { mediaUrl } from '../lib/config.js';

export default function Upload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const remixId = searchParams.get('remix');
  const draft = useAppStore((s) => s.uploadDraft);
  const setDraft = useAppStore((s) => s.setUploadDraft);
  const setFeed = useAppStore((s) => s.setFeed);
  const setStoryRail = useAppStore((s) => s.setStoryRail);
  const [file, setFile] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [trimming, setTrimming] = useState(false);
  const [preview, setPreview] = useState('');
  const [asStory, setAsStory] = useState(searchParams.get('story') === '1');
  const [allowRemix, setAllowRemix] = useState(false);
  const [sourcePost, setSourcePost] = useState(null);
  const [visibility, setVisibility] = useState('public');
  const [isSponsored, setIsSponsored] = useState(false);
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorDescription, setSponsorDescription] = useState('');
  const [sponsorCta, setSponsorCta] = useState('Shop Now');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState(draft.topic || '');
  const [aiLabel, setAiLabel] = useState(Boolean(draft.aiLabel));
  const [shareToStory, setShareToStory] = useState(Boolean(draft.shareToStory));
  const [galleryTab, setGalleryTab] = useState('Edits');
  const [mentionAnchor, setMentionAnchor] = useState(null);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const captionRef = useRef(null);

  useEffect(() => {
    if (!remixId) { setSourcePost(null); return undefined; }
    let active = true;
    api(`/v1/posts/${encodeURIComponent(remixId)}`).then((item) => {
      if (!active) return;
      if (!item.allowRemix) { toast('The creator has not allowed remixing this post'); setSourcePost(null); return; }
      setSourcePost(item);
      setDraft((current) => ({ ...current, caption: item.caption ? `Remix of @${item.author?.username || 'creator'}: ` : '' }));
    }).catch((error) => { if (active) toast(error.message); });
    return () => { active = false; };
  }, [remixId, setDraft]);

  async function pickMedia(picked) {
    setRawFile(picked);
    if (!picked) { setFile(null); return; }
    if (!String(picked.type).startsWith('video/')) { setFile(picked); return; }
    setTrimming(true);
    try {
      setFile(await trimVideo(picked, POST_MAX_SECONDS));
    } catch (error) {
      setFile(null);
      setRawFile(null);
      toast(error.message);
    } finally {
      setTrimming(false);
    }
  }

  function mediaFor(maxSeconds) {
    return trimVideo(rawFile || file, maxSeconds);
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

  async function submit(e) {
    e.preventDefault();
    if (!file) return toast('Choose a photo or video first');
    if (remixId && !sourcePost) return toast('This post cannot be remixed. Choose a post whose creator allows remixing.');
    const fd = new FormData();
    fd.append('caption', draft.caption || '');
    fd.append('topic', topic.trim());
    fd.append('aiLabel', String(aiLabel));
    fd.append('allowRemix', String(!asStory && allowRemix));
    if (sourcePost) fd.append('sourcePostId', sourcePost.id);
    if (!asStory) fd.append('visibility', visibility);
    if (!asStory && isSponsored) {
      if (!sponsorName.trim()) return toast('Enter the sponsor or business name');
      if (!/^https?:\/\//i.test(sponsorUrl.trim())) return toast('Enter a valid sponsor destination URL');
      fd.append('isSponsored', 'true');
      fd.append('sponsorName', sponsorName.trim());
      fd.append('sponsorDescription', sponsorDescription.trim());
      fd.append('sponsorCta', sponsorCta.trim() || 'Shop Now');
      fd.append('sponsorUrl', sponsorUrl.trim());
    }
    setBusy(true);
    try {
      fd.append('media', asStory ? await mediaFor(STORY_MAX_SECONDS) : file);
      await api(asStory ? '/v1/stories' : '/v1/posts', { method: 'POST', body: fd });
      if (!asStory && shareToStory) {
        const storyFd = new FormData();
        storyFd.append('media', await mediaFor(STORY_MAX_SECONDS));
        storyFd.append('caption', (draft.caption || '').slice(0, 200));
        try { await api('/v1/stories', { method: 'POST', body: storyFd }); }
        catch (storyError) { toast('Post published, but Story sharing failed: ' + storyError.message); }
      }
      setDraft({ caption: '', topic: '', aiLabel: false, shareToStory: false });
      setTopic(''); setAiLabel(false); setShareToStory(false);
      setFile(null);
      setRawFile(null);
      setSourcePost(null);
      if (asStory) setStoryRail({ items: [], updatedAt: 0 });
      else {
        setFeed('discover', { updatedAt: 0 });
        setFeed('following', { updatedAt: 0 });
      }
      toast(asStory ? 'Public story posted. It disappears in 24 hours.' : visibility === 'public' ? 'Post published publicly' : 'Post saved as Only me');
      navigate('/');
    } catch (err) { toast(err.message); }
    finally { setBusy(false); }
  }

  return <main className="ig-compose cmp">
    <form className="ig-compose-form" onSubmit={submit}>
      <header className="ig-compose-top">
        <button type="button" className="ig-icon-btn" onClick={() => navigate(-1)} aria-label="Close"><Icon name="x" size={24} /></button>
        <h2>{asStory ? 'New story' : 'New post'}</h2>
        <button type="submit" className="ig-share" disabled={busy || trimming || !file}>{busy ? 'Sharing…' : trimming ? 'Trimming…' : 'Share'}</button>
      </header>

      {sourcePost && <div className="ig-remix">
        <strong>Remixing @{sourcePost.author?.username || 'creator'}</strong>
        <p>Your new post will credit the original creator.</p>
        <div className="ig-remix-media">{sourcePost.kind === 'video' ? <video src={mediaUrl(sourcePost.mediaUrl)} controls playsInline /> : <img src={mediaUrl(sourcePost.mediaUrl)} alt="Original post being remixed" />}</div>
      </div>}

      <div className="cmp-chips" role="tablist" aria-label="Media sources">
        {['Edits', 'Drafts', 'Templates'].map((tab) => <button type="button" role="tab" key={tab} aria-selected={galleryTab === tab} className={galleryTab === tab ? 'on' : ''} onClick={() => { setGalleryTab(tab); if (tab === 'Drafts') toast('Draft saved on this device'); }}>{tab}</button>)}
      </div>
      {galleryTab === 'Templates' && <div className="cmp-templates">{[{ label: 'Behind the scenes', caption: 'Behind the scenes 🎬 ' }, { label: 'Quick tutorial', caption: 'Here is how I do it: ' }, { label: 'My latest', caption: 'My latest update ✨ ' }].map((item) => <button key={item.label} type="button" className="ghost small" onClick={() => { setDraft({ ...(draft || {}), caption: item.caption, topic, aiLabel, shareToStory }); setGalleryTab('Edits'); }}>{item.label}</button>)}</div>}
      {galleryTab === 'Drafts' && <p className="ig-note">Your caption and settings are saved on this device. Choose Edits to continue.</p>}
      {galleryTab === 'Edits' && <>
        <div className="cmp-recents"><span>Recents <Icon name="chevron-down" size={18} /></span><button type="button" className="cmp-select" onClick={() => document.getElementById('post-media-file')?.click()}>Select</button></div>
        <div className="cmp-grid">
          <button type="button" className="cmp-tile cmp-pick" onClick={() => document.getElementById('post-media-file')?.click()} aria-label="Choose a photo or video"><Icon name="camera" size={30} /></button>
          {preview && <div className="cmp-tile cmp-selected">{file?.type.startsWith('video/') ? <video src={preview} muted playsInline /> : <img src={preview} alt="Selected media" />}</div>}
        </div>
      </>}
      <input id="post-media-file" className="hidden" type="file" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,image/gif" onChange={(e) => pickMedia(e.target.files?.[0] || null)} />
      <div className="cmp-modes" role="tablist" aria-label="Share type">
        <button type="button" role="tab" aria-selected={!asStory} className={!asStory ? 'on' : ''} onClick={() => setAsStory(false)}>POST</button>
        <button type="button" role="tab" aria-selected={asStory} className={asStory ? 'on' : ''} onClick={() => { setAsStory(true); setVisibility('public'); }}>STORY</button>
      </div>

      <div className="ig-caption">
        <textarea ref={captionRef} id="post-caption" aria-label={asStory ? 'Story caption' : 'Write a caption'} placeholder={asStory ? 'Add a story caption…' : 'Write a caption… add #hashtags and @mentions'} maxLength={asStory ? 200 : 500} value={draft.caption || ''} onChange={handleCaptionChange} rows={4} />
        <span className="ig-count">{(draft.caption || '').length}/{asStory ? 200 : 500}</span>
      </div>
      {!asStory && mentionAnchor && (mentionLoading || mentionSuggestions.length > 0) && <div className="ig-mentions" role="listbox" aria-label="People to mention">
        {mentionLoading ? <p className="ig-empty">Finding people…</p> : mentionSuggestions.map((person) => <button type="button" key={person.id} role="option" className="ig-mention" onClick={() => insertMention(person)}><span className="ig-mention-avatar">{(person.displayName || person.username || '?').slice(0, 1).toUpperCase()}</span><span><strong>{person.username}</strong><small>{person.displayName}</small></span></button>)}
      </div>}

      <div className="ig-rows">
        <label className="ig-row">
          <span className="ig-row-label">Topic</span>
          <input id="post-topic" value={topic} maxLength={60} placeholder="Fashion, comedy, tech…" onChange={(e) => { setTopic(e.target.value); setDraft({ ...(draft || {}), topic: e.target.value, aiLabel, shareToStory }); }} />
        </label>
        {!asStory && <div className="ig-row ig-row-static"><span className="ig-row-label">Who can see this</span>
          <div className="ig-choice">
            <label className={visibility === 'public' ? 'on' : ''}><input type="radio" name="visibility" value="public" checked={visibility === 'public'} onChange={() => setVisibility('public')} />Public</label>
            <label className={visibility === 'private' ? 'on' : ''}><input type="radio" name="visibility" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')} />Only me</label>
          </div>
        </div>}
        {!asStory && <label className="ig-row"><span className="ig-row-label">Share to story</span><input type="checkbox" className="ig-toggle" checked={shareToStory} onChange={(e) => { setShareToStory(e.target.checked); setDraft({ ...(draft || {}), topic, aiLabel, shareToStory: e.target.checked }); }} /></label>}
        {!asStory && <label className="ig-row"><span className="ig-row-label">Allow remixing</span><input type="checkbox" className="ig-toggle" checked={allowRemix} onChange={(e) => setAllowRemix(e.target.checked)} /></label>}
        {!asStory && <label className="ig-row"><span className="ig-row-label">AI-generated or AI-altered</span><input type="checkbox" className="ig-toggle" checked={aiLabel} onChange={(e) => { setAiLabel(e.target.checked); setDraft({ ...(draft || {}), topic, aiLabel: e.target.checked, shareToStory }); }} /></label>}
        {!asStory && visibility === 'public' && <label className="ig-row"><span className="ig-row-label">Paid partnership</span><input type="checkbox" className="ig-toggle" checked={isSponsored} onChange={(e) => setIsSponsored(e.target.checked)} /></label>}
      </div>

      {!asStory && visibility === 'public' && isSponsored && <div className="ig-sponsor">
        <p>Disclose a business or paid partner. Your post shows an Ad label.</p>
        <label>Sponsor or business name<input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} maxLength={100} placeholder="Business name" /></label>
        <label>Short description<input value={sponsorDescription} onChange={(e) => setSponsorDescription(e.target.value)} maxLength={200} placeholder="What is being promoted?" /></label>
        <label>Call-to-action label<select value={sponsorCta} onChange={(e) => setSponsorCta(e.target.value)}><option>Shop Now</option><option>Learn More</option><option>Sign Up</option><option>Contact Us</option><option>Download</option></select></label>
        <label>Destination URL<input type="url" value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://example.com" required={isSponsored} /></label>
      </div>}

      {asStory && <p className="ig-note">Stories are public and disappear after 24 hours.</p>}
      {!asStory && <p className="ig-note">{visibility === 'public' ? 'Your post is visible to everyone.' : 'Only you can see this post.'}</p>}
    </form>
  </main>;
}
