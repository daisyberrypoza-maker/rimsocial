const router = require('express').Router();
const { Post, PostLike, Follow, sequelize } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, kindFor, mediaPath } = require('../middleware/upload');
const feed = require('../services/feed');
const redis = require('../redis');
const httpError = require('../utils/httpError');
const { toPostDTO } = require('../lib/serialize');

// POST /v1/posts  (multipart: media, caption)
router.post('/', requireAuth, upload.single('media'), async (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, 'Upload an mp4, webm, jpg, png or webp file');
    const post = await Post.create({
      authorId: req.user.id,
      kind: kindFor(req.file.mimetype),
      mediaUrl: mediaPath(req.file.filename),
      caption: String(req.body.caption || '').slice(0, 500),
    });
    const followers = await Follow.findAll({
      where: { followeeId: req.user.id }, attributes: ['followerId'], raw: true,
    });
    await feed.fanOutPost(post, followers.map((f) => f.followerId));
    res.status(201).json(toPostDTO(post));
  } catch (e) { next(e); }
});

// GET /v1/posts/:id — shareable post detail with its public creator fields.
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({
      where: { id: req.params.id, status: 'live', isStory: false },
      include: [{ model: require('../db').User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }],
    });
    if (!post) throw httpError(404, 'Post not found');
    res.json(toPostDTO(post));
  } catch (e) { next(e); }
});

// DELETE /v1/posts/:id  (owner only; soft delete)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, authorId: req.user.id } });
    if (!post) throw httpError(404, 'Post not found');
    await post.update({ status: 'removed' });
    res.status(204).end();
  } catch (e) { next(e); }
});

// Views go to Redis and are flushed to MySQL by the worker
router.post('/:id/view', async (req, res, next) => {
  try {
    await redis.incr(`views:${req.params.id}`);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post) throw httpError(404, 'Post not found');
    await sequelize.transaction(async (t) => {
      const [, created] = await PostLike.findOrCreate({
        where: { postId: post.id, userId: req.user.id },
        defaults: { postId: post.id, userId: req.user.id },
        transaction: t,
      });
      if (created) await post.increment('likeCount', { by: 1, transaction: t });
    });
    const fresh = await Post.findByPk(post.id, { attributes: ['likeCount'] });
    res.json({ likeCount: Number(fresh.likeCount), liked: true });
  } catch (e) { next(e); }
});

module.exports = router;
