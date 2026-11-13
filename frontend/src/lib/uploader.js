import { uploadApi, api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadPage } from './paged.js';
import { toast, logError } from '../toast.js';

// Keep the upload visible until the server confirms success or failure.
export function startUpload(job) {
  const { toStory, file, storyFile, files, caption, topic, aiLabel, allowRemix, visibility, sourcePostId, sponsor, shareToStory } = job;
  const thumb = URL.createObjectURL(file);
  const store = useAppStore.getState();
  store.setPendingUpload({
    kind: toStory ? 'story' : 'post',
    thumb,
    mediaKind: String(file.type).startsWith('video/') ? 'video' : 'image',
    progress: 0,
    status: 'uploading',
  });
  const updateProgress = (progress) => {
    const current = useAppStore.getState().pendingUpload;
    if (current) useAppStore.getState().setPendingUpload({ ...current, progress, status: progress >= 100 ? 'processing' : 'uploading' });
  };

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
    if (toStory) fd.append('media', storyFile || file);
    else (files?.length ? files : [file]).forEach((item) => fd.append('media', item));

    await uploadApi(toStory ? '/v1/stories' : '/v1/posts', fd, updateProgress);

    if (!toStory && shareToStory) {
      const storyFd = new FormData();
      storyFd.append('media', storyFile || file);
      storyFd.append('caption', (caption || '').slice(0, 200));
      try {
        await uploadApi('/v1/stories', storyFd, updateProgress);
      } catch (storyError) {
        toast('Post published, but Story sharing failed: ' + storyError.message);
      }
    }

    if (toStory || shareToStory) {
      const rail = await api('/v1/stories/rail');
      useAppStore.getState().setStoryRail({ items: rail.items || [], updatedAt: Date.now() });
    }
    if (!toStory) {
      useAppStore.getState().setFeed('following', { updatedAt: 0 });
      await loadPage('discover', '/v1/feed/discover', true);
    }
    const current = useAppStore.getState().pendingUpload;
    if (current) useAppStore.getState().setPendingUpload({ ...current, progress: 100, status: 'success' });
    toast(toStory ? 'Story published successfully' : visibility === 'public' ? 'Post published successfully' : 'Post saved successfully');
  })().catch((error) => {
    const current = useAppStore.getState().pendingUpload;
    if (current) useAppStore.getState().setPendingUpload({ ...current, status: 'error', error: error.message });
    logError(error);
  }).finally(() => {
    setTimeout(() => {
      const current = useAppStore.getState().pendingUpload;
      if (current?.thumb === thumb) useAppStore.getState().setPendingUpload(null);
      URL.revokeObjectURL(thumb);
    }, 3500);
  });
}
