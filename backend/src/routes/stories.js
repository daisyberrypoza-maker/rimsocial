const router = require('express').Router();
const { Op, Post, StoryView, StoryLike, Follow, User, PostReport } = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { upload, kindFor, mediaPath } = require('../middleware/upload');
const httpError = require('../utils/httpError');
const { toPostDTO } = require('../lib/serialize');
const stories = require('../services/stories');
const { assertNotBlocked } = require('../lib/blocks');
const cloudinary = require('../services/cloudinary');
const { requestAssetCleanup, cleanupRemovedPostMedia } = require('../services/mediaCleanup');

// GET /v1/stories/rail  -> creators with active stories, unseen first
router.get('/rail', requireAuth, async (req, res, next) => {
  try { res.json(await stories.getStoryRail(req.user.id)); } catch (e) { next(e); }
});

// GET /v1/stories/users/:userId  -> active stories for one creator
router.get('/users/:userId', requireAuth, async (req, res, next) => {
  try {
    await assertNotBlocked(req.user.id, req.params.userId, 'User not found');
    const [items, subscription] = await Promise.all([
      stories.getUserStories(req.params.userId, req.user.id),
      stories.getSubscription(req.params.userId, req.user.id),
    ]);
    res.json({ items, ...subscription });
  } catch (e) { next(e); }
});

// POST /v1/stories  (multipart: media, caption). Expires after storyTtlHours.
router.post('/', requireAuth, upload.single('media'), async (req, res, next) => {
  let uploadedAsset = null;
  let storyPersisted = false;
  try {
    if (!req.file) throw httpError(400, 'Upload an mp4, webm, jpg, png or webp file');
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/stories', { maxSeconds: 15 });
    uploadedAsset = asset;
    const story = await Post.create({
      authorId: req.user.id,
      kind: kindFor(req.file.mimetype),
      mediaUrl: asset.url,
      mediaPublicId: asset.publicId,
      caption: String(req.body.caption || '').slice(0, 200),
      isStory: true,
      expiresAt: new Date(Date.now() + config.storyTtlHours * 3600 * 1000),
    });
    storyPersisted = true;
    res.status(201).json(toPostDTO(story));
  } catch (e) {
    if (uploadedAsset?.publicId && !storyPersisted) {
      await requestAssetCleanup(uploadedAsset.publicId, uploadedAsset.resourceType || (req.file?.mimetype?.startsWith('video/') ? 'video' : 'image'), 'orphan_story_upload', { knownUnreferenced: true }).catch((cleanupError) => console.error('Orphan story upload cleanup failed:', cleanupError.message));
    }
    next(e);
  }
});

// Reshare a public story to the current user's story rail for a fresh 24-hour window.
router.post('/:id/repost', requireAuth, async (req, res, next) => {
  try {
    const original = await Post.findOne({
      where: { id: req.params.id, isStory: true, status: 'live', expiresAt: { [Op.gt]: new Date() } },
      include: [{ model: require('../db').User, as: 'author', attributes: ['username'] }],
    });
    if (!original) throw httpError(404, 'Story not found or expired');
    await assertNotBlocked(req.user.id, original.authorId, 'Story not found or expired');
    if (original.authorId === req.user.id) throw httpError(400, 'This is your own story');
    const story = await Post.create({
      authorId: req.user.id,
      kind: original.kind,
      mediaUrl: original.mediaUrl,
      mediaPublicId: original.mediaPublicId,
      thumbUrl: original.thumbUrl,
      caption: `Shared from @${original.author?.username || 'creator'}: ${original.caption || ''}`.slice(0, 200),
      isStory: true,
      visibility: 'public',
      expiresAt: new Date(Date.now() + config.storyTtlHours * 3600 * 1000),
    });
    res.status(201).json(toPostDTO(story));
  } catch (e) { next(e); }
});


// The story must be live and unexpired; anything else is reported as not found.
async function findLiveStory(id) {
  const story = await Post.findOne({
    where: { id, isStory: true, status: 'live', expiresAt: { [Op.gt]: new Date() } },
    attributes: ['id', 'authorId'],
  });
  if (!story) throw httpError(404, 'Story not found or expired');
  return story;
}

