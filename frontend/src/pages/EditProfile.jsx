import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';

// Edit the owner's profile details: name, bio, website and city.
export default function EditProfile() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.user);
  const [form, setForm] = useState({ displayName: '', bio: '', website: '', city: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/v1/users/me')
      .then((u) => {
        setForm({ displayName: u.displayName || '', bio: u.bio || '', website: u.website || '', city: u.city || '' });
        setLoaded(true);
      })
      .catch((e) => toast(e.message));
  }, []);

  function set(key) {
    return (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/v1/users/me/profile', { method: 'PUT', body: form });
      toast('Profile updated');
      navigate(`/u/${me?.username || 'me'}`);
    } catch (error) {
      toast(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="pe-page">
      <header className="pe-top">
        <button type="button" className="pe-back" aria-label="Back" onClick={() => goBack(navigate)}><Icon name="arrow-left" size={22} /></button>
        <h1>Edit profile</h1>
      </header>
      <form className="pe-form" onSubmit={save}>
        <label className="pe-field">
          <span>Name</span>
          <input value={form.displayName} onChange={set('displayName')} maxLength={64} required />
        </label>
        <label className="pe-field">
          <span>Bio</span>
          <textarea value={form.bio} onChange={set('bio')} maxLength={150} rows={3} />
          <small>{form.bio.length}/150</small>
        </label>
        <label className="pe-field">
          <span>Website</span>
          <input type="text" value={form.website} onChange={set('website')} maxLength={200} placeholder="yourwebsite.com" />
        </label>
        <label className="pe-field">
          <span>City</span>
          <input value={form.city} onChange={set('city')} maxLength={80} />
        </label>
        <button type="submit" className="pe-save" disabled={!loaded || saving}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
    </main>
  );
}
