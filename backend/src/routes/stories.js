const router = require('express').Router();
const { Op, Post, StoryView } = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { upload, kindFor, mediaPath } = require('../middleware/upload');
const httpError = require('../utils/httpError');
const { toPostDTO } = require('../lib/serialize');
const stories = require('../services/stories');
const { assertNotBlocked } = require('../lib/blocks');
const cloudinary = require('../services/cloudinary');
const { requestAssetCleanup } = require('../services/mediaCleanup');

// GET /v1/stories/rail  -> creators with active stories, unseen first
router.get('/rail', requireAuth, async (req, res, next) => {
  try { res.json(await stories.getStoryRail(req.user.id)); } catch (e) { next(e); }
});

// GET /v1/stories/users/:userId  -> active stories for one creator
router.get('/users/:userId', requireAuth, async (req, res, next) => {
  try {
    await assertNotBlocked(req.user.id, req.params.userId, 'User not found');
    res.json({ items: await stories.getUserStories(req.params.userId, req.user.id) });
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

module.exports = router;
