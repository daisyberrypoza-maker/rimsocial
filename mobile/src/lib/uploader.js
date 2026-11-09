import { api } from '../api';
import { useAppStore } from '../store';
import { loadPage } from './paged';
import { toast, logError } from './toast';

// Uploads in the background: the person lands on Rimlight or Stories at once and the
// spinner shows on that screen until the new item is saved. `file` is { uri, name, type }.
export function startUpload(job) {
  const { toStory, file, caption, topic, aiLabel, allowRemix, visibility, sourcePostId, sponsor, shareToStory } = job;
  const mediaKind = String(file.type || '').startsWith('video/') ? 'video' : 'image';
  useAppStore.getState().setPendingUpload({ kind: toStory ? 'story' : 'post', thumb: file.uri, mediaKind });

  const mediaPart = () => ({ uri: file.uri, name: file.name || 'upload', type: file.type || 'application/octet-stream' });

  (async () => {
    const fd = new FormData();
    fd.append('caption', caption || '');
    fd.append('topic', topic || '');
    fd.append('aiLabel', String(aiLabel));
    fd.append('allowRemix', String(!toStory && allowRemix));
    if (sourcePostId) fd.append('sourcePostId', sourcePostId);
    if (!toStory) fd.append('visibility', visibility);
    if (!toStory && sponsor) {
      fd.append('isSponsored', 'true');
      fd.append('sponsorName', sponsor.name);
      fd.append('sponsorDescription', sponsor.description);
      fd.append('sponsorCta', sponsor.cta);
      fd.append('sponsorUrl', sponsor.url);
    }
    fd.append('media', mediaPart());
    await api(toStory ? '/v1/stories' : '/v1/posts', { method: 'POST', body: fd });

    if (!toStory && shareToStory) {
      const storyFd = new FormData();
      storyFd.append('media', mediaPart());
      storyFd.append('caption', (caption || '').slice(0, 200));
      try { await api('/v1/stories', { method: 'POST', body: storyFd }); }
      catch (storyError) { toast('Post published, but Story sharing failed'); logError(storyError); }
    }

    if (toStory) {
      const rail = await api('/v1/stories/rail');
      useAppStore.getState().setStoryRail({ items: rail.items || [], updatedAt: Date.now() });
    } else {
      useAppStore.getState().setFeed('following', { updatedAt: 0 });
      await loadPage('discover', '/v1/feed/discover', true);
    }
    toast(toStory ? 'Story posted. It disappears in 24 hours.' : visibility === 'public' ? 'Post published' : 'Post saved as Only me');
  })()
    .catch((error) => { toast('Upload failed. Try again.'); logError(error); })
    .finally(() => useAppStore.getState().setPendingUpload(null));
}
