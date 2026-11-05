import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';
import Icon from '../components/Icon.jsx';

const DRAFT_KEY = 'rimsocial-upload-draft-v1';

export default function Upload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draft = useAppStore((s) => s.uploadDraft);
  const setDraft = useAppStore((s) => s.setUploadDraft);
  const setFeed = useAppStore((s) => s.setFeed);
  const setStoryRail = useAppStore((s) => s.setStoryRail);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [asStory, setAsStory] = useState(false);
  const [shareToStory, setShareToStory] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [topic, setTopic] = useState('');
  const [allowRemix, setAllowRemix] = useState(true);
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  const [pickerTab, setPickerTab] = useState('Recent');
  const [isSponsored, setIsSponsored] = useState(false);
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorDescription, setSponsorDescription] = useState('');
  const [sponsorCta, setSponsorCta] = useState('Shop Now');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [remixPost, setRemixPost] = useState(null);
  const [remixLoading, setRemixLoading] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const remixId = searchParams.get('remix');
    if (!remixId) return;
    setRemixLoading(true);
    api('/v1/posts/' + encodeURIComponent(remixId))
      .then((post) => {
        if (!post.allowRemix) { toast('The creator has disabled remixing'); navigate(-1); return; }
        setRemixPost(post);
        setDraft({ caption: post.caption ? 'Remix of @' + (post.author?.username || 'creator') + ': ' + post.caption : 'Remix of @' + (post.author?.username || 'creator') });
        setTopic(post.topic || '');
      })
      .catch((err) => toast(err.message || 'Could not load original post'))
      .finally(() => setRemixLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const caption = draft.caption || '';
  const mentions = useMemo(() => [...new Set(caption.match(/@[a-zA-Z0-9_.]{1,32}/g) || [])], [caption]);

  function saveDraft() {
    const data = { caption, topic, visibility, allowRemix, isAiGenerated, savedAt: Date.now() };
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
    toast('Draft saved on this device');
  }
  function loadDraft() {
    try {
      const data = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
      if (!data) return toast('No saved draft on this device yet');
      setDraft({ caption: data.caption || '' }); setTopic(data.topic || '');
      setVisibility(data.visibility || 'public'); setAllowRemix(data.allowRemix !== false);
      setIsAiGenerated(Boolean(data.isAiGenerated)); toast('Draft restored');
    } catch { toast('Could not read saved draft'); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return toast('Choose a photo or video first');
    const fd = new FormData(); fd.append('media', file); fd.append('caption', caption);
    if (!asStory) {
      fd.append('visibility', visibility); fd.append('topic', topic);
      fd.append('allowRemix', String(allowRemix)); fd.append('isAiGenerated', String(isAiGenerated));
    }
    if (!asStory && visibility === 'public' && isSponsored) {
      if (!sponsorName.trim()) return toast('Enter the sponsor or business name');
      if (!/^https?:\/\//i.test(sponsorUrl.trim())) return toast('Enter a valid sponsor destination URL');
      fd.append('isSponsored', 'true'); fd.append('sponsorName', sponsorName.trim());
      fd.append('sponsorDescription', sponsorDescription.trim()); fd.append('sponsorCta', sponsorCta.trim() || 'Shop Now');
      fd.append('sponsorUrl', sponsorUrl.trim());
    }
    setBusy(true);
    try {
      if (asStory) {
        const sf = new FormData(); sf.append('media', file); sf.append('caption', caption.slice(0, 200));
        await api('/v1/stories', { method: 'POST', body: sf });
      } else {
        await api('/v1/posts', { method: 'POST', body: fd });
        if (shareToStory && visibility === 'public') {
          const sf = new FormData(); sf.append('media', file); sf.append('caption', caption.slice(0, 200));
          await api('/v1/stories', { method: 'POST', body: sf });
        }
      }
      setDraft({ caption: '' }); try { window.localStorage.removeItem(DRAFT_KEY); } catch {}
      setFile(null); if (asStory || shareToStory) setStoryRail({ items: [], updatedAt: 0 });
      setFeed('discover', { updatedAt: 0 }); setFeed('following', { updatedAt: 0 });
      toast(asStory ? 'Public story posted. It disappears in 24 hours.' : shareToStory ? 'Post published and shared to your story' : visibility === 'public' ? 'Post published publicly' : 'Post saved as Only me');
      navigate('/');
    } catch (err) { toast(err.message); }
    finally { setBusy(false); }
  }

  return <main className="page upload-page">
    <form className="panel upload upload-refresh" onSubmit={submit}>
      <header className="upload-heading">
        <button type="button" className="icon-button" onClick={() => navigate(-1)} aria-label="Go back"><Icon name="chevron" size={21} /></button>
        <div><h2>{asStory ? 'New public story' : remixPost ? 'Create a remix' : 'Create a post'}</h2><p className="muted">{remixPost ? 'Make your version while crediting the original creator' : 'Share a moment with your community'}</p></div>
      </header>
      <div className="seg upload-kind">
        <button type="button" className={!asStory ? 'on' : ''} onClick={() => setAsStory(false)}>Post / Reel</button>
        <button type="button" className={asStory ? 'on' : ''} onClick={() => { setAsStory(true); setVisibility('public'); }}>Story · 24h</button>
      </div>
      <section className="reel-picker">
        <div className="reel-picker-head"><strong>{file ? 'Selected media' : 'Add to your post'}</strong><span>Photo or video</span></div>
        <div className="reel-picker-tabs" role="tablist" aria-label="Media picker tabs">
          {['Recent', 'Edits', 'Drafts', 'Templates'].map((tab) => <button key={tab} type="button" role="tab" aria-selected={pickerTab === tab} className={pickerTab === tab ? 'on' : ''} onClick={() => { setPickerTab(tab); if (tab === 'Drafts') loadDraft(); if (tab === 'Templates') setDraft({ caption: caption || '✨ A moment from my day…' }); }}>{tab}</button>)}
        </div>
        {preview ? <div className="upload-preview-wrap">
          {file?.type.startsWith('video/') ? <video className="upload-preview" src={preview} controls playsInline /> : <img className="upload-preview" src={preview} alt="Selected post preview" />}
          <button type="button" className="ghost small upload-change" onClick={() => document.getElementById('post-media-file')?.click()}>Change media</button>
        </div> : <button type="button" className="upload-picker" onClick={() => document.getElementById('post-media-file')?.click()}>
          <span className="upload-picker-icon">＋</span><strong>{pickerTab === 'Templates' ? 'Choose media for a template' : pickerTab === 'Edits' ? 'Choose an edited photo or video' : 'Choose from device'}</strong><small>Open your device gallery · MP4, WebM, JPG, PNG or WebP</small>
        </button>}
        <input id="post-media-file" className="hidden" type="file" accept="video/*,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        {remixLoading && <p className="muted">Loading original post…</p>}
        {remixPost && <p className="remix-credit">Remixing <strong>@{remixPost.author?.username || 'creator'}</strong> · Original creator credit will be included in the caption.</p>}
      </section>
      <label className="upload-label" htmlFor="post-caption">Description</label>
      <textarea id="post-caption" className="upload-caption" placeholder={asStory ? 'Add a story caption…' : 'Write a caption, add #hashtags or @mentions…'} maxLength={asStory ? 200 : 500} value={caption} onChange={(e) => setDraft({ caption: e.target.value })} rows={4} />
      <div className="upload-caption-meta"><span>Use #hashtags and @mentions to help people discover your post</span><span>{caption.length}/{asStory ? 200 : 500}</span></div>
      {mentions.length > 0 && <div className="mention-preview"><span>Mentions in caption</span>{mentions.map((mention) => <span key={mention} className="mention-chip">{mention}</span>)}</div>}
      {!asStory && <div className="upload-extra-fields">
        <label className="upload-label" htmlFor="post-topic">Add topic</label>
        <input id="post-topic" value={topic} maxLength={64} onChange={(e) => setTopic(e.target.value.replace(/^#/, ''))} placeholder="e.g. Fashion, Comedy, Tech" />
        <p className="muted">A topic helps people find posts they care about.</p>
      </div>}
      {!asStory && <fieldset className="upload-privacy">
        <legend>Who can see this post?</legend>
        <label className={visibility === 'public' ? 'selected' : ''}><input type="radio" name="visibility" value="public" checked={visibility === 'public'} onChange={() => setVisibility('public')} /><span><strong>🌎 Public</strong><small>Everyone can discover and view this post.</small></span></label>
        <label className={visibility === 'private' ? 'selected' : ''}><input type="radio" name="visibility" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')} /><span><strong>🔒 Only me</strong><small>Only you can view this post.</small></span></label>
      </fieldset>}
      {!asStory && visibility === 'public' && <fieldset className="upload-privacy">
        <legend>Sharing options</legend>
        <label className={shareToStory ? 'selected' : ''}><input type="checkbox" checked={shareToStory} onChange={(e) => setShareToStory(e.target.checked)} /><span><strong>Share to Story</strong><small>Publish this media to your public story for 24 hours too.</small></span></label>
        <label className={allowRemix ? 'selected' : ''}><input type="checkbox" checked={allowRemix} onChange={(e) => setAllowRemix(e.target.checked)} /><span><strong>Allow Remix</strong><small>Let other people start a remix using this post.</small></span></label>
        <label className={isAiGenerated ? 'selected' : ''}><input type="checkbox" checked={isAiGenerated} onChange={(e) => setIsAiGenerated(e.target.checked)} /><span><strong>AI-generated label</strong><small>Disclose when the media was generated or significantly edited with AI.</small></span></label>
      </fieldset>}
      {!asStory && visibility === 'public' && <fieldset className="upload-privacy sponsor-setup">
        <legend>Paid partnership / sponsored post</legend>
        <label className={isSponsored ? 'selected' : ''}><input type="checkbox" checked={isSponsored} onChange={(e) => setIsSponsored(e.target.checked)} /><span><strong>Show an Ad label</strong><small>Disclose when this post promotes a business or paid partner.</small></span></label>
        {isSponsored && <div className="sponsor-fields">
          <label>Sponsor or business name<input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} maxLength={100} placeholder="Business name" /></label>
          <label>Short description<input value={sponsorDescription} onChange={(e) => setSponsorDescription(e.target.value)} maxLength={200} placeholder="What is being promoted?" /></label>
          <label>Call-to-action label<select value={sponsorCta} onChange={(e) => setSponsorCta(e.target.value)}><option>Shop Now</option><option>Learn More</option><option>Sign Up</option><option>Contact Us</option><option>Download</option></select></label>
          <label>Destination URL<input type="url" value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://example.com" required={isSponsored} /></label>
        </div>}
      </fieldset>}
      {asStory && <p className="upload-public-note">🌎 Stories are public and expire after 24 hours.</p>}
      <div className="upload-footer-actions"><button type="button" className="ghost" onClick={saveDraft}>Save draft</button><button className="upload-submit" type="submit" disabled={busy || !file}>{busy ? 'Publishing…' : asStory ? 'Share public story' : visibility === 'public' ? 'Publish publicly' : 'Save · Only me'}</button></div>
    </form>
  </main>;
}