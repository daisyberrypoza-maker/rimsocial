import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { api } from '../api.js';
import { toast } from '../toast.js';
import { goBack } from '../lib/goBack.js';

export default function Recommended() {
  const navigate = useNavigate();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});

  useEffect(() => {
    api('/v1/users/suggestions')
      .then((data) => setPeople(data.suggested || []))
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(person) {
    if (busy[person.id]) return;
    setBusy((current) => ({ ...current, [person.id]: true }));
    try {
      const r = person.isFollowing
        ? await api(`/v1/users/${person.id}/follow`, { method: 'DELETE' })
        : await api(`/v1/users/${person.id}/follow`, { method: 'POST' });
      setPeople((current) => current.map((item) => item.id === person.id
        ? { ...item, isFollowing: r.isFollowing, followerCount: r.followerCount }
        : item));
    } catch (e) { toast(e.message); }
    finally { setBusy((current) => ({ ...current, [person.id]: false })); }
  }

  return (
    <main className="rec-page">
      <header className="rec-top">
        <button className="rec-back" aria-label="Back" onClick={() => goBack(navigate)}><Icon name="chevron-down" size={26} /></button>
        <h1>Recommended</h1>
        <span className="rec-spacer" aria-hidden="true" />
      </header>
      <ul className="rec-list">
        {people.map((person) => (
          <li className="rec-row" key={person.id}>
            <button className="rec-person" onClick={() => navigate(`/u/${person.username}`)}>
              <Avatar user={person} size={52} />
              <span className="rec-name">{person.displayName || person.username}</span>
            </button>
            <button className={`rec-follow${person.isFollowing ? ' added' : ''}`} onClick={() => toggle(person)} disabled={Boolean(busy[person.id])}>
              {busy[person.id] ? '…' : person.isFollowing ? 'Added' : 'Add'}
            </button>
          </li>
        ))}
      </ul>
      {!loading && !people.length && <p className="rec-empty">No suggestions right now.</p>}
    </main>
  );
}
