import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';
import Icon from '../components/Icon.jsx';

export default function Upload() {
  const navigate = useNavigate();
  const draft = useAppStore((s) => s.uploadDraft);
  const setDraft = useAppStore((s) => s.setUploadDraft);
  const setFeed = useAppStore((s) => s.setFeed);
  const setStoryRail = useAppStore((s) => s.setStoryRail);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [asStory, setAsStory] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(e) {
    e.preventDefault();
    if (!file) return toast('Choose a photo or video first');
    const fd = new FormData();
    fd.append('media', file);
    fd.append('caption', draft.caption || '');
    if (!asStory) fd.append('visibility', visibility);
    setBusy(true);
    try {
      await api(asStory ? '/v1/stories' : '/v1/posts', { method: 'POST', body: fd });
      setDraft({ caption: '' });
      setFile(null);
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

      <label className="upload-label" htmlFor="post-caption">Description</label>
      <textarea id="post-caption" className="upload-caption" placeholder={asStory ? 'Add a story caption…' : 'Add a description, #hashtags and @mentions…'} maxLength={asStory ? 200 : 500} value={draft.caption || ''} onChange={(e) => setDraft({ caption: e.target.value })} rows={4} />
      <div className="upload-caption-meta"><span>Use #hashtags to help people discover your post</span><span>{(draft.caption || '').length}/{asStory ? 200 : 500}</span></div>

      {!asStory && <fieldset className="upload-privacy">
        <legend>Who can see this post?</legend>
        <label className={visibility === 'public' ? 'selected' : ''}><input type="radio" name="visibility" value="public" checked={visibility === 'public'} onChange={() => setVisibility('public')} /><span><strong>🌎 Public</strong><small>Everyone can discover and view this post.</small></span></label>
        <label className={visibility === 'private' ? 'selected' : ''}><input type="radio" name="visibility" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')} /><span><strong>🔒 Only me</strong><small>Only you can view this post.</small></span></label>
      </fieldset>}
      {asStory && <p className="upload-public-note">🌎 Stories are public and expire after 24 hours.</p>}
      <button className="upload-submit" type="submit" disabled={busy || !file}>{busy ? 'Publishing…' : asStory ? 'Share public story' : visibility === 'public' ? 'Publish publicly' : 'Save · Only me'}</button>
    </form>
  </main>;
}
