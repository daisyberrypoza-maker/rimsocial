import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import { toast } from '../toast.js';

// Share sheet: send a post or Rimlight link to people you chat with (or search for), copy the link, or use other apps.
export default function ShareSheet({ url, caption, onClose, onCopy, onMore }) {
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState({});
  const [busy, setBusy] = useState({});

  useEffect(() => {
    const q = query.trim();
    let alive = true;
    const load = q
      ? api(`/v1/search?q=${encodeURIComponent(q)}&type=people`).then((d) => d.people || [])
      : api('/v1/messages/conversations').then((d) => (d.items || []).map((item) => item.user));
    const timer = setTimeout(() => { load.then((list) => { if (alive) setPeople(list); }).catch(() => {}); }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  async function send(user) {
    if (!url) { toast('This post has no public link yet'); return; }
    if (busy[user.id] || sent[user.id]) return;
    setBusy((current) => ({ ...current, [user.id]: true }));
    try {
      await api(`/v1/messages/with/${user.id}`, { method: 'POST', body: { body: caption ? `${caption}\n${url}` : url } });
      setSent((current) => ({ ...current, [user.id]: true }));
    } catch (e) {
      toast(e.message || 'Could not send');
    } finally {
      setBusy((current) => ({ ...current, [user.id]: false }));
    }
  }

  return (
    <div className="rv-sheet-backdrop share-backdrop" onClick={onClose}>
      <section className="share-sheet" role="dialog" aria-label="Share" onClick={(e) => e.stopPropagation()}>
        <div className="rv-handle" aria-hidden="true" />
        <label className="share-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search people to share with" />
        </label>
        <div className="share-people">
          {people.length ? people.map((user) => (
            <button type="button" key={user.id} className="share-person" onClick={() => send(user)} disabled={busy[user.id]}>
              <Avatar user={user} size={56} />
              <span className="share-name">{user.displayName || user.username}</span>
              <span className={sent[user.id] ? 'share-state done' : 'share-state'}>{sent[user.id] ? 'Sent' : busy[user.id] ? 'Sending…' : 'Send'}</span>
            </button>
          )) : <p className="share-empty">{query.trim() ? 'No one found.' : 'People you chat with appear here.'}</p>}
        </div>
        <div className="share-actions">
          <button type="button" onClick={onCopy}>
            <span className="share-circle"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg></span>
            Copy link
          </button>
          <button type="button" onClick={onMore}>
            <span className="share-circle"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 11l8-4M8 13l8 4" /></svg></span>
            Other apps
          </button>
        </div>
      </section>
    </div>
  );
}
