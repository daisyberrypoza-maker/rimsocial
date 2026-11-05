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
  const [asStory, setAsStory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(e) {
    e.preventDefault();
    if (!file) return toast('Choose a photo or video first');
    const fd = new FormData();
    fd.append('media', file);
    fd.append('caption', draft.caption || '');
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
      toast(asStory ? 'Story posted. It disappears in 24 hours.' : 'Post published');
      navigate('/');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  const isVideo = file?.type?.startsWith('video/');
  const maxCaption = asStory ? 200 : 500;

  return (
    <form className="panel upload upload-composer" onSubmit={submit}>
      <div className="upload-heading">
        <div>
          <p className="upload-eyebrow">CREATE</p>
          <h2>{asStory ? 'Create a story' : 'Create a post'}</h2>
          <p className="muted">Share a moment with your community.</p>
        </div>
      </div>

      <div className="seg" role="group" aria-label="Content type">
        <button type="button" className={!asStory ? 'on' : ''} onClick={() => setAsStory(false)}>Post</button>
        <button type="button" className={asStory ? 'on' : ''} onClick={() => setAsStory(true)}>Story · 24h</button>
      </div>

      <label className="upload-picker">
        <input
          type="file"
          accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          aria-label="Choose photo or video"
        />
        <span className="upload-picker-icon" aria-hidden="true">＋</span>
        <strong>{file ? 'Change photo or video' : 'Choose photo or video'}</strong>
        <small>{file ? file.name : 'JPG, PNG, WEBP, MP4 or WEBM · up to 100 MB'}</small>
      </label>

      {file && previewUrl && (
        <div className="upload-preview">
          <div className="upload-preview-head">
            <strong>Preview</strong>
            <button type="button" className="ghost small" onClick={() => setFile(null)}>Remove</button>
          </div>
          {isVideo
            ? <video src={previewUrl} controls playsInline preload="metadata" />
            : <img src={previewUrl} alt="Selected post preview" />}
          <small>{(file.size / (1024 * 1024)).toFixed(1)} MB · {isVideo ? 'Video' : 'Photo'}</small>
        </div>
      )}

      <label className="upload-caption-label" htmlFor="post-caption">Caption</label>
      <textarea
        id="post-caption"
        className="upload-caption"
        placeholder="Write a caption… Add #hashtags to help people discover your post."
        maxLength={maxCaption}
        rows={4}
        value={draft.caption || ''}
        onChange={(e) => setDraft({ caption: e.target.value })}
      />
      <div className="upload-caption-footer">
        <small className="muted">Your caption is saved while you type.</small>
        <small className={String(draft.caption || '').length >= maxCaption ? 'upload-limit reached' : 'upload-limit'}>
          {String(draft.caption || '').length}/{maxCaption}
        </small>
      </div>

      <button className="upload-submit" type="submit" disabled={busy || !file}>
        {busy ? 'Publishing…' : asStory ? 'Share story' : 'Publish post'}
      </button>
    </form>
  );
}
