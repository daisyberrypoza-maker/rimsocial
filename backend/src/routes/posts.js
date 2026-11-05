const router = require('express').Router();
const { Post, PostLike, Comment, Follow, User, sequelize } = require('../db');
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
      visibility: req.body.visibility === 'private' ? 'private' : 'public',
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
      include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }],
    });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
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

router.get('/:id/engagement', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    const [like, commentCount] = await Promise.all([
      PostLike.findOne({ where: { postId: post.id, userId: req.user.id }, attributes: ['postId'] }),
      Comment.count({ where: { postId: post.id } }),
    ]);
    res.json({ liked: Boolean(like), likeCount: Number(post.likeCount), commentCount });
  } catch (e) { next(e); }
});

router.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    let liked = false;
    await sequelize.transaction(async (t) => {
      const existing = await PostLike.findOne({ where: { postId: post.id, userId: req.user.id }, transaction: t, lock: t.LOCK.UPDATE });
      if (existing) {
        await existing.destroy({ transaction: t });
        await post.decrement('likeCount', { by: 1, transaction: t });
      } else {
        await PostLike.create({ postId: post.id, userId: req.user.id }, { transaction: t });
        await post.increment('likeCount', { by: 1, transaction: t });
        liked = true;
      }
    });
    const fresh = await Post.findByPk(post.id, { attributes: ['likeCount'] });
    res.json({ likeCount: Math.max(0, Number(fresh.likeCount)), liked });
  } catch (e) { next(e); }
});

router.get('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    const items = await Comment.findAll({
      where: { postId: post.id },
      include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }],
      order: [['createdAt', 'ASC']], limit: 100,
    });
    res.json({ items: items.map(c => ({ id: c.id, body: c.body, createdAt: c.createdAt, author: c.author })) });
  } catch (e) { next(e); }
});

router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body || body.length > 1000) throw httpError(400, 'Write a comment between 1 and 1000 characters');
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    const comment = await Comment.create({ postId: post.id, authorId: req.user.id, body });
    const author = await User.findByPk(req.user.id, { attributes: ['id', 'username', 'displayName', 'avatarUrl'] });
    res.status(201).json({ id: comment.id, body: comment.body, createdAt: comment.createdAt, author });
  } catch (e) { next(e); }
});

router.post('/:id/reshare', requireAuth, async (req, res, next) => {
  try {
    const original = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!original || (original.visibility === 'private' && original.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    if (original.authorId === req.user.id) throw httpError(400, 'You cannot reshare your own post');
    const [reshare, created] = await Post.findOrCreate({
      where: { authorId: req.user.id, resharedPostId: original.id, status: 'live' },
      defaults: { authorId: req.user.id, kind: original.kind, mediaUrl: original.mediaUrl, thumbUrl: original.thumbUrl, caption: original.caption, resharedPostId: original.id, visibility: 'public' },
    });
    if (created) {
      const followers = await Follow.findAll({ where: { followeeId: req.user.id }, attributes: ['followerId'], raw: true });
      await feed.fanOutPost(reshare, followers.map(f => f.followerId));
    }
    res.status(created ? 201 : 200).json({ post: toPostDTO(reshare), reshared: true, created });
  } catch (e) { next(e); }
});

module.exports = router;
