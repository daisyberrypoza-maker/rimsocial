import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { toast } from '../toast.js';
import { sealFor } from '../lib/e2ee.js';
import './ShareSheet.css';

const MAX_RECIPIENTS = 15;

// Full-screen share page. Friends: everyone you follow plus recent chats (pick up to 15 and send in the app).
// Other apps: WhatsApp, Facebook, X, Telegram, Email, Text message, the device share sheet ("Other"),
// Copy link, and Share image (the story picture or video, passed to the device share sheet).
function socialLinks(text, url) {
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);
  return [
    { key: 'wa', label: 'WhatsApp', href: `https://wa.me/?text=${encodedText}` },
    { key: 'fb', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${encodedText}` },
    { key: 'tg', label: 'Telegram', href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}` },
    { key: 'mail', label: 'Email', href: `mailto:?subject=RimSocial&body=${encodedText}` },
    { key: 'sms', label: 'Text', href: `sms:?&body=${encodedText}` },
  ];
}

export default function ShareSheet({ url, caption, onClose, onCopy, onMore, onAddToStory, imageUrl, imageName = 'rimsocial.jpg' }) {
  const me = useAppStore((s) => s.me);
  const [friends, setFriends] = useState([]);
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [sending, setSending] = useState(false);

  // Escape: clears the search text first, then closes the page. The latest onClose is read from a ref,
  // so the listener is registered once.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const queryRef = useRef(query);
  queryRef.current = query;
  const setQueryRef = useRef(setQuery);
  useEffect(() => {
    function onKey(event) {
      if (event.key !== 'Escape') return;
      if (queryRef.current) { setQueryRef.current(''); return; }
      closeRef.current?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // All friends (people you follow) plus recent chat contacts, de-duplicated; a search replaces the list.
  useEffect(() => {
    let alive = true;
    const chats = api('/v1/messages/share-targets').then((d) => (d.items || []).map((item) => item.user)).catch(() => []);
    const following = me?.username
      ? api(`/v1/users/${encodeURIComponent(me.username)}/following`).then((d) => d.items || []).catch(() => [])
      : Promise.resolve([]);
    Promise.all([following, chats]).then(([follow, chat]) => {
      if (!alive) return;
      const seen = new Set();
      const merged = [...follow, ...chat].filter((user) => user && user.id && !seen.has(String(user.id)) && seen.add(String(user.id)));
      setFriends(merged);
    });
    return () => { alive = false; };
  }, [me?.username]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setPeople([]); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      api(`/v1/search?q=${encodeURIComponent(q)}&type=people`)
        .then((d) => { if (alive) setPeople(d.people || []); })
        .catch(() => { if (alive) setPeople([]); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const shownPeople = query.trim() ? people : friends;
  const text = caption ? `${caption}\n${url}` : url;

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

  // Share the picture or video itself (the device share sheet lists every installed app); download it when sharing files is not supported
  async function shareImage() {
    if (!imageUrl) { toast('There is nothing to share yet'); return; }
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Could not load this media');
      const blob = await response.blob();
      const file = new File([blob], imageName, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: caption || 'RimSocial' });
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = imageName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toast('Saved to your downloads');
    } catch (e) {
      if (e?.name !== 'AbortError') toast(e?.message || 'Could not share this media');
    }
  }

  function openApp(href) {
    if (href.startsWith('http')) window.open(href, '_blank', 'noopener');
    else window.location.href = href;
  }

  return (
    <div className="sf-page" role="dialog" aria-modal="true" aria-label="Share">
      <header className="sf-top">
        <button type="button" className="sf-icon" aria-label="Close share" onClick={onClose}><Icon name="x" size={26} /></button>
        <h1 className="sf-title">Share</h1>
        <span className="sf-spacer" aria-hidden="true" />
      </header>

      <label className="sf-search">
        <Icon name="search" size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search people to share with" />
      </label>

      <div className="sf-people" role="list">
        {shownPeople.length ? shownPeople.map((user) => {
          const on = picked.some((u) => u.id === user.id);
          return (
            <button type="button" role="listitem" key={user.id} className={on ? 'sf-person on' : 'sf-person'} onClick={() => toggle(user)} aria-pressed={on} disabled={sending}>
              <Avatar user={user} size={52} />
              <span className="sf-name">
                <strong>{user.displayName || user.username}</strong>
                {user.displayName && <small>{user.username}</small>}
              </span>
              <span className={on ? 'sf-state done' : 'sf-state'}>{on ? 'Selected' : 'Select'}</span>
            </button>
          );
        }) : <p className="sf-empty">{query.trim() ? 'No one found.' : 'Friends you follow and people you chat with appear here.'}</p>}
      </div>

      {picked.length > 0 && (
        <div className="sf-sendbar">
          <span className="sf-count">{picked.length} of {MAX_RECIPIENTS}</span>
          <button type="button" className="sf-send" onClick={sendAll} disabled={sending}>{sending ? 'Sending…' : `Send to ${picked.length}`}</button>
        </div>
      )}

      <nav className="sf-apps" aria-label="Share to apps">
        {url && socialLinks(text, url).map((app) => (
          <button type="button" key={app.key} className="sf-app" onClick={() => openApp(app.href)}>
            <span className={`sf-circle sf-${app.key}`} aria-hidden="true">{app.label.charAt(0)}</span>
            <span>{app.label}</span>
          </button>
        ))}
        {onAddToStory && <button type="button" className="sf-app" onClick={onAddToStory}>
          <span className="sf-circle" aria-hidden="true"><Icon name="plus" size={22} /></span><span>Add to story</span>
        </button>}
        <button type="button" className="sf-app" onClick={onCopy}>
          <span className="sf-circle" aria-hidden="true"><Icon name="link" size={22} /></span><span>Copy link</span>
        </button>
        {imageUrl && <button type="button" className="sf-app" onClick={shareImage}>
          <span className="sf-circle" aria-hidden="true"><Icon name="download" size={22} /></span><span>Share image</span>
        </button>}
        <button type="button" className="sf-app" onClick={onMore}>
          <span className="sf-circle" aria-hidden="true"><Icon name="share-2" size={22} /></span><span>Other</span>
        </button>
      </nav>
    </div>
  );
}
