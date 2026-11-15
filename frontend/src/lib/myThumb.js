import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { mediaUrl } from './config.js';

// The current person's newest story or post. It shows as their avatar everywhere except the profile page.
export async function refreshMyThumb() {
  const me = useAppStore.getState().user;
  if (!me?.id) return;
  try {
    const [rail, posts] = await Promise.all([api('/v1/stories/rail'), api('/v1/users/me/posts')]);
    const group = (rail.items || []).find((g) => String(g.user?.id) === String(me.id));
    const storyAt = group ? new Date(group.latestAt).getTime() : 0;
    const post = (posts.items || [])[0] || null;
    const postAt = post ? new Date(post.createdAt).getTime() : 0;
    let thumb = null;
    if (group?.preview && storyAt >= postAt) thumb = toThumb(group.preview);
    else if (post) thumb = toThumb(post);
    useAppStore.getState().setMyThumb(thumb);
  } catch {
    // Keep the current thumbnail if the check fails
  }
}

function toThumb(p) {
  if (p.kind === 'text') return { kind: 'text', text: p.storyText || '', background: p.storyBackground || null };
  const src = p.kind === 'video' ? (p.thumbUrl ? mediaUrl(p.thumbUrl) : null) : mediaUrl(p.mediaUrl);
  return src ? { kind: 'image', src } : null;
}
