import { fitImage } from './imageFit.js';
import { uploadInChunks, needsChunks, forgetUpload, CHUNKED_THRESHOLD } from './chunkUpload.js';
import { dominantColorOf } from './dominantColor.js';
import { api, apiWithProgress } from '../api.js';
import { refreshMyThumb } from './myThumb.js';
import { useAppStore } from '../store.js';
import { loadPage } from './paged.js';
import { toast, logError } from '../toast.js';
import { appendStoryMusic } from './storyMusic.js';

// Large files use resumable chunks; smaller files remain in the multipart request.
async function attachMedia(fd, media, onProgress) {
  if (media.size > CHUNKED_THRESHOLD) {
    fd.append('uploadId', await uploadInChunks(media, onProgress));
    return true;
  }
  fd.append('media', media);
  return false;
}

function setUploadProgress(percent, status) {
  const current = useAppStore.getState().pendingUpload;
  if (!current) return;
  const next = Math.max(Number(current.progress) || 0, Math.min(100, Math.round(percent)));
  useAppStore.getState().setPendingUpload({ ...current, progress: next, status });
}

function requestWithProgress(path, body, status, offset = 0, span = 100) {
  return apiWithProgress(path, {
    method: 'POST',
    body,
    onUploadProgress: ({ percent }) => setUploadProgress(offset + (percent * span / 100), status),
  });
}

// Uploads a post or story in the background. Progress reflects actual bytes sent, not an estimated timer.
export function startUpload(job) {
  const { toStory, file, storyFile, storyFiles, files, caption, topic, aiLabel, loopVideo, allowRemix, visibility, sourcePostId, sponsor, shareToStory, storyAudio } = job;
  const thumb = URL.createObjectURL(file);
  useAppStore.getState().setPendingUpload({
    kind: toStory ? 'story' : 'post',
    thumb,
    mediaKind: String(file.type).startsWith('video/') ? 'video' : 'image',
    progress: 0,
    status: 'Preparing media',
  });

  (async () => {
    const fd = new FormData();
    fd.append('caption', caption || '');
    if (!toStory) appendStoryMusic(fd, storyAudio?.music);
    fd.append('topic', topic || '');
    fd.append('aiLabel', String(aiLabel));
    if (!toStory) fd.append('loopVideo', String(loopVideo !== false));
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

    const postItems = [];
    if (!toStory) {
      for (const item of (files?.length ? files : [file])) postItems.push(await fitImage(item, 0.9));
    }
    const chunked = !toStory && needsChunks(postItems);

    if (toStory && storyFiles?.length > 1) {
      for (let index = 0; index < storyFiles.length; index += 1) {
        const media = storyFiles[index];
        const sfd = new FormData();
        const base = index / storyFiles.length * 90;
        const span = 90 / storyFiles.length;
        const wasChunked = await attachMedia(sfd, media, (loaded, total) => {
          setUploadProgress(base + (total ? loaded / total * span : 0), 'Uploading stories');
        });
        sfd.append('caption', caption || '');
        appendStoryMusic(sfd, storyAudio?.music);
        if (storyAudio?.voice) sfd.append('voice', storyAudio.voice);
        if (!wasChunked) await requestWithProgress('/v1/stories', sfd, 'Uploading stories', base, span);
        else await api('/v1/stories', { method: 'POST', body: sfd });
      }
    } else if (toStory) {
      const storyMedia = await fitImage(storyFile || file, 0.9);
      const isChunked = await attachMedia(fd, storyMedia, (loaded, total) => {
        setUploadProgress(total ? loaded / total * 90 : 0, 'Uploading story');
      });
      const dominant = String(storyMedia.type).startsWith('image/') ? await dominantColorOf(storyMedia) : null;
      if (dominant) fd.append('dominantColor', dominant);
      appendStoryMusic(fd, storyAudio?.music);
      if (storyAudio?.voice) fd.append('voice', storyAudio.voice);
      if (!isChunked) await requestWithProgress('/v1/stories', fd, 'Uploading story', 0, 90);
      else await api('/v1/stories', { method: 'POST', body: fd });
    } else if (chunked) {
      const totalBytes = postItems.reduce((sum, item) => sum + item.size, 0);
      let completedBytes = 0;
      const ids = [];
      for (const item of postItems) {
        ids.push(await uploadInChunks(item, (loaded) => {
          setUploadProgress(totalBytes ? (completedBytes + loaded) / totalBytes * 90 : 0, 'Uploading post');
        }));
        completedBytes += item.size;
      }
      fd.append('uploadIds', JSON.stringify(ids));
      setUploadProgress(90, 'Publishing post');
      await api('/v1/posts', { method: 'POST', body: fd });
      for (const item of postItems) await forgetUpload(item);
    } else {
      for (const item of postItems) fd.append('media', item);
      await requestWithProgress('/v1/posts', fd, 'Uploading post', 0, 90);
    }

    if (!toStory && shareToStory) {
      const storyFd = new FormData();
      const storyMedia = storyFile || file;
      const isChunked = await attachMedia(storyFd, storyMedia, (loaded, total) => {
        setUploadProgress(total ? 90 + loaded / total * 8 : 90, 'Sharing to Story');
      });
      appendStoryMusic(storyFd, storyAudio?.music);
      if (storyAudio?.voice) storyFd.append('voice', storyAudio.voice);
      storyFd.append('caption', (caption || '').slice(0, 200));
      try {
        if (!isChunked) await requestWithProgress('/v1/stories', storyFd, 'Sharing to Story', 90, 8);
        else await api('/v1/stories', { method: 'POST', body: storyFd });
        await forgetUpload(storyMedia);
        const storyRail = await api('/v1/stories/rail');
        useAppStore.getState().setStoryRail(storyRail.items || []);
      } catch (storyError) {
        toast('Post published, but Story sharing failed: ' + storyError.message);
      }
    }

    setUploadProgress(100, 'Finishing');
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
