import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import { chatPath } from '../lib/chatLink.js';
import { goBack } from '../lib/goBack.js';
import { toast, logError } from '../toast.js';
import './Following.css';

// Following: accounts you follow. The bell subscribes to their posts and stories,
// the chat icon opens a direct message, and tapping a row opens their profile.
export default function Following() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.user);
  const [people, setPeople] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState({});

  useEffect(() => {
    if (!me?.username) return;
    api(`/v1/users/${encodeURIComponent(me.username)}/following`)
      .then((data) => setPeople(data.items || []))
      .catch((e) => { logError(e); setPeople([]); });
  }, [me?.username]);

  function nameOf(person) {
    return (person.displayName || person.username || '').trim();
  }

  async function toggleNotify(person) {
    if (busy[person.id]) return;
    const enabled = !person.isNotifying;
    setBusy((b) => ({ ...b, [person.id]: true }));
    try {
      const r = await api(`/v1/users/${person.id}/follow/notify`, { method: 'PUT', body: { enabled } });
      setPeople((list) => list.map((p) => (p.id === person.id ? { ...p, isNotifying: Boolean(r?.isNotifying ?? enabled) } : p)));
    } catch (e) {
      logError(e);
      toast('Could not update notifications');
    } finally {
      setBusy((b) => ({ ...b, [person.id]: false }));
    }
  }

  async function unfollow(person) {
    if (busy[person.id]) return;
    setBusy((b) => ({ ...b, [person.id]: true }));
    try {
      await api(`/v1/users/${person.id}/follow`, { method: 'DELETE' });
      setPeople((list) => list.filter((p) => p.id !== person.id));
    } catch (e) {
      logError(e);
      toast('Could not unfollow');
    } finally {
      setBusy((b) => ({ ...b, [person.id]: false }));
    }
  }

  return (
    <div className="fw-page">
      <header className="fw-head">
        <button type="button" className="fw-iconbtn" onClick={() => goBack(navigate, '/')} aria-label="Back">
          <Icon name="chevron-down" size={26} />
        </button>
        <h1>Following</h1>
        <button type="button" className="fw-edit" onClick={() => setEditing((v) => !v)}>{editing ? 'Done' : 'Edit'}</button>
      </header>
      <p className="fw-sub">Manage accounts followed and notifications.</p>

      <div className="fw-list">
        {people && people.map((person) => (
          <div key={person.id} className="fw-row">
            <button type="button" className="fw-who" onClick={() => navigate(`/u/${person.username}`)}>
              <Avatar user={person} size={44} />
              <span className="fw-name">{nameOf(person) || person.username}</span>
            </button>
            {editing ? (
              <button type="button" className="fw-unfollow" onClick={() => unfollow(person)} disabled={busy[person.id]}>Unfollow</button>
            ) : (
              <>
                <button type="button" className="fw-iconbtn" aria-label={`Message ${nameOf(person) || person.username}`} onClick={() => navigate(chatPath('direct', person.id))}>
                  <Icon name="message-circle" size={22} />
                </button>
                <button
                  type="button"
                  className={`fw-iconbtn fw-bell${person.isNotifying ? ' on' : ''}`}
                  aria-pressed={Boolean(person.isNotifying)}
                  aria-label={person.isNotifying ? 'Turn off notifications' : 'Turn on notifications'}
                  onClick={() => toggleNotify(person)}
                  disabled={busy[person.id]}
                >
                  <Icon name="bell" size={22} />
                </button>
              </>
            )}
          </div>
        ))}
        {people && people.length === 0 && <p className="fw-empty">You are not following anyone yet.</p>}
      </div>
    </div>
  );
}
