const router = require('express').Router();
const { Op, Post, StoryView } = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { upload, kindFor, mediaPath } = require('../middleware/upload');
const httpError = require('../utils/httpError');
const { toPostDTO } = require('../lib/serialize');
const stories = require('../services/stories');

// GET /v1/stories/rail  -> creators with active stories, unseen first
router.get('/rail', requireAuth, async (req, res, next) => {
  try { res.json(await stories.getStoryRail(req.user.id)); } catch (e) { next(e); }
});

// GET /v1/stories/users/:userId  -> active stories for one creator
router.get('/users/:userId', requireAuth, async (req, res, next) => {
  try {
    res.json({ items: await stories.getUserStories(req.params.userId, req.user.id) });
  } catch (e) { next(e); }
});

// POST /v1/stories  (multipart: media, caption). Expires after storyTtlHours.
router.post('/', requireAuth, upload.single('media'), async (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, 'Upload an mp4, webm, jpg, png or webp file');
    const story = await Post.create({
      authorId: req.user.id,
      kind: kindFor(req.file.mimetype),
      mediaUrl: mediaPath(req.file.filename),
      caption: String(req.body.caption || '').slice(0, 200),
      isStory: true,
      expiresAt: new Date(Date.now() + config.storyTtlHours * 3600 * 1000),
    });
    res.status(201).json(toPostDTO(story));
  } catch (e) { next(e); }
});

// POST /v1/stories/:id/reshare — publish another public 24-hour story from an active story.
router.post('/:id/reshare', requireAuth, async (req, res, next) => {
  try {
    const original = await Post.findOne({ where: { id: req.params.id, isStory: true, status: 'live', expiresAt: { [Op.gt]: new Date() } } });
    if (!original) throw httpError(404, 'Story not found or expired');
    const story = await Post.create({
      authorId: req.user.id,
      kind: original.kind,
      mediaUrl: original.mediaUrl,
      thumbUrl: original.thumbUrl,
      caption: original.caption,
      isStory: true,
      visibility: 'public',
      resharedPostId: original.id,
      expiresAt: new Date(Date.now() + config.storyTtlHours * 3600 * 1000),
    });
    res.status(201).json({ story: toPostDTO(story), reshared: true });
  } catch (e) { next(e); }
});

// POST /v1/stories/:id/view  (counted once per viewer)
router.post('/:id/view', requireAuth, async (req, res, next) => {
  try {
    const story = await Post.findOne({
      where: { id: req.params.id, isStory: true, status: 'live', expiresAt: { [Op.gt]: new Date() } },
      attributes: ['id'],
    });
    if (!story) throw httpError(404, 'Story not found or expired');
    const [, created] = await StoryView.findOrCreate({
      where: { storyId: story.id, viewerId: req.user.id },
    });
    if (created) await Post.increment('viewCount', { by: 1, where: { id: story.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