// Like or unlike a story (double-tap or the heart in the viewer). Returns the new state and count.
router.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const story = await findLiveStory(req.params.id);
    await assertNotBlocked(req.user.id, story.authorId, 'Story not found or expired');
    const existing = await StoryLike.findOne({ where: { postId: story.id, userId: req.user.id } });
    let liked;
    if (existing) { await existing.destroy(); liked = false; }
    else { await StoryLike.create({ postId: story.id, userId: req.user.id }); liked = true; }
    const likeCount = await StoryLike.count({ where: { postId: story.id } });
    res.json({ liked, likeCount });
  } catch (e) { next(e); }
});

// Report a story. Uses the same review queue as reported posts.
router.post('/:id/report', requireAuth, async (req, res, next) => {
  try {
    const story = await findLiveStory(req.params.id);
    await assertNotBlocked(req.user.id, story.authorId, 'Story not found or expired');
    if (story.authorId === req.user.id) throw httpError(400, 'You cannot report your own story');
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!reason) throw httpError(400, 'Choose a reason for reporting this story');
    const existing = await PostReport.findOne({ where: { postId: story.id, reporterId: req.user.id, status: 'pending' } });
    if (existing) throw httpError(409, 'You have already reported this story');
    await PostReport.create({ postId: story.id, reporterId: req.user.id, reason: `Story: ${reason}` });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

// Subscribe to a creator (YouTube-style): follows them and turns the bell on. Unsubscribing removes the follow.
router.put('/users/:userId/subscribe', requireAuth, async (req, res, next) => {
  try {
    const creatorId = req.params.userId;
    if (creatorId === req.user.id) throw httpError(400, 'You cannot subscribe to yourself');
    await assertNotBlocked(req.user.id, creatorId, 'User not found');
    const enabled = Boolean(req.body && req.body.enabled);
    const creator = await User.findByPk(creatorId, { attributes: ['id'] });
    if (!creator) throw httpError(404, 'User not found');
    if (enabled) {
      if (!Follow.rawAttributes.notifyPosts) throw httpError(503, 'Subscriptions are not available yet on this server');
      const [follow, created] = await Follow.findOrCreate({
        where: { followerId: req.user.id, followeeId: creatorId },
        defaults: { notifyPosts: true },
      });
      if (created) await User.increment('followerCount', { by: 1, where: { id: creatorId } });
      else if (!follow.notifyPosts) await follow.update({ notifyPosts: true });
    } else {
      const removed = await Follow.destroy({ where: { followerId: req.user.id, followeeId: creatorId } });
      if (removed) await User.increment('followerCount', { by: -1, where: { id: creatorId } });
    }
    res.json({ isSubscribed: enabled, isNotifying: enabled });
  } catch (e) { next(e); }
});

// POST /v1/stories/:id/view  (counted once per viewer)
router.post('/:id/view', requireAuth, async (req, res, next) => {
  try {
    const story = await Post.findOne({
      where: { id: req.params.id, isStory: true, status: 'live', expiresAt: { [Op.gt]: new Date() } },
      attributes: ['id', 'authorId'],
    });
    if (!story) throw httpError(404, 'Story not found or expired');
    await assertNotBlocked(req.user.id, story.authorId, 'Story not found or expired');
    const [, created] = await StoryView.findOrCreate({
      where: { storyId: story.id, viewerId: req.user.id },
    });
    if (created) await Post.increment('viewCount', { by: 1, where: { id: story.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// The owner deletes a story from its open viewer. It is hidden at once and its media is cleaned up.
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const story = await Post.findOne({ where: { id: req.params.id, isStory: true, authorId: req.user.id, status: 'live' } });
    if (!story) throw httpError(404, 'Story not found');
    await story.update({ status: 'removed' });
    try {
      await cleanupRemovedPostMedia(story);
    } catch (cleanupError) {
      console.error('Removed story media cleanup deferred:', cleanupError.message);
    }
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
