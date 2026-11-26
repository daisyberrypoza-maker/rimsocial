import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { toast } from '../toast.js';
import { sealFor } from '../lib/e2ee.js';
import { newClientId } from '../lib/clientId.js';
import './ShareSheet.css';

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

// Brand marks (Font Awesome 6 brand paths, via react-icons). Shown on their brand colour; X stays on light grey.
const LOGO = {
  wa: { viewBox: '0 0 448 512', d: "M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" },
  fb: { viewBox: '0 0 320 512', d: "M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.3 0 29.4 .4 37 1.2V7.9C291.4 4 256.4 0 236.2 0C129.3 0 80 50.5 80 159.4v42.1H14v97.8H80z" },
  x: { viewBox: '0 0 512 512', d: "M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z" },
  tg: { viewBox: '0 0 496 512', d: "M248,8C111.033,8,0,119.033,0,256S111.033,504,248,504,496,392.967,496,256,384.967,8,248,8ZM362.952,176.66c-3.732,39.215-19.881,134.378-28.1,178.3-3.476,18.584-10.322,24.816-16.948,25.425-14.4,1.326-25.338-9.517-39.287-18.661-21.827-14.308-34.158-23.215-55.346-37.177-24.485-16.135-8.612-25,5.342-39.5,3.652-3.793,67.107-61.51,68.335-66.746.153-.655.3-3.1-1.154-4.384s-3.59-.849-5.135-.5q-3.283.746-104.608,69.142-14.845,10.194-26.894,9.934c-8.855-.191-25.888-5.006-38.551-9.123-15.531-5.048-27.875-7.717-26.8-16.291q.84-6.7,18.45-13.7,108.446-47.248,144.628-62.3c68.872-28.647,83.183-33.623,92.511-33.789,2.052-.034,6.639.474,9.61,2.885a10.452,10.452,0,0,1,3.53,6.716A43.765,43.765,0,0,1,362.952,176.66Z" },
};

function SocialLogo({ kind }) {
  const logo = LOGO[kind];
  return <svg width="24" height="24" viewBox={logo.viewBox} fill="currentColor" aria-hidden="true"><path d={logo.d} /></svg>;
}

