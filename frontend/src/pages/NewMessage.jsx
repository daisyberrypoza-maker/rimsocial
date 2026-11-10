import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import { useAppStore } from '../store.js';
import { toast, logError } from '../toast.js';
import '../snap-screens.css';

// New chat, laid out like the reference: a white sheet over the dimmed chat with New Chat / New Call tabs,
// a To: search, New Group, Recents with selectable rows and a Chat button. Tap the dimmed area to close.
export default function NewMessage() {
  const navigate = useNavigate();
  const me = useAppStore((st) => st.user);
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState([]);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    api('/v1/messages/conversations')
      .then((data) => { if (alive) setRecents((data.items || []).map((item) => item.user).filter(Boolean)); })
      .catch((e) => logError(e));
    return () => { alive = false; };
  }, []);

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

  const list = results ?? recents.filter((person) => person.id !== me?.id);
  const isSelected = (person) => selected.some((s) => s.id === person.id);
  const toggle = (person) => setSelected((cur) => (
    cur.some((s) => s.id === person.id) ? cur.filter((s) => s.id !== person.id) : [...cur, person]
  ));

  async function startChat() {
    if (!selected.length || creating) return;
    if (selected.length > 1) {
      setCreating(true);
      try {
        const data = await api('/v1/messages/groups', { method: 'POST', body: { memberIds: selected.map((person) => person.id), name: groupName.trim() } });
        navigate(`/chat/group/${data.group.id}`, { replace: true });
      } catch (e) { toast(e.message || 'Could not create group'); }
      finally { setCreating(false); }
      return;
    }
    navigate(`/chat/${selected[0].id}`);
  }

  const removeSelected = (personId) => {
    setSelected((cur) => cur.filter((person) => person.id !== personId));
  };

  return (
    <div className="nc-backdrop" onClick={() => navigate('/chat')}>
      <section className="nc-sheet" role="dialog" aria-modal="true" aria-label="New chat" onClick={(e) => e.stopPropagation()}>
        <span className="nc-grip" aria-hidden="true" />
        <div className="nc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected="true" className="nc-tab on">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            New Chat
          </button>
          <button type="button" role="tab" aria-selected="false" className="nc-tab" disabled>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
            New Call
          </button>
        </div>

        <div className={selected.length > 1 ? 'nc-to nc-to-group' : 'nc-to'} role="group" aria-label="Message recipients">
          <span className="nc-to-label">To:</span>
          {selected.map((person) => (
            <span className="nc-recipient" key={person.id}>
              <span>{person.displayName || person.username}</span>
              <button type="button" aria-label={`Remove ${person.displayName || person.username}`} onClick={() => removeSelected(person.id)}>×</button>
            </span>
          ))}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={selected.length ? 'Add people' : 'Search people'} aria-label="Search people" autoFocus />
          {selected.length > 1 && <span className="nc-group-count">Group · {selected.length}</span>}
        </div>

        <button type="button" className="nc-group" onClick={() => { setSelected([]); setGroupName(''); document.querySelector('.nc-to input')?.focus(); }}>
          <span className="nc-group-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6" /><path d="M19 8v6M16 11h6" /></svg>
          </span>
          <span className="nc-group-text">
            <strong>New Group</strong>
            <small>Chat with up to 200 friends</small>
          </span>
          <svg className="nc-chev" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>

        {selected.length > 1 && <input className="nc-group-name-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={80} placeholder="Group name (optional)" aria-label="Group name" />}
        <h2 className="nc-section">{results ? 'Results' : 'Recents'}</h2>
        {list.length ? (
          <ul className="nc-list">
            {list.map((person) => {
              const on = isSelected(person);
              return (
                <li key={person.id}>
                  <button type="button" className="nc-row" onClick={() => toggle(person)} aria-pressed={on}>
                    <Avatar user={person} size={48} />
                    <span className="nc-name">{person.displayName || person.username}</span>
                    <span className={on ? 'nc-radio on' : 'nc-radio'} aria-hidden="true">
                      {on && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="nc-empty">{results ? 'No one found.' : 'Recent chats will appear here.'}</p>}

        <button type="button" className={selected.length ? 'nc-chat on' : 'nc-chat'} disabled={!selected.length || creating} onClick={startChat}>{creating ? 'Creating…' : selected.length > 1 ? 'Create group' : 'Chat'}</button>
      </section>
    </div>
  );
}
