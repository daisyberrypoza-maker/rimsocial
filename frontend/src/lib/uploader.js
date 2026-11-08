import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadPage } from './paged.js';
import { trimVideo, STORY_MAX_SECONDS } from './videoTrim.js';
import { toast, logError } from '../toast.js';

// Uploads a post or story in the background. The person lands on Rimlight or Stories at once,
// the upload carries on there (spinner on the screen), and the new item appears when it finishes.
export function startUpload(job) {
  const { toStory, file, rawFile, caption, topic, aiLabel, allowRemix, visibility, sourcePostId, sponsor, shareToStory } = job;
  const thumb = URL.createObjectURL(file);
  useAppStore.getState().setPendingUpload({
    kind: toStory ? 'story' : 'post',
    thumb,
    mediaKind: String(file.type).startsWith('video/') ? 'video' : 'image',
  });
  const mediaFor = (seconds) => trimVideo(rawFile || file, seconds);

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
    fd.append('media', toStory ? await mediaFor(STORY_MAX_SECONDS) : file);
    await api(toStory ? '/v1/stories' : '/v1/posts', { method: 'POST', body: fd });

    if (!toStory && shareToStory) {
      const storyFd = new FormData();
      storyFd.append('media', await mediaFor(STORY_MAX_SECONDS));
      storyFd.append('caption', (caption || '').slice(0, 200));
      try { await api('/v1/stories', { method: 'POST', body: storyFd }); }
      catch (storyError) { toast('Post published, but Story sharing failed: ' + storyError.message); }
    }

    if (toStory) {
      const rail = await api('/v1/stories/rail');
      useAppStore.getState().setStoryRail(rail.items || []);
    } else {
      useAppStore.getState().setFeed('following', { updatedAt: 0 });
      await loadPage('discover', '/v1/feed/discover', true);
    }
    toast(toStory ? 'Public story posted. It disappears in 24 hours.' : visibility === 'public' ? 'Post published publicly' : 'Post saved as Only me');
  })()
    .catch((error) => logError(error))
    .finally(() => {
      URL.revokeObjectURL(thumb);
      useAppStore.getState().setPendingUpload(null);
    });
}
