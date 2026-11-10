import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';
import { logError } from '../toast.js';
import '../snap-screens.css';

// My Friends: the people you follow, in alphabetical sections with a letter index on the right.
// Opened from Add Friends > All Contacts. Tapping a person opens their profile.
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

function nameOf(person) {
  return (person.displayName || person.username || '').trim();
}

function letterOf(person) {
  const first = nameOf(person).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

export default function MyFriends() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.user);
  const [people, setPeople] = useState(null);
  const [query, setQuery] = useState('');
  const sectionRefs = useRef({});

  useEffect(() => {
    if (!me?.username) return;
    api(`/v1/users/${encodeURIComponent(me.username)}/following`)
      .then((data) => setPeople(data.items || []))
      .catch((e) => { logError(e); setPeople([]); });
  }, [me?.username]);

  const sections = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matching = (people || [])
      .filter((person) => !term || nameOf(person).toLowerCase().includes(term) || (person.username || '').toLowerCase().includes(term))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const groups = new Map();
    matching.forEach((person) => {
      const letter = letterOf(person);
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(person);
    });
    return [...groups.entries()].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
  }, [people, query]);

  const present = new Set(sections.map(([letter]) => letter));

  function jumpTo(letter) {
    sectionRefs.current[letter]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  return (
    <div className="sn-mf">
      <header className="sn-af-head">
        <button type="button" className="sn-af-iconbtn" onClick={() => goBack(navigate, '/friends')} aria-label="Back">
          <Icon name="chevron-down" size={26} />
        </button>
        <h1>My Friends</h1>
        <span aria-hidden="true" />
      </header>
      <label className="sn-mf-search">
        <Icon name="search" size={19} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find friends" aria-label="Find friends" />
      </label>
      <div className="sn-mf-body">
        {sections.map(([letter, list]) => (
          <section key={letter} ref={(el) => { sectionRefs.current[letter] = el; }}>
            <h2 className="sn-mf-letter">{letter}</h2>
            {list.map((person) => (
              <button key={person.id} type="button" className="sn-mf-row" onClick={() => navigate(`/u/${person.username}`)}>
                <Avatar user={person} size={40} />
                <span className="sn-mf-name">{nameOf(person) || person.username}</span>
              </button>
            ))}
          </section>
        ))}
        {people && sections.length === 0 && <p className="sn-empty">{query ? 'No friends match that name.' : 'No friends yet.'}</p>}
      </div>
      <nav className="sn-mf-index" aria-label="Jump to letter">
        {LETTERS.map((letter) => (
          <button key={letter} type="button" onClick={() => jumpTo(letter)} disabled={!present.has(letter)}>{letter}</button>
        ))}
      </nav>
    </div>
  );
}
