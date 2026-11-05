import { useState } from 'react';
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

  async function submit(e) {
    e.preventDefault();
    if (!file) return toast('Choose a file first');
    const fd = new FormData();
    fd.append('media', file);
    fd.append('caption', draft.caption || '');
    setBusy(true);
    try {
      await api(asStory ? '/v1/stories' : '/v1/posts', { method: 'POST', body: fd });
      setDraft({ caption: '' });
      if (asStory) setStoryRail({ items: [], updatedAt: 0 });
      else {
        setFeed('discover', { updatedAt: 0 });
        setFeed('following', { updatedAt: 0 });
      }
      toast(asStory ? 'Story posted. It disappears in 24 hours.' : 'Posted');
      navigate('/');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel upload" onSubmit={submit}>
      <h2>{asStory ? 'New story' : 'New post'}</h2>

      <div className="seg">
        <button type="button" className={!asStory ? 'on' : ''} onClick={() => setAsStory(false)}>Post</button>
        <button type="button" className={asStory ? 'on' : ''} onClick={() => setAsStory(true)}>Story (24h)</button>
      </div>

      <input
        type="file"
        accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
        onChange={(e) => setFile(e.target.files[0] || null)}
      />
      <input
        placeholder="Caption"
        maxLength={asStory ? 200 : 500}
        value={draft.caption}
        onChange={(e) => setDraft({ caption: e.target.value })}
      />
      <p className="muted">Your caption is saved while you type. Choose the file again after a reload.</p>
      <button type="submit" disabled={busy}>{busy ? 'Uploading…' : asStory ? 'Share story' : 'Post'}</button>
    </form>
  );
}
