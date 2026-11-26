import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import { toast } from '../toast.js';
import { sealFor } from '../lib/e2ee.js';

const MAX_RECIPIENTS = 15;

// Share sheet: pick up to 15 people you chat with (ranked), or search, then send; copy the link, or use other apps.
export default function ShareSheet({ url, caption, onClose, onCopy, onMore, onAddToStory }) {
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const q = query.trim();
    let alive = true;
    const load = q
      ? api(`/v1/search?q=${encodeURIComponent(q)}&type=people`).then((d) => d.people || [])
      : api('/v1/messages/share-targets').then((d) => (d.items || []).map((item) => item.user));
    const timer = setTimeout(() => { load.then((list) => { if (alive) setPeople(list); }).catch(() => {}); }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  function toggle(user) {
    if (sending) return;
    if (picked.some((u) => u.id === user.id)) { setPicked(picked.filter((u) => u.id !== user.id)); return; }
    if (picked.length >= MAX_RECIPIENTS) { toast(`You can share with up to ${MAX_RECIPIENTS} people at once`); return; }
    setPicked([...picked, user]);
  }

  async function sendAll() {
    if (!url) { toast('This post has no public link yet'); return; }
    if (!picked.length || sending) return;
    setSending(true);
    try {
      const text = caption ? `${caption}\n${url}` : url;
      const messages = await Promise.all(picked.map(async (user) => ({ userId: user.id, body: await sealFor(user.id, text) })));
      const postId = url.match(/\/p\/([^/?#]+)/)?.[1] || null;
      await api('/v1/messages/share', { method: 'POST', body: { messages, postId } });
      toast(`Sent to ${picked.length}`);
      setPicked([]);
    } catch (e) {
      toast(e.message || 'Could not send');
    } finally {
      setSending(false);
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
          {people.length ? people.map((user) => {
            const on = picked.some((u) => u.id === user.id);
            return (
              <button type="button" key={user.id} className="share-person" onClick={() => toggle(user)} aria-pressed={on} disabled={sending}>
                <Avatar user={user} size={56} />
                <span className="share-name">{user.displayName || user.username}</span>
                <span className={on ? 'share-state done' : 'share-state'}>{on ? 'Selected' : 'Select'}</span>
              </button>
            );
          }) : <p className="share-empty">{query.trim() ? 'No one found.' : 'People you chat with appear here.'}</p>}
        </div>
        {picked.length > 0 && (
          <div className="share-sendbar">
            <span className="share-count">{picked.length} of {MAX_RECIPIENTS}</span>
            <button type="button" className="btn-primary share-send-btn" onClick={sendAll} disabled={sending}>
              {sending ? 'Sending…' : `Send to ${picked.length}`}
            </button>
          </div>
        )}
        <div className="share-actions">
          {url && <button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(caption ? `${caption}\n${url}` : url)}`, '_blank', 'noopener')}>
            <span className="share-circle wa" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z" /></svg></span>
            WhatsApp
          </button>}
          {onAddToStory && <button type="button" onClick={onAddToStory}>
            <span className="share-circle" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" strokeDasharray="3 3" /><path d="M12 8v8M8 12h8" /></svg></span>
            Add to story
          </button>}
          <button type="button" onClick={onCopy}>
            <span className="share-circle" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg></span>
            Copy link
          </button>
          <button type="button" onClick={onMore}>
            <span className="share-circle" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg></span>
            Share
          </button>
        </div>
      </section>
    </div>
  );
}
