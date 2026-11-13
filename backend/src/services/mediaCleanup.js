const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const config = require('../config');
const { Post, User, MediaCleanupJob } = require('../db');
const cloudinary = require('./cloudinary');

function excludedPostWhere(excludePostIds = []) {
  return excludePostIds.length ? { id: { [Op.notIn]: [...new Set(excludePostIds)] } } : {};
}

async function isAssetReferenced(publicId, excludePostIds = []) {
  const base = { status: 'live', ...excludedPostWhere(excludePostIds) };
  const pattern = '%' + publicId + '%';
  const [currentPosts, legacyPosts, activeStories, avatars, covers] = await Promise.all([
    Post.count({ where: { ...base, isStory: false, mediaPublicId: publicId } }),
    Post.count({ where: { ...base, isStory: false, mediaUrl: { [Op.like]: pattern } } }),
    Post.count({ where: { ...base, isStory: true, expiresAt: { [Op.gt]: new Date() }, [Op.or]: [{ mediaPublicId: publicId }, { mediaUrl: { [Op.like]: pattern } }] } }),
    User.count({ where: { avatarUrl: { [Op.like]: pattern } } }),
    User.count({ where: { coverUrl: { [Op.like]: pattern } } }),
  ]);
  return currentPosts + legacyPosts + activeStories + avatars + covers > 0;
}

function localUploadPath(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== 'string') return null;
  let parsed;
  try { parsed = new URL(mediaUrl, 'http://rimsocial.local'); } catch { return null; }
  if (parsed.origin !== 'http://rimsocial.local') return null;
  const pathname = parsed.pathname;
  if (!pathname.startsWith('/uploads/')) return null;
  const filename = path.basename(decodeURIComponent(pathname));
  if (!filename || filename === '.' || filename === '..') return null;
  const root = path.resolve(config.uploadDir);
  const target = path.resolve(root, filename);
  return target.startsWith(root + path.sep) ? target : null;
}

async function cleanupLocalUpload(mediaUrl, excludePostIds = []) {
  const localPath = localUploadPath(mediaUrl);
  if (!localPath) return { done: true };
  const refs = await Post.findAll({
    where: { status: 'live', mediaUrl, ...excludedPostWhere(excludePostIds) },
    attributes: ['id', 'isStory', 'expiresAt'],
    limit: 500,
  });
  const now = Date.now();
  if (refs.some((row) => !row.isStory || (row.expiresAt && new Date(row.expiresAt).getTime() > now))) return { shared: true };
  try { await fs.promises.unlink(localPath); }
  catch (error) { if (error.code !== 'ENOENT') return { done: false, error }; }
  return { done: true };
}

// A story's voice note is its own file. It is removed once no live post still uses it (reposts share it).
async function cleanupStoryVoice(story) {
  if (!story?.voiceUrl) return;
  const publicId = cloudinary.publicIdFromUrl(story.voiceUrl);
  if (!publicId) return;
  const remaining = await Post.count({ where: { voiceUrl: story.voiceUrl, status: 'live', id: { [Op.ne]: story.id } } });
  if (remaining) return;
  await requestAssetCleanup(publicId, 'video', 'story_voice_removed', { knownUnreferenced: true });
}

