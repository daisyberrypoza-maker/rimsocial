import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';
import { logError } from '../toast.js';

// Edit profile, laid out like the reference: avatar with "Edit picture or avatar", then the fields.
// Saves name, bio, website and city. A failed save says so.
export default function EditProfile() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.user);
  const setSession = useAppStore((s) => s.setSession);
  const token = useAppStore((s) => s.token);
  const fileRef = useRef(null);
  const [form, setForm] = useState({ displayName: '', bio: '', website: '', city: '' });
  const [avatarUrl, setAvatarUrl] = useState(me?.avatarUrl || '');
  const [username, setUsername] = useState(me?.username || '');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/v1/users/me')
      .then((u) => {
        setForm({ displayName: u.displayName || '', bio: u.bio || '', website: u.website || '', city: u.city || '' });
        setAvatarUrl(u.avatarUrl || '');
        setUsername(u.username || '');
        setLoaded(true);
      })
      .catch((e) => { logError(e); setLoaded(true); });
  }, []);

  function set(key) {
    return (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  async function pickAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Choose a JPG, PNG or WebP image');
    const body = new FormData();
    body.append('media', file);
    try {
      const result = await api('/v1/users/me/avatar', { method: 'POST', body });
      setAvatarUrl(result.avatarUrl);
      if (me) setSession(token, { ...me, avatarUrl: result.avatarUrl });
      toast('Profile photo updated');
    } catch (e) { logError(e); toast('Could not update the photo'); }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/v1/users/me/profile', { method: 'PUT', body: form });
      const current = useAppStore.getState().user;
      if (current) setSession(useAppStore.getState().token, { ...current, displayName: form.displayName });
      toast('Profile updated');
      navigate(`/u/${username || 'me'}`);
    } catch (error) {
      logError(error);
      toast('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="ep-page">
      <header className="ep-top">
        <button type="button" className="ep-back" aria-label="Back" onClick={() => goBack(navigate)}><Icon name="arrow-left" size={26} /></button>
        <h1>Edit profile</h1>
      </header>

      <form className="ep-form" onSubmit={save}>
        <div className="ep-avatar-block">
          <button type="button" className="ep-avatar" onClick={() => fileRef.current?.click()} aria-label="Change profile picture">
            {avatarUrl ? <img src={mediaUrl(avatarUrl)} alt="" /> : <Avatar user={me || {}} size={96} />}
          </button>
          <button type="button" className="ep-avatar-link" onClick={() => fileRef.current?.click()}>Edit picture or avatar</button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickAvatar} />
        </div>

        <label className="ep-field">
          <span>Name</span>
          <input value={form.displayName} onChange={set('displayName')} maxLength={64} required />
        </label>

        <label className="ep-field">
          <span>Username</span>
          <input value={username} disabled />
        </label>

        <label className="ep-field">
          <span>Bio</span>
          <textarea value={form.bio} onChange={set('bio')} maxLength={150} rows={3} />
          <small>{form.bio.length}/150</small>
        </label>

        <label className="ep-field">
          <span>Website</span>
          <input type="text" value={form.website} onChange={set('website')} maxLength={200} placeholder="yourwebsite.com" />
        </label>

        <label className="ep-field">
          <span>City</span>
          <input value={form.city} onChange={set('city')} maxLength={80} />
        </label>

        <button type="submit" className="ep-save" disabled={!loaded || saving}>Save</button>
      </form>
    </main>
  );
}
