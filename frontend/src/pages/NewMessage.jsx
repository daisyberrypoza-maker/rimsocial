import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import { useAppStore } from '../store.js';

// New message: search people, then open a conversation with them.
export default function NewMessage() {
  const navigate = useNavigate();
  const me = useAppStore((st) => st.user);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setPeople([]); setSearching(false); return undefined; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api(`/v1/search?q=${encodeURIComponent(q)}&type=people`)
        .then((data) => { if (alive) setPeople((data.people || []).filter((person) => person.id !== me?.id)); })
        .catch(() => { if (alive) setPeople([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, me?.id]);

  return (
    <main className="dm-page">
      <header className="dm-head">
        <button type="button" className="dm-icon" onClick={() => navigate('/chat')} aria-label="Back">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <h1>New message</h1>
        <span />
      </header>
      <div className="dm-to">
        <span>To:</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search people" autoFocus />
      </div>
      {!query.trim() ? <p className="dm-empty">Search for someone to message.</p>
        : searching && !people.length ? <p className="dm-empty">Searching…</p>
        : people.length ? (
          <ul className="dm-list">
            {people.map((person) => (
              <li key={person.id}>
                <button type="button" className="dm-row" onClick={() => navigate(`/chat/${person.id}`)}>
                  <Avatar user={person} size={48} />
                  <span className="dm-text"><strong>{person.displayName || person.username}</strong><small>@{person.username}</small></span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="dm-empty">No one found.</p>}
    </main>
  );
}
