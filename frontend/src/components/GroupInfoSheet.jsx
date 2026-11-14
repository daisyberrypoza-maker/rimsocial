import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { toast } from '../toast.js';
import './GroupInfoSheet.css';

// Group info: photo, name, members and leave. Any member can change the photo and name.
export default function GroupInfoSheet({ groupId, group, meId, onClose, onChanged, onLeave }) {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group?.name || '');
  const [busy, setBusy] = useState(false);
  const members = group?.members || [];

  async function saveName() {
    const next = name.trim();
    if (!next || busy) return;
    setBusy(true);
    try {
      const data = await api(`/v1/messages/groups/${groupId}`, { method: 'PATCH', body: { name: next } });
      onChanged({ name: data.group.name });
      setEditing(false);
    } catch (e) { toast(e.message || 'Could not rename the group'); }
    finally { setBusy(false); }
  }

  async function changePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('media', file);
    setBusy(true);
    try {
      const data = await api(`/v1/messages/groups/${groupId}/avatar`, { method: 'POST', body: form });
      onChanged({ avatarUrl: data.group.avatarUrl });
    } catch (e) { toast(e.message || 'Could not change the photo'); }
    finally { setBusy(false); }
  }

  return (
    <div className="gi-backdrop" role="dialog" aria-modal="true" aria-label="Group info">
      <div className="gi-top">
        <button type="button" className="gi-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={24} strokeWidth={2.2} />
        </button>
        <strong>Group info</strong>
        <span className="gi-spacer" aria-hidden="true" />
      </div>

      <div className="gi-body">
        <div className="gi-hero">
          <button type="button" className="gi-photo" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Change group photo">
            {group?.avatarUrl ? <img src={group.avatarUrl} alt="" /> : <Icon name="users" size={40} strokeWidth={1.8} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={changePhoto} />
          <button type="button" className="gi-link" onClick={() => fileRef.current?.click()} disabled={busy}>Change photo</button>
        </div>

        <div className="gi-name-block">
          {editing ? (
            <form className="gi-name-edit" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Group name" autoFocus />
              <button type="submit" className="gi-save" disabled={!name.trim() || busy}>Save</button>
              <button type="button" className="gi-cancel" onClick={() => { setEditing(false); setName(group?.name || ''); }}>Cancel</button>
            </form>
          ) : (
            <button type="button" className="gi-name" onClick={() => { setName(group?.name || ''); setEditing(true); }}>
              <strong>{group?.name || 'Group chat'}</strong>
              <small>Tap to change the name</small>
            </button>
          )}
        </div>

        <h3 className="gi-section">{members.length} {members.length === 1 ? 'member' : 'members'}</h3>
        <ul className="gi-members">
          {members.map((person) => {
            const isMe = String(person.id) === String(meId);
            const isOwner = String(person.id) === String(group?.createdById);
            return (
              <li key={person.id}>
                <button type="button" className="gi-member" onClick={() => person.username && navigate(`/u/${person.username}`)}>
                  <Avatar user={person} size={44} />
                  <span className="gi-member-text">
                    <strong>{isMe ? 'You' : (person.displayName || person.username)}</strong>
                    {person.username && <small>{person.username}</small>}
                  </span>
                  {isOwner && <em className="gi-owner">Admin</em>}
                </button>
              </li>
            );
          })}
        </ul>

        <button type="button" className="gi-leave" onClick={onLeave}>Leave group</button>
      </div>
    </div>
  );
}
