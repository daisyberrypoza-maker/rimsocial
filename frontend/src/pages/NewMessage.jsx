import { chatPath } from '../lib/chatLink.js';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import { useAppStore } from '../store.js';
import { toast, logError } from '../toast.js';
import '../snap-screens.css';
import './NewMessage.css';

// Suggestions the user removed stay removed (per account) until they search for that person again
const dismissKey = (id) => `rs_dismissed_suggestions_${id}`;
function readDismissed(id) {
  try { return new Set(JSON.parse(window.localStorage.getItem(dismissKey(id)) || '[]')); } catch { return new Set(); }
}
function writeDismissed(id, set) {
  try { window.localStorage.setItem(dismissKey(id), JSON.stringify([...set])); } catch { /* storage unavailable: still works for this visit */ }
}

const icon = (path) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);

// New message / New group chat, laid out like the reference screens.
export default function NewMessage() {
  const navigate = useNavigate();
  const me = useAppStore((st) => st.user);
  const [mode, setMode] = useState('direct'); // 'direct' | 'group'
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState([]);
  const [hidden, setHidden] = useState(() => readDismissed(me?.id));
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const groupMode = mode === 'group';

  useEffect(() => {
    let alive = true;
    if (!me?.username) { setLoadingPeople(false); return () => { alive = false; }; }
    const loadPeople = async () => {
      setLoadingPeople(true);
      const [conversationResult, followingResult, followerResult] = await Promise.allSettled([
        api('/v1/messages/conversations'),
        api(`/v1/users/${encodeURIComponent(me.username)}/following`),
        api(`/v1/users/${encodeURIComponent(me.username)}/followers`),
      ]);
      if (!alive) return;
      if (conversationResult.status === 'rejected') logError(conversationResult.reason);
      const ordered = new Map();
      const recentUsers = conversationResult.status === 'fulfilled'
        ? (conversationResult.value.items || []).map((item) => item.user).filter(Boolean)
        : [];
      // Keep recent conversations first, then add every current connection once.
      recentUsers.forEach((person) => ordered.set(String(person.id), person));
      [followingResult, followerResult].forEach((result) => {
        if (result.status !== 'fulfilled') {
          logError(result.reason);
          return;
        }
        (result.value.items || []).forEach((person) => {
          const id = String(person.id);
          ordered.set(id, { ...(ordered.get(id) || {}), ...person });
        });
      });
      setRecents([...ordered.values()].filter((person) => String(person.id) !== String(me.id)));
      setLoadingPeople(false);
    };
    loadPeople().catch((error) => { logError(error); if (alive) setLoadingPeople(false); });
    return () => { alive = false; };
  }, [me?.id, me?.username]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      api(`/v1/search?q=${encodeURIComponent(q)}&type=people`)
        .then((data) => { if (alive) setResults((data.people || []).filter((person) => person.id !== me?.id)); })
        .catch(() => { if (alive) setResults([]); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, me?.id]);

  const base = results ?? recents;
  const isSelected = (person) => selected.some((s) => s.id === person.id);
  // Selected people appear as chips in group mode, so they are not repeated in the list
  // Search results always show; removed suggestions only hide from the suggested list
  const list = base.filter((person) => (results ? true : !hidden.has(String(person.id))) && !(groupMode && isSelected(person)));
  const toggle = (person) => setSelected((cur) => (
    cur.some((s) => s.id === person.id) ? cur.filter((s) => s.id !== person.id) : [...cur, person]
  ));
  const hide = (person) => setHidden((cur) => {
    const next = new Set(cur).add(String(person.id));
    writeDismissed(me?.id, next);
    return next;
  });

  function onRow(person) {
    if (groupMode) toggle(person);
    else navigate(chatPath('direct', person.id), { replace: true });
  }

  async function createGroup() {
    if (selected.length < 2 || creating) return;
    setCreating(true);
    try {
      const data = await api('/v1/messages/groups', { method: 'POST', body: { memberIds: selected.map((person) => person.id), name: groupName.trim() } });
      navigate(chatPath('group', data.group.id), { replace: true });
    } catch (e) { toast(e.message || 'Could not create group'); }
    finally { setCreating(false); }
  }

  function back() {
    if (groupMode) { setMode('direct'); setSelected([]); setGroupName(''); setQuery(''); }
    else navigate('/chat');
  }

  const title = groupMode ? 'New group chat' : 'New message';
  const heading = results ? 'Results' : 'Suggested';

  return (
    <div className="nm-page" role="dialog" aria-modal="true" aria-label={title}>
      <header className="nm-head">
        <button type="button" className="nm-back" aria-label="Back" onClick={back}>
          {icon(<path d="M19 12H5M12 19l-7-7 7-7" />)}
        </button>
        <h1 className="nm-title">{title}</h1>
      </header>

      <div className="nm-body">
        {!groupMode && (
          <label className="nm-to">
            <span className="nm-to-label">To:</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search people" autoFocus />
          </label>
        )}

        {!groupMode && (
          <div className="nm-actions">
            <button type="button" className="nm-action" onClick={() => { setMode('group'); setQuery(''); }}>
              <span className="nm-action-icon">{icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.6c3 .3 5 2.3 5 5.2" /></>)}</span>
              Group chat
            </button>
          </div>
        )}

        {groupMode && (
          <>
            <input
              className="nm-name-input"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={80}
              placeholder="Group name (optional)"
              aria-label="Group name"
            />
            <label className="nm-search">
              {icon(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>)}
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search people" />
            </label>
            {selected.length > 0 && (
              <div className="nm-chips">
                {selected.map((person) => (
                  <button type="button" className="nm-chip" key={person.id} onClick={() => toggle(person)} aria-label={`Remove ${person.displayName || person.username}`}>
                    <span className="nm-chip-avatar">
                      <Avatar user={person} size={84} />
                      <span className="nm-chip-badge" aria-hidden="true">{icon(<path d="M6 6l12 12M18 6L6 18" />)}</span>
                    </span>
                    <span className="nm-chip-name">{person.displayName || person.username}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <h2 className="nm-section">{heading}</h2>
        {list.length ? (
          <ul className="nm-list">
            {list.map((person) => {
              return (
                <li key={person.id} className="nm-item">
                  <button type="button" className="nm-row" onClick={() => onRow(person)} >
                    <Avatar user={person} size={56} />
                    <span className="nm-row-text">
                      <span className="nm-row-name">{person.displayName || person.username}</span>
                      {person.displayName && person.username && <span className="nm-row-handle">{person.username}</span>}
                    </span>
                  </button>
                  <button type="button" className="nm-x" aria-label={`Hide ${person.displayName || person.username}`} onClick={() => hide(person)}>
                    {icon(<path d="M6 6l12 12M18 6L6 18" />)}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="nm-empty">{results ? 'No one found.' : loadingPeople ? 'Loading people…' : 'No people available yet.'}</p>}
      </div>

      {groupMode && (
        <button type="button" className={selected.length >= 2 ? 'nm-create on' : 'nm-create'} disabled={selected.length < 2 || creating} onClick={createGroup}>
          {creating ? 'Creating…' : 'Create group'}
        </button>
      )}
    </div>
  );
}