async function requestAssetCleanup(publicId, resourceType = 'image', reason = 'cleanup', options = {}) {
  if (!publicId) return { done: true };
  const excluded = options.excludePostIds || [];
  if (!options.knownUnreferenced) {
    try {
      if (await isAssetReferenced(publicId, excluded)) return { shared: true };
    } catch (error) {
      console.error('Could not check media references before cleanup:', error.message);
      // Do not delete while reference status is unknown. Persist a delayed job if possible so the
      // worker can re-check references when the database is healthy.
      try {
        const [job] = await MediaCleanupJob.findOrCreate({
          where: { publicId, resourceType },
          defaults: { publicId, resourceType, reason, status: 'pending', attempts: 1, nextAttemptAt: new Date(Date.now() + 60 * 1000), lastError: String(error.message || 'Reference check failed').slice(0, 1000) },
        });
        return { done: false, queued: true, job };
      } catch (queueError) {
        console.error('Could not queue media cleanup while reference status is unknown:', queueError.message);
        return { done: false, queued: false, error };
      }
    }
  }

  let job = null;
  try {
    const [found] = await MediaCleanupJob.findOrCreate({
      where: { publicId, resourceType },
      defaults: { publicId, resourceType, reason, status: 'pending', attempts: 0, nextAttemptAt: new Date() },
    });
    job = found;
    if (job.status === 'completed') return { done: true, queued: true };
    if (job.status === 'cancelled') await job.update({ status: 'pending', reason, attempts: 0, nextAttemptAt: new Date(), lastError: null });
  } catch (error) {
    // If the database is unavailable, still attempt immediate deletion. Callers retain a DB reference when
    // no durable job could be written, so their scheduled retry can recover later.
    console.error('Could not enqueue media cleanup; attempting immediate cleanup:', error.message);
  }

  try {
    await cloudinary.deleteAsset(publicId, resourceType);
    if (job) await job.update({ status: 'completed', attempts: Number(job.attempts || 0) + 1, nextAttemptAt: new Date(), lastError: null });
    return { done: true, queued: Boolean(job) };
  } catch (error) {
    if (job) {
      const attempts = Number(job.attempts || 0) + 1;
      const delayMs = Math.min(24 * 60 * 60 * 1000, 30 * 1000 * (2 ** Math.min(attempts - 1, 10)));
      await job.update({ status: 'pending', attempts, lastError: String(error.message || 'Cleanup failed').slice(0, 1000), nextAttemptAt: new Date(Date.now() + delayMs) }).catch((dbError) => console.error('Could not persist media cleanup retry:', dbError.message));
    }
    console.error('Cloudinary asset cleanup deferred:', publicId, error.message);
    return { done: false, queued: Boolean(job), error };
  }
}

async function cleanupRemovedPostMedia(post) {
  const publicId = post.mediaPublicId || cloudinary.publicIdFromUrl(post.mediaUrl);
  let result;
  if (publicId) {
    result = await requestAssetCleanup(publicId, post.kind === 'video' ? 'video' : 'image', 'post_removed', { excludePostIds: [post.id] });
  } else {
    result = await cleanupLocalUpload(post.mediaUrl, [post.id]);
  }
  if (result.shared || result.queued || result.done) {
    await post.update({ mediaPublicId: null, mediaUrl: '', thumbUrl: null });
    return true;
  }
  return false;
}

async function processPendingMediaCleanup(limit = 50) {
  const jobs = await MediaCleanupJob.findAll({
    where: { status: 'pending', nextAttemptAt: { [Op.lte]: new Date() } },
    order: [['nextAttemptAt', 'ASC']],
    limit,
  });
  for (const job of jobs) {
    try {
      if (await isAssetReferenced(job.publicId)) {
        await job.update({ attempts: Number(job.attempts || 0) + 1, nextAttemptAt: new Date(Date.now() + 24 * 60 * 60 * 1000), lastError: 'Asset is still referenced by live content; retrying later.' });
        continue;
      }
      await cloudinary.deleteAsset(job.publicId, job.resourceType);
      await job.update({ status: 'completed', attempts: Number(job.attempts || 0) + 1, nextAttemptAt: new Date(), lastError: null });
    } catch (error) {
      const attempts = Number(job.attempts || 0) + 1;
      const delayMs = Math.min(24 * 60 * 60 * 1000, 30 * 1000 * (2 ** Math.min(attempts - 1, 10)));
      await job.update({ attempts, nextAttemptAt: new Date(Date.now() + delayMs), lastError: String(error.message || 'Cleanup failed').slice(0, 1000) }).catch((dbError) => console.error('Could not persist cleanup attempt:', dbError.message));
      console.error('Queued media cleanup failed:', job.publicId, error.message);
    }
  }
  return jobs.length;
}

module.exports = { isAssetReferenced, requestAssetCleanup, cleanupLocalUpload, cleanupRemovedPostMedia, processPendingMediaCleanup, localUploadPath, cleanupStoryVoice };
