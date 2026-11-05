import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import Avatar from './Avatar.jsx';
import StoryViewer from './StoryViewer.jsx';

const REFRESH_AFTER_MS = 30 * 1000;

// Top strip of creators with active stories. Expired groups are hidden on the device too.
export default function StoryRail() {
  const rail = useAppStore((s) => s.storyRail);
  const setStoryRail = useAppStore((s) => s.setStoryRail);
  const [openAt, setOpenAt] = useState(null);

  useEffect(() => {
    const stale = Date.now() - (rail.updatedAt || 0) > REFRESH_AFTER_MS;
    if (stale) {
      api('/v1/stories/rail')
        .then((data) => setStoryRail({ items: data.items, updatedAt: Date.now() }))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = Date.now();
  const groups = (rail.items || []).filter((g) => new Date(g.expiresAt).getTime() > now);
  if (!groups.length) return null;

  return (
    <>
      <div className="story-rail" role="list" aria-label="Stories">
        {groups.map((g, i) => (
          <button key={g.user.id} className="story-bubble" onClick={() => setOpenAt(i)} role="listitem">
            <span className={`story-ring ${g.unseen ? 'unseen' : ''}`}>
              <Avatar user={g.user} size={58} />
            </span>
            <span className="story-name">{g.user.username}</span>
          </button>
        ))}
      </div>
      {openAt !== null && (
        <StoryViewer groups={groups} startIndex={openAt} onClose={() => setOpenAt(null)} />
      )}
    </>
  );
}
