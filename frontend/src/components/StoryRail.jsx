import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { mediaUrl } from '../lib/config.js';
import { prefetchMedia } from '../lib/prefetch.js';
import Avatar from './Avatar.jsx';
import StoryViewer from './StoryViewer.jsx';

const REFRESH_AFTER_MS = 30 * 1000;

// Top strip of creators with active stories. Expired groups are hidden on the device too.
export default function StoryRail() {
  const rail = useAppStore((s) => s.storyRail);
  const setStoryRail = useAppStore((s) => s.setStoryRail);
  const [openAt, setOpenAt] = useState(null);

  // Re-reads the rail from the server, so rings reflect what this account has watched
  function refreshRail() {
    api('/v1/stories/rail')
      .then((data) => setStoryRail({ items: data.items, updatedAt: Date.now() }))
      .catch(() => {});
  }

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

  // Behind the scenes: avatars for everyone on the rail, and the first story of the first few creators
  const groupKey = groups.map((g) => g.user.id).join(',');
  useEffect(() => {
    if (!groups.length) return undefined;
    let alive = true;
    prefetchMedia(groups.map((g) => ({ url: mediaUrl(g.user.avatarUrl), kind: 'image' })).filter((i) => i.url));
    const soon = groups.filter((g) => g.unseen).slice(0, 2);
    soon.forEach((g) => {
      api(`/v1/stories/users/${g.user.id}`).then((d) => {
        if (!alive) return;
        useAppStore.getState().setStoryCache(g.user.id, { items: d.items, isSubscribed: Boolean(d.isSubscribed) });
        const first = d.items && d.items[0];
        if (first && first.kind !== 'video') prefetchMedia([{ url: mediaUrl(first.mediaUrl), kind: 'image' }]);
      }).catch(() => {});
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

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
        <StoryViewer groups={groups} startIndex={openAt} onClose={() => { setOpenAt(null); refreshRail(); }} />
      )}
    </>
  );
}
