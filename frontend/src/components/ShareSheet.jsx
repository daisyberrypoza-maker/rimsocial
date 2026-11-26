import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { toast } from '../toast.js';
import { sealFor } from '../lib/e2ee.js';
import './ShareSheet.css';

function socialLinks(text, url) {
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);
  return [
    { key: 'wa', label: 'WhatsApp', href: `https://wa.me/?text=${encodedText}` },
    { key: 'fb', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}` },
    { key: 'tg', label: 'Telegram', href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}` },
  ];
}

function BrandLogo({ name }) {
  if (name === 'wa') return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2Zm0 18a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 1 1 12.04 20Zm4.5-6.1c-.2-.1-1.3-.7-1.5-.8-.2-.1-.4-.1-.5.1l-.7.8c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-1.9-1.2 7 7 0 0 1-1.3-1.6c-.1-.2 0-.3.1-.4l.4-.5.2-.4c.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.4.5.2.9.3 1.2.4.5.1 1 .1 1.4.1.4-.1 1.3-.5 1.5-1 .2-.5.2-.9.1-1-.1-.1-.2-.2-.5-.3Z"/></svg>;
  if (name === 'fb') return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.86v-8.39H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.47h-2.8v8.39C19.61 23.08 24 18.09 24 12.07Z"/></svg>;
  if (name === 'x') return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93Zm-1.29 19.49h2.04L6.49 3.24H4.3Z"/></svg>;
  if (name === 'tg') return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.91 3.79 20.3 20.83c-.27 1.2-.98 1.5-1.98.94l-5.47-4.03-2.64 2.54c-.29.29-.54.54-1.1.54l.39-5.56L19.62 6.4c.43-.39-.09-.61-.67-.22L6.06 14.35.65 12.66c-1.18-.37-1.2-1.18.25-1.75L22.04 2.6c.98-.36 1.84.24 1.52 1.19Z"/></svg>;
  return null;
}

export default function ShareSheet({ url, caption, onClose, onCopy, onMore, onAddToStory, imageUrl, imageName = 'rimsocial.jpg' }) {
  const me = useAppStore((s) => s.me);
  const [friends, setFriends] = useState([]);
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    const chats = api('/v1/messages/share-targets').then((d) => (d.items || []).map((item) => item.user)).catch(() => []);
    const following = me?.username
      ? api(`/v1/users/${encodeURIComponent(me.username)}/following`).then((d) => d.items || []).catch(() => [])
      : Promise.resolve([]);
    Promise.all([following, chats]).then(([follow, chat]) => {
      if (!alive) return;
      const seen = new Set();
      setFriends([...follow, ...chat].filter((user) => user && user.id && !seen.has(String(user.id)) && seen.add(String(user.id))));
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
    setPicked((current) => current.some((u) => String(u.id) === String(user.id))
      ? current.filter((u) => String(u.id) !== String(user.id))
      : [...current, user]);
  }

  async function sendAll() {
    if (!url) { toast('This post has no public link yet'); return; }
    if (!picked.length || sending) return;
    setSending(true);
    try {
      const messages = await Promise.all(picked.map(async (user) => ({ userId: user.id, body: await sealFor(user.id, text) })));
      const postId = url.match(/\\/p\\/([^/?#]+)/)?.[1] || null;
      await api('/v1/messages/share', { method: 'POST', body: { messages, postId } });
      toast(`Sent to ${picked.length}`);
      setPicked([]);
    } catch (e) {
      toast(e.message || 'Could not send');
    } finally {
      setSending(false);
    }
  }

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
          const on = picked.some((u) => String(u.id) === String(user.id));
          const username = String(user.username || '').replace(/^@/, '');
          const displayName = user.displayName || user.name || user.username || 'RimSocial user';
          return (
            <button type="button" role="listitem" key={user.id} className="sf-person" onClick={() => toggle(user)} aria-pressed={on} disabled={sending}>
              <Avatar user={user} size={52} />
              <span className="sf-name">
                <strong>{displayName}</strong>
                <small>@{username}</small>
              </span>
              <span className={on ? 'sf-radio active' : 'sf-radio'} aria-hidden="true">{on && <span />}</span>
            </button>
          );
        }) : <p className="sf-empty">{query.trim() ? 'No one found.' : 'Friends you follow and people you chat with appear here.'}</p>}
      </div>

      {picked.length > 0 && (
        <div className="sf-sendbar">
          <span className="sf-count">{picked.length} selected</span>
          <button type="button" className="sf-send" onClick={sendAll} disabled={sending}>{sending ? 'Sending…' : `Send to ${picked.length}`}</button>
        </div>
      )}

      <nav className="sf-apps" aria-label="Share to apps">
        {url && socialLinks(text, url).map((app) => (
          <button type="button" key={app.key} className={`sf-app sf-social sf-${app.key}`} onClick={() => openApp(app.href)} aria-label={`Share with ${app.label}`} title={app.label}>
            <BrandLogo name={app.key} />
          </button>
        ))}
        {onAddToStory && <button type="button" className="sf-app sf-utility" onClick={onAddToStory} aria-label="Add to story">
          <span className="sf-circle"><Icon name="plus" size={22} /></span><span>Add to story</span>
        </button>}
        <button type="button" className="sf-app sf-utility" onClick={onCopy} aria-label="Copy link">
          <span className="sf-circle"><Icon name="link" size={22} /></span><span>Copy link</span>
        </button>
        {imageUrl && <button type="button" className="sf-app sf-utility" onClick={shareImage} aria-label="Share image">
          <span className="sf-circle"><Icon name="image" size={22} /></span><span>Share image</span>
        </button>}
        <button type="button" className="sf-app sf-utility" onClick={onMore} aria-label="More sharing options">
          <span className="sf-circle"><Icon name="share-2" size={22} /></span><span>Other</span>
        </button>
      </nav>
    </div>
  );
}
