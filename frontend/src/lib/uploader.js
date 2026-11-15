import { fitImage } from './imageFit.js';
import { uploadInChunks, needsChunks, forgetUpload, CHUNKED_THRESHOLD } from './chunkUpload.js';
import { api } from '../api.js';
import { refreshMyThumb } from './myThumb.js';
import { useAppStore } from '../store.js';
import { loadPage } from './paged.js';
import { toast, logError } from '../toast.js';

// A large file goes up in parts and is referenced by id; a small one is sent with the form as before
async function attachMedia(fd, media) {
  if (media.size > CHUNKED_THRESHOLD) fd.append('uploadId', await uploadInChunks(media));
  else fd.append('media', media);
}

// Uploads a post or story in the background. The person lands on Rimlight or Stories at once,
// the upload carries on there (spinner on the screen), and the new item appears when it finishes.
export function startUpload(job) {
  const { toStory, file, storyFile, storyFiles, files, caption, topic, aiLabel, allowRemix, visibility, sourcePostId, sponsor, shareToStory, storyAudio } = job;
  const thumb = URL.createObjectURL(file);
  useAppStore.getState().setPendingUpload({
    kind: toStory ? 'story' : 'post',
    thumb,
    mediaKind: String(file.type).startsWith('video/') ? 'video' : 'image',
  });

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
    // Large files go up in parts first; the post or story then refers to them by upload id
    const postItems = [];
    for (const item of (files?.length ? files : [file])) postItems.push(await fitImage(item, 0.9));
    const chunked = needsChunks(postItems);
    if (toStory) {
      const storyMedia = await fitImage(storyFile || file, 0.9);
      await attachMedia(fd, storyMedia);
      if (storyAudio?.musicId) fd.append('musicId', storyAudio.musicId);
      if (storyAudio?.voice) fd.append('voice', storyAudio.voice);
    }
    else if (chunked) {
      const ids = [];
      for (const item of postItems) ids.push(await uploadInChunks(item));
      fd.append('uploadIds', JSON.stringify(ids));
    }
    else for (const item of postItems) fd.append('media', item);
    if (toStory && storyFiles?.length > 1) {
      // Several stories: each photo or video is its own story, in the order chosen
      for (const media of storyFiles) {
        const sfd = new FormData();
        await attachMedia(sfd, media);
        sfd.append('caption', caption || '');
        if (storyAudio?.musicId) sfd.append('musicId', storyAudio.musicId);
        if (storyAudio?.voice) sfd.append('voice', storyAudio.voice);
        await api('/v1/stories', { method: 'POST', body: sfd });
      }
    } else {
      await api(toStory ? '/v1/stories' : '/v1/posts', { method: 'POST', body: fd });
      for (const item of postItems) forgetUpload(item);
    }

    if (!toStory && shareToStory) {
      const storyFd = new FormData();
      await attachMedia(storyFd, storyFile || file);
      if (storyAudio?.musicId) storyFd.append('musicId', storyAudio.musicId);
      if (storyAudio?.voice) storyFd.append('voice', storyAudio.voice);
      storyFd.append('caption', (caption || '').slice(0, 200));
      try {
        await api('/v1/stories', { method: 'POST', body: storyFd });
        forgetUpload(storyFile || file);
        // Refresh the Stories rail so the shared story shows at once
        const storyRail = await api('/v1/stories/rail');
        useAppStore.getState().setStoryRail(storyRail.items || []);
      }
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
    .catch((error) => { logError(error); toast(`${toStory ? 'Story' : 'Post'} not posted: ${error?.message || 'try again'}`); })
    .finally(() => {
      refreshMyThumb();
      URL.revokeObjectURL(thumb);
      useAppStore.getState().setPendingUpload(null);
    });
}
