import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { logError } from '../toast.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import StoryViewer from './StoryViewer.jsx';
import '../pages/ChatList.css';

// Time since a status update, WhatsApp-style: just now, 5 minutes ago, 3 hours ago, yesterday
function timeAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return hours < 48 ? 'Yesterday' : `${Math.floor(hours / 24)} days ago`;
}

// The Stories filter in Chat: a vertical list, like the WhatsApp status list.
// My status first, then Recent updates (not yet watched), then Viewed updates.
export default function StoryList() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.user);
  const rail = useAppStore((s) => s.storyRail);
  const [openIndex, setOpenIndex] = useState(null);

  useEffect(() => {
    api('/v1/stories/rail')
      .then((data) => useAppStore.getState().setStoryRail(data.items || []))
      .catch(logError);
  }, []);

  const now = Date.now();
  const groups = (Array.isArray(rail) ? rail : []).filter((g) => g.user && new Date(g.expiresAt).getTime() > now);
  const mine = groups.find((g) => String(g.user.id) === String(me?.id));
  const others = groups.filter((g) => g !== mine);
  const recent = others.filter((g) => g.unseen);
  const viewed = others.filter((g) => !g.unseen);

  function openGroup(group) {
    const index = groups.indexOf(group);
    if (index >= 0) setOpenIndex(index);
  }

  function row(group, ring) {
    const name = group.user.displayName || group.user.username;
    return (
      <button type="button" key={group.user.id} className="wa-status-row" onClick={() => openGroup(group)} aria-label={`Status from ${name}`}>
        <span className="wa-status-avatar"><Avatar user={group.user} size={52} storyRing={ring} /></span>
        <span className="wa-status-text">
          <strong>{name}</strong>
          <small>{timeAgo(group.latestAt)}</small>
        </span>
      </button>
    );
  }

  return (
    <section className="wa-status" aria-label="Status updates">
      <button
        type="button"
        className="wa-status-row"
        onClick={() => (mine ? openGroup(mine) : navigate('/upload?story=1'))}
        aria-label={mine ? 'View my status' : 'Add status update'}
      >
        <span className="wa-status-avatar">
          <Avatar user={me || {}} size={52} storyRing={mine ? 'mine' : null} />
          {!mine && <span className="wa-status-plus"><Icon name="plus" size={12} strokeWidth={3} /></span>}
        </span>
        <span className="wa-status-text">
          <strong>My status</strong>
          <small>{mine ? `${timeAgo(mine.latestAt)}` : 'Tap to add status update'}</small>
        </span>
      </button>

      {recent.length > 0 && <h3>Recent updates</h3>}
      {recent.map((group) => row(group, 'unseen'))}

      {viewed.length > 0 && <h3>Viewed updates</h3>}
      {viewed.map((group) => row(group, 'seen'))}

      {groups.length === 0 && <p className="wa-status-empty">No status updates yet. Share a photo, video or text and your friends can see it for 24 hours.</p>}

      {openIndex !== null && (
        <StoryViewer groups={groups} startIndex={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </section>
  );
}
