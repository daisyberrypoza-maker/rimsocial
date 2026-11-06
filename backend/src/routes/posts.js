const router = require('express').Router();
const { Post, PostLike, PostComment, Repost, Follow, User, sequelize } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, kindFor, mediaPath } = require('../middleware/upload');
const feed = require('../services/feed');
const redis = require('../redis');
const httpError = require('../utils/httpError');
const { toPostDTO } = require('../lib/serialize');
const notificationRoutes = require('./notifications');

router.post('/', requireAuth, upload.single('media'), async (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, 'Upload an mp4, webm, jpg, png or webp file');
    const visibility = req.body.visibility === 'private' ? 'private' : 'public';
    const post = await Post.create({ authorId: req.user.id, kind: kindFor(req.file.mimetype), mediaUrl: mediaPath(req.file.filename), caption: String(req.body.caption || '').slice(0, 500), visibility });
    if (visibility === 'public') {
      const followers = await Follow.findAll({ where: { followeeId: req.user.id }, attributes: ['followerId'], raw: true });
      await feed.fanOutPost(post, followers.map((f) => f.followerId));
      await notificationRoutes.recordUploadNotifications(req.user.id, post.id, 'post');
    }
    res.status(201).json(toPostDTO(post));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false }, include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }] });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    const liked = Boolean(await PostLike.findOne({ where: { postId: post.id, userId: req.user.id } }));
    const reposted = Boolean(await Repost.findOne({ where: { postId: post.id, userId: req.user.id } }));
    res.json({ ...toPostDTO(post), liked, reposted, visibility: post.visibility });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, authorId: req.user.id } });
    if (!post) throw httpError(404, 'Post not found');
    await post.update({ status: 'removed' });
    res.status(204).end();
  } catch (e) { next(e); }
});

router.post('/:id/view', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false, visibility: 'public' } });
    if (!post) throw httpError(404, 'Post not found');
    await redis.incr(`views:${req.params.id}`);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.get('/:id/engagement', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    const [liked, reposted] = await Promise.all([
      PostLike.findOne({ where: { postId: post.id, userId: req.user.id } }),
      Repost.findOne({ where: { postId: post.id, userId: req.user.id } }),
    ]);
    res.json({ liked: Boolean(liked), reposted: Boolean(reposted) });
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
    const items = await PostComment.findAll({ where: { postId: post.id }, include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }], order: [['createdAt', 'ASC']], limit: 200 });
    res.json({ items: items.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, author: c.author ? { id: c.author.id, username: c.author.username, displayName: c.author.displayName, avatarUrl: c.author.avatarUrl } : null, isMine: c.userId === req.user.id })) });
  } catch (e) { next(e); }
});

router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body || body.length > 1000) throw httpError(400, 'Comment must contain 1–1000 characters');
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    const comment = await PostComment.create({ postId: post.id, userId: req.user.id, body });
    const author = await User.findByPk(req.user.id, { attributes: ['id', 'username', 'displayName', 'avatarUrl'] });
    res.status(201).json({ id: comment.id, body: comment.body, createdAt: comment.createdAt, author, isMine: true });
  } catch (e) { next(e); }
});

router.delete('/:id/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    const comment = await PostComment.findOne({ where: { id: req.params.commentId, postId: req.params.id, userId: req.user.id } });
    if (!comment) throw httpError(404, 'Comment not found');
    await comment.destroy();
    res.status(204).end();
  } catch (e) { next(e); }
});

router.post('/:id/repost', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false, visibility: 'public' } });
    if (!post) throw httpError(404, 'Post not found or cannot be reposted');
    if (post.authorId === req.user.id) throw httpError(400, 'You cannot repost your own post');
    let reposted = false;
    await sequelize.transaction(async (t) => {
      const [, created] = await Repost.findOrCreate({ where: { postId: post.id, userId: req.user.id }, defaults: { postId: post.id, userId: req.user.id }, transaction: t });
      if (created) { await post.increment('repostCount', { by: 1, transaction: t }); reposted = true; }
      else {
        await Repost.destroy({ where: { postId: post.id, userId: req.user.id }, transaction: t });
        await post.decrement('repostCount', { by: 1, transaction: t });
      }
    });
    if (reposted) {
      // Distribute the original post into the reposter's followers feed, as a real repost action.
      const followers = await Follow.findAll({ where: { followeeId: req.user.id }, attributes: ['followerId'], raw: true });
      await feed.fanOutPost(post, followers.map((f) => f.followerId));
    }
    const fresh = await Post.findByPk(post.id, { attributes: ['repostCount'] });
    res.json({ reposted, repostCount: Math.max(0, Number(fresh.repostCount)) });
  } catch (e) { next(e); }
});

module.exports = router;
