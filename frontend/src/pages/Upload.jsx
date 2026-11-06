import { useEffect, useState } from 'react';
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
  const [preview, setPreview] = useState('');
  const [asStory, setAsStory] = useState(false);
  const [allowRemix, setAllowRemix] = useState(false);
  const [sourcePost, setSourcePost] = useState(null);
  const [visibility, setVisibility] = useState('public');
  const [isSponsored, setIsSponsored] = useState(false);
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorDescription, setSponsorDescription] = useState('');
  const [sponsorCta, setSponsorCta] = useState('Shop Now');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [galleryTab, setGalleryTab] = useState('Edits');
  const [topic, setTopic] = useState(draft.topic || '');
  const [aiLabel, setAiLabel] = useState(Boolean(draft.aiLabel));
  const [shareToStory, setShareToStory] = useState(Boolean(draft.shareToStory));
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const templates = [{ label: 'Behind the scenes', caption: 'Behind the scenes 🎬 ' }, { label: 'Quick tutorial', caption: 'Here is how I do it: ' }, { label: 'My latest', caption: 'My latest update ✨ ' }];

  // Preserve all composer fields when one field changes; the store setter replaces the draft object.
  function updateDraft(patch) {
    setDraft({ ...draft, ...patch });
  }

  useEffect(() => {
    const query = mentionQuery.trim().replace(/^@/, '');
    if (!query) { setMentionResults([]); return undefined; }
    let active = true;
    api(`/v1/search?q=${encodeURIComponent(query)}&type=people`).then((r) => { if (active) setMentionResults((r.people || []).slice(0, 6)); }).catch(() => { if (active) setMentionResults([]); });
    return () => { active = false; };
  }, [mentionQuery]);

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

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(e) {
    e.preventDefault();
    if (!file) return toast('Choose a photo or video first');
    if (remixId && !sourcePost) return toast('This post cannot be remixed. Choose a post whose creator allows remixing.');
    const fd = new FormData();
    fd.append('media', file);
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
      await api(asStory ? '/v1/stories' : '/v1/posts', { method: 'POST', body: fd });
      if (!asStory && shareToStory) {
        const storyFd = new FormData();
        storyFd.append('media', file);
        storyFd.append('caption', (draft.caption || '').slice(0, 200));
        try { await api('/v1/stories', { method: 'POST', body: storyFd }); }
        catch (storyError) { toast('Post published, but sharing to Story failed: ' + storyError.message); }
      }
      setDraft({ caption: '', topic: '', aiLabel: false, shareToStory: false });
      setTopic(''); setAiLabel(false); setShareToStory(false);
      setFile(null);
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

  return <main className="page upload-page">
    <form className="panel upload upload-refresh" onSubmit={submit}>
      <header className="upload-heading">
        <button type="button" className="icon-button" onClick={() => navigate(-1)} aria-label="Go back"><Icon name="arrow-left" size={21} /></button>
        <div><h2>{asStory ? 'New public story' : 'Create a post'}</h2><p className="muted">Share a moment with your community</p></div>
      </header>
      {sourcePost && <div className="panel remix-source-card"><strong>Remixing @{sourcePost.author?.username || 'creator'}</strong><p className="muted">Your new post will credit the original creator.</p><div className="remix-source-media">{sourcePost.kind === 'video' ? <video src={mediaUrl(sourcePost.mediaUrl)} controls playsInline /> : <img src={mediaUrl(sourcePost.mediaUrl)} alt="Original post being remixed" />}</div></div>}
      <nav className="seg upload-gallery-tabs" aria-label="Media gallery sections">
        {['Edits', 'Drafts', 'Templates'].map((tab) => <button key={tab} type="button" className={galleryTab === tab ? 'on' : ''} onClick={() => {
          setGalleryTab(tab);
          if (tab === 'Drafts') { setDraft({ caption: draft.caption || '', topic, aiLabel, shareToStory }); toast('Draft saved on this device'); }
        }}>{tab}</button>)}
      </nav>
      {galleryTab === 'Templates' && <div className="upload-template-grid">{templates.map((item) => <button key={item.label} type="button" className="ghost small" onClick={() => { setDraft({ caption: item.caption, topic, aiLabel, shareToStory }); setGalleryTab('Edits'); }}>{item.label}</button>)}</div>}
      {galleryTab === 'Drafts' && <p className="muted upload-draft-note">Your caption and composer settings are saved on this device. Choose Edits to continue creating.</p>}
      <div className="seg upload-kind">
        <button type="button" className={!asStory ? 'on' : ''} onClick={() => setAsStory(false)}>Post / Reel</button>
        <button type="button" className={asStory ? 'on' : ''} onClick={() => { setAsStory(true); setVisibility('public'); }}>Story · 24h</button>
      </div>

      {preview ? <div className="upload-preview-wrap">
        {file?.type.startsWith('video/') ? <video className="upload-preview" src={preview} controls playsInline /> : <img className="upload-preview" src={preview} alt="Selected post preview" />}
        <button type="button" className="ghost small upload-change" onClick={() => document.getElementById('post-media-file')?.click()}>Change cover / media</button>
      </div> : <button type="button" className="upload-picker" onClick={() => document.getElementById('post-media-file')?.click()}>
        <span className="upload-picker-icon">＋</span><strong>Add photo or video</strong><small>MP4, WebM, JPG, PNG or WebP</small>
      </button>}
      <input id="post-media-file" className="hidden" type="file" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />

      <label className="upload-label" htmlFor="post-topic">Add topic</label>
      <input id="post-topic" className="upload-topic-input" value={topic} maxLength={60} placeholder="e.g. Fashion, Comedy, Tech" onChange={(e) => { setTopic(e.target.value); setDraft({ caption: draft.caption || '', topic: e.target.value, aiLabel, shareToStory }); }} />
      <label className="upload-label" htmlFor="mention-search">Add mention</label>
      <input id="mention-search" className="upload-topic-input" value={mentionQuery} maxLength={32} placeholder="Search username" onChange={(e) => setMentionQuery(e.target.value)} />
      {mentionResults.length > 0 && <div className="upload-mention-results">{mentionResults.map((person) => <button key={person.id} type="button" className="ghost small" onClick={() => { const current = draft.caption || ''; const mention = '@' + person.username; setDraft({ caption: current + (current && !current.endsWith(' ') ? ' ' : '') + mention + ' ', topic, aiLabel, shareToStory }); setMentionQuery(''); setMentionResults([]); }}>{person.displayName || person.username} · @{person.username}</button>)}</div>}
      <label className="upload-label" htmlFor="post-caption">Description</label>
      <textarea id="post-caption" className="upload-caption" placeholder={asStory ? 'Add a story caption…' : 'Add a description, #hashtags and @mentions…'} maxLength={asStory ? 200 : 500} value={draft.caption || ''} onChange={(e) => setDraft({ caption: e.target.value })} rows={4} />
      <div className="upload-caption-meta"><span>Use #hashtags to help people discover your post</span><span>{(draft.caption || '').length}/{asStory ? 200 : 500}</span></div>

      {!asStory && <fieldset className="upload-privacy">
        <legend>Who can see this post?</legend>
        <label className={visibility === 'public' ? 'selected' : ''}><input type="radio" name="visibility" value="public" checked={visibility === 'public'} onChange={() => setVisibility('public')} /><span><strong>🌎 Public</strong><small>Everyone can discover and view this post.</small></span></label>
        <label className={visibility === 'private' ? 'selected' : ''}><input type="radio" name="visibility" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')} /><span><strong>🔒 Only me</strong><small>Only you can view this post.</small></span></label>
      </fieldset>}
      {!asStory && visibility === 'public' && <fieldset className="upload-privacy sponsor-setup">
        <legend>Paid partnership / sponsored post</legend>
        <label className={isSponsored ? 'selected' : ''}>
          <input type="checkbox" checked={isSponsored} onChange={(e) => setIsSponsored(e.target.checked)} />
          <span><strong>Show an Ad label</strong><small>Disclose when this post promotes a business or paid partner.</small></span>
        </label>
        {isSponsored && <div className="sponsor-fields">
          <label>Sponsor or business name<input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} maxLength={100} placeholder="Business name" /></label>
          <label>Short description<input value={sponsorDescription} onChange={(e) => setSponsorDescription(e.target.value)} maxLength={200} placeholder="What is being promoted?" /></label>
          <label>Call-to-action label<select value={sponsorCta} onChange={(e) => setSponsorCta(e.target.value)}><option>Shop Now</option><option>Learn More</option><option>Sign Up</option><option>Contact Us</option><option>Download</option></select></label>
          <label>Destination URL<input type="url" value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://example.com" required={isSponsored} /></label>
        </div>}
      </fieldset>}
      {!asStory && <fieldset className="upload-privacy composer-options">
        <legend>More sharing options</legend>
        <label className={shareToStory ? 'selected' : ''}><input type="checkbox" checked={shareToStory} onChange={(e) => { setShareToStory(e.target.checked); setDraft({ caption: draft.caption || '', topic, aiLabel, shareToStory: e.target.checked }); }} /><span><strong>Share to Story</strong><small>Also publish this media as a public 24-hour Story.</small></span></label>
        <label className={aiLabel ? 'selected' : ''}><input type="checkbox" checked={aiLabel} onChange={(e) => { setAiLabel(e.target.checked); setDraft({ caption: draft.caption || '', topic, aiLabel: e.target.checked, shareToStory }); }} /><span><strong>AI-generated or AI-altered</strong><small>Mark this post when realistic media was generated or materially altered by AI.</small></span></label>
      </fieldset>}
      {!asStory && <fieldset className="upload-privacy remix-permission"><legend>Remix permissions</legend><label className={allowRemix ? 'selected' : ''}><input type="checkbox" checked={allowRemix} onChange={(e) => setAllowRemix(e.target.checked)} /><span><strong>Allow others to remix this post</strong><small>Other creators can use this post as the source for a new, attributed post.</small></span></label></fieldset>}
      {asStory && <p className="upload-public-note">🌎 Stories are public and expire after 24 hours.</p>}
      <button className="upload-submit" type="submit" disabled={busy || !file}>{busy ? 'Publishing…' : asStory ? 'Share public story' : visibility === 'public' ? 'Publish publicly' : 'Save · Only me'}</button>
    </form>
  </main>;
}
