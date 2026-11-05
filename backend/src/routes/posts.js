const router = require('express').Router();
const { Post, Follow, PostLike, Repost, User, sequelize } = require('../db');
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

// DELETE /v1/posts/:id  (owner only; soft delete)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, authorId: req.user.id } });
    if (!post) throw httpError(404, 'Post not found');
    await post.update({ status: 'removed' });
    res.status(204).end();
  } catch (e) { next(e); }
});

// POST /v1/posts/:id/repost — publish a reshare to the current user's followers
router.post('/:id/repost', requireAuth, async (req, res, next) => {
  try {
    const original = await Post.findOne({
      where: { id: req.params.id, status: 'live', isStory: false },
      include: [{ model: User, as: 'author', attributes: ['username', 'displayName'] }],
    });
    if (!original) throw httpError(404, 'Post not found');
    if (String(original.authorId) === String(req.user.id)) throw httpError(400, 'You cannot repost your own post');
    const existing = await Repost.findOne({ where: { originalPostId: original.id, userId: req.user.id } });
    if (existing) {
      const previous = await Post.findByPk(existing.repostedPostId);
      return res.status(200).json(previous ? toPostDTO(previous) : { reposted: true });
    }
    let reposted;
    await sequelize.transaction(async (t) => {
      reposted = await Post.create({
        authorId: req.user.id,
        kind: original.kind,
        mediaUrl: original.mediaUrl,
        thumbUrl: original.thumbUrl,
        caption: `Reposted from @${original.author?.username || 'creator'} — ${original.caption || ''}`.slice(0, 500),
        status: 'live',
        isStory: false,
      }, { transaction: t });
      await Repost.create({ originalPostId: original.id, userId: req.user.id, repostedPostId: reposted.id }, { transaction: t });
    });
    const followers = await Follow.findAll({ where: { followeeId: req.user.id }, attributes: ['followerId'], raw: true });
    await feed.fanOutPost(reposted, followers.map((f) => f.followerId));
    res.status(201).json(toPostDTO(reposted));
  } catch (e) { next(e); }
});

// Views go to Redis and are flushed to MySQL by the worker
router.post('/:id/view', async (req, res, next) => {
  try {
    await redis.incr(`views:${req.params.id}`);
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /v1/posts/:id/like — current viewer's durable like state
router.get('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const [post, like] = await Promise.all([
      Post.findOne({ where: { id: req.params.id, status: 'live' }, attributes: ['id', 'likeCount'] }),
      PostLike.findOne({ where: { postId: req.params.id, userId: req.user.id } }),
    ]);
    if (!post) throw httpError(404, 'Post not found');
    res.json({ liked: Boolean(like), likeCount: post.likeCount });
  } catch (e) { next(e); }
});

router.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live' } });
    if (!post) throw httpError(404, 'Post not found');
    await sequelize.transaction(async (t) => {
      const [, created] = await PostLike.findOrCreate({
        where: { postId: post.id, userId: req.user.id }, defaults: { postId: post.id, userId: req.user.id }, transaction: t,
      });
      if (created) await Post.increment('likeCount', { by: 1, where: { id: post.id }, transaction: t });
    });
    const fresh = await Post.findByPk(post.id, { attributes: ['likeCount'] });
    res.json({ liked: true, likeCount: fresh.likeCount });
  } catch (e) { next(e); }
});

router.delete('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live' } });
    if (!post) throw httpError(404, 'Post not found');
    await sequelize.transaction(async (t) => {
      const removed = await PostLike.destroy({ where: { postId: post.id, userId: req.user.id }, transaction: t });
      if (removed) await Post.decrement('likeCount', { by: 1, where: { id: post.id, likeCount: { [require('sequelize').Op.gt]: 0 } }, transaction: t });
    });
    const fresh = await Post.findByPk(post.id, { attributes: ['likeCount'] });
    res.json({ liked: false, likeCount: fresh.likeCount });
  } catch (e) { next(e); }
});

module.exports = router;