export default function ShareSheet({ url, caption, onClose, onCopy, onMore, onAddToStory, imageUrl, imageName = 'rimsocial.jpg' }) {
  const me = useAppStore((s) => s.me);
  const [friends, setFriends] = useState([]);
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  // The story row ("My Story") is off by default so nothing is posted by accident; turn it on to add this to your story
  const [storySelected, setStorySelected] = useState(false);

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
  const text = url ? (caption ? `${caption}\n${url}` : url) : (caption || '');

  function toggle(user) {
    if (sending) return;
    if (picked.some((u) => u.id === user.id)) { setPicked(picked.filter((u) => u.id !== user.id)); return; }
    setPicked([...picked, user]);
  }

  // Sends the chat message (or the link / picture when no message is typed) to every selected friend,
  // then adds the story when the story row is on.
  async function sendAll() {
    if (sending) return;
    const body = message.trim();
    const wantsStory = storySelected && Boolean(onAddToStory);
    if (!picked.length && !wantsStory) return;
    if (picked.length && !imageUrl && !url && !body) { toast('This post has no public link yet'); return; }
    setSending(true);
    try {
      if (picked.length) {
        if (imageUrl) {
          // Send the picture itself to each friend, with the typed message as its caption (same route the chat uses)
          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error('Could not load this media');
          const blob = await response.blob();
          const type = blob.type || 'image/jpeg';
          const failed = [];
          for (const user of picked) {
            const form = new FormData();
            form.append('media', new File([blob], imageName, { type }));
            if (body) form.append('body', body);
            form.append('clientId', newClientId());
            try { await api(`/v1/messages/with/${user.id}/media`, { method: 'POST', body: form }); } catch { failed.push(user); }
          }
          if (failed.length) throw new Error(`Could not send to ${failed.length}`);
        } else {
          const payload = body || text;
          const messages = await Promise.all(picked.map(async (user) => ({ userId: user.id, body: await sealFor(user.id, payload) })));
          const postId = url?.match(/\/p\/([^/?#]+)/)?.[1] || null;
          await api('/v1/messages/share', { method: 'POST', body: { messages, postId } });
        }
        toast(`Sent to ${picked.length}`);
      }
      setPicked([]);
      setMessage('');
      if (wantsStory) onAddToStory();
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

  const pickedNames = picked.map((user) => user.displayName || user.username);
  const canSend = (picked.length > 0 || (storySelected && Boolean(onAddToStory))) && !sending;

  return (
    <div className="sf-page" role="dialog" aria-modal="true" aria-label="Share">
      <header className="sf-top">
        <button type="button" className="sf-icon" aria-label="Close share" onClick={onClose}><Icon name="chevron-down" size={28} /></button>
        <label className="sf-search">
          <Icon name="search" size={20} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Send To…" aria-label="Search people to share with" />
        </label>
        <button type="button" className="sf-icon" aria-label="Add friends" onClick={() => {}}><Icon name="user-plus" size={24} /></button>
      </header>

      <div className="sf-people" role="list">
        {!query.trim() && (
          <div className="sf-section-head">
            <h2>Post to…</h2>
            {onAddToStory && <button type="button" className="sf-new-story" onClick={onAddToStory}><Icon name="plus" size={18} /> New Story</button>}
          </div>
        )}
        {!query.trim() && onAddToStory && (
          <button type="button" role="listitem" className={storySelected ? 'sf-person sf-story on' : 'sf-person sf-story'} onClick={() => setStorySelected(!storySelected)} aria-pressed={storySelected} disabled={sending}>
            <span className="sf-story-avatar" aria-hidden="true">{imageUrl && !imageName.endsWith('mp4') ? <img src={imageUrl} alt="" /> : <Icon name="image" size={22} />}</span>
            <span className="sf-name">
              <strong>My Story · Public</strong>
              <small>Friends, Followers, …</small>
            </span>
            <span className="sf-time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>24h</span>
            <span className={storySelected ? 'sf-radio on' : 'sf-radio'} aria-hidden="true" />
          </button>
        )}
        {!query.trim() && <h2 className="sf-section-title">Recents &amp; Suggested</h2>}
        {shownPeople.length ? shownPeople.map((user) => {
          const on = picked.some((u) => u.id === user.id);
          return (
            <button type="button" role="listitem" key={user.id} className={on ? 'sf-person on' : 'sf-person'} onClick={() => toggle(user)} aria-pressed={on} disabled={sending}>
              <Avatar user={user} size={52} />
              <span className="sf-name">
                <strong>{user.displayName || user.username}</strong>
                <small>@{user.username}</small>
              </span>
              <span className={on ? 'sf-radio on' : 'sf-radio'} aria-hidden="true" />
            </button>
          );
        }) : <p className="sf-empty">{query.trim() ? 'No one found.' : 'Friends you follow and people you chat with appear here.'}</p>}
      </div>

      {(picked.length > 0 || storySelected) && (
        <div className="sf-sendbar">
          <div className="sf-compose-row">
            {imageUrl && <span className="sf-thumb" aria-hidden="true"><img src={imageUrl} alt="" /></span>}
            <label className="sf-chat">
              <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a chat…" aria-label="Message to send to everyone selected" maxLength={2000} disabled={sending} />
            </label>
          </div>
          <div className="sf-recipient-row">
            <button type="button" className="sf-dots" aria-label="Clear selected people" onClick={() => { setPicked([]); setStorySelected(false); }} disabled={sending}>•••</button>
            <div className="sf-chips" role="list" aria-label="Selected recipients">
              {storySelected && <span className="sf-chip" role="listitem"><Icon name="image" size={14} /> My Story</span>}
              {pickedNames.map((name, index) => <span className="sf-chip" role="listitem" key={`${name}-${index}`}>{name}</span>)}
            </div>
            <button type="button" className="sf-send" onClick={sendAll} disabled={!canSend} aria-label={sending ? 'Sending' : `Send to ${picked.length + (storySelected ? 1 : 0)}`}>
              <Icon name="send" size={22} />
            </button>
          </div>
        </div>
      )}

      <nav className="sf-apps" aria-label="Share to apps">
        {url && socialLinks(text, url).map((app) => (
          <button type="button" key={app.key} className="sf-app" onClick={() => openApp(app.href)}>
            <span className={`sf-circle sf-${app.key}`} aria-hidden="true">{LOGO[app.key] ? <SocialLogo kind={app.key} /> : app.label.charAt(0)}</span>
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
