import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { api } from '../api.js';
import { goBack } from '../lib/goBack.js';
import { logError } from '../toast.js';

export default function Recommended() {
  const navigate = useNavigate();
  const [suggested, setSuggested] = useState([]);
  const [followBack, setFollowBack] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});

  useEffect(() => {
    let active = true;
    api('/v1/users/suggestions')
      .then((data) => {
        if (!active) return;
        setSuggested(data.suggested || []);
        setFollowBack(data.followBack || []);
      })
      .catch(logError)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function toggle(person, section) {
    if (busy[person.id]) return;
    setBusy((current) => ({ ...current, [person.id]: true }));
    try {
      const response = await api(`/v1/users/${person.id}/follow`, { method: person.isFollowing ? 'DELETE' : 'POST' });
      const update = (items) => items.map((item) => item.id === person.id
        ? { ...item, isFollowing: response.isFollowing, followerCount: response.followerCount }
        : item);
      if (section === 'suggested') setSuggested(update);
      else setFollowBack(update);
    } catch (error) { logError(error); }
    finally { setBusy((current) => ({ ...current, [person.id]: false })); }
  }

  const visibleSuggested = useMemo(() => suggested.filter((person) => !dismissed.includes(person.id)), [suggested, dismissed]);
  const visibleFollowBack = useMemo(() => followBack.filter((person) => !dismissed.includes(person.id)), [followBack, dismissed]);

  function personRow(person, section) {
    const following = Boolean(person.isFollowing);
    return (
      <li className="rec-discover-row" key={person.id}>
        <button type="button" className="rec-discover-person" onClick={() => navigate(`/u/${person.username}`)}>
          <Avatar user={person} size={56} />
          <span className="rec-discover-copy">
            <strong>{person.username || person.displayName}</strong>
            <small>{section === 'followBack' ? 'Suggested for you' : person.mutualCount > 0 ? `${person.mutualCount} mutual` : 'Suggested for you'}</small>
          </span>
        </button>
        <button type="button" className={`rec-discover-follow${following ? ' is-following' : ''}`} onClick={() => toggle(person, section)} disabled={Boolean(busy[person.id])}>
          {busy[person.id] ? '…' : following ? 'Following' : section === 'followBack' ? 'Follow back' : 'Follow'}
        </button>
        <button type="button" className="rec-discover-dismiss" aria-label={`Dismiss ${person.username}`} onClick={() => setDismissed((items) => [...items, person.id])}>
          <Icon name={section === 'followBack' ? 'x' : 'more-vertical'} size={20} />
        </button>
      </li>
    );
  }

  return (
    <main className="rec-page rec-discover-page">
      <header className="rec-top">
        <button type="button" className="rec-back" aria-label="Back" onClick={() => goBack(navigate)}><Icon name="arrow-left" size={26} /></button>
        <h1>Discover people</h1>
        <span className="rec-spacer" aria-hidden="true" />
      </header>

      <section className="rec-discover-section">
        <h2>Suggested for you</h2>
        <ul className="rec-discover-list">{visibleSuggested.map((person) => personRow(person, 'suggested'))}</ul>
        {!loading && !visibleSuggested.length && <p className="rec-empty">No suggestions right now.</p>}
      </section>

      <section className="rec-discover-section rec-followback-section">
        <div className="rec-discover-section-head">
          <h2>Follow back</h2>
          <button type="button" onClick={() => navigate('/u/me/followers')}>See all</button>
        </div>
        <ul className="rec-discover-list">{visibleFollowBack.map((person) => personRow(person, 'followBack'))}</ul>
        {!loading && !visibleFollowBack.length && <p className="rec-empty">No new followers to follow back.</p>}
      </section>
      {loading && <p className="rec-empty" role="status">Loading people…</p>}
    </main>
  );
}