import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';

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
      if (asStory) setStoryRail({ items: [], updatedAt: 0 });
      else {
        setFeed('discover', { updatedAt: 0 });
        setFeed('following', { updatedAt: 0 });
      }
      toast(asStory ? 'Public story posted. It disappears in 24 hours.' : visibility === 'private' ? 'Post saved to Only me' : 'Post published publicly');
      navigate('/');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page create-page">
      <form className="create-composer" onSubmit={submit}>
        <header className="composer-header">
          <button type="button" className="ghost" onClick={() => navigate(-1)} aria-label="Go back">←</button>
          <div><span className="composer-eyebrow">CREATE</span><h1>{asStory ? 'Your story' : 'New post'}</h1></div>
          <span className="composer-spacer" />
        </header>
        <div className="seg composer-tabs">
          <button type="button" className={!asStory ? 'on' : ''} onClick={() => setAsStory(false)}>Post / Reel</button>
          <button type="button" className={asStory ? 'on' : ''} onClick={() => { setAsStory(true); setVisibility('public'); }}>Story · 24h</button>
        </div>
        <label className="media-picker" htmlFor="post-media">
          {preview ? (file?.type.startsWith('video/') ? <video src={preview} muted playsInline controls /> : <img src={preview} alt="Selected post preview" />) : <span className="media-picker-empty"><strong>＋</strong><b>Add photo or video</b><small>MP4, WebM, JPG, PNG or WebP · max 100 MB</small></span>}
          {preview && <span className="preview-badge">Preview</span>}
        </label>
        <input id="post-media" className="file-input" type="file" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} />
        <label className="composer-label" htmlFor="post-caption">Caption</label>
        <textarea id="post-caption" className="composer-caption" placeholder="What do you want to share?" maxLength={asStory ? 200 : 500} value={draft.caption || ''} onChange={(e) => setDraft({ caption: e.target.value })} />
        <div className="caption-count">{(draft.caption || '').length}/{asStory ? 200 : 500}</div>
        {!asStory && <section className="audience-picker"><div><strong>Who can see this post?</strong><small>Choose the audience for this post.</small></div><select aria-label="Post audience" value={visibility} onChange={(e) => setVisibility(e.target.value)}><option value="public">Public — everyone</option><option value="private">Only me — private</option></select></section>}
        {asStory && <p className="public-story-note">Stories are public and disappear after 24 hours.</p>}
        <button className="publish-button" type="submit" disabled={busy || !file}>{busy ? 'Publishing…' : asStory ? 'Share story' : visibility === 'private' ? 'Save privately' : 'Publish post'}</button>
        <p className="composer-footnote">Be respectful. Only upload content you have permission to share.</p>
      </form>
    </main>
  );
}
