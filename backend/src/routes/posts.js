const router = require('express').Router();

async function assertPostAuthorNotBlocked(viewerId, authorId) {
  if (viewerId === authorId) return;
  const relation = await UserBlock.findOne({
    where: { [Op.or]: [
      { blockerId: viewerId, blockedUserId: authorId },
      { blockerId: authorId, blockedUserId: viewerId },
    ] },
    attributes: ['blockerId'],
  });
  if (relation) throw httpError(404, 'Post not found');
}
const { Op } = require('sequelize');
const { Post, PostLike, PostComment, PostReport, Repost, Follow, User, UserBlock, sequelize } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, kindFor, mediaPath } = require('../middleware/upload');
const feed = require('../services/feed');
const redis = require('../redis');
const httpError = require('../utils/httpError');
const { toPostDTO } = require('../lib/serialize');
const cloudinary = require('../services/cloudinary');
const { requestAssetCleanup, cleanupRemovedPostMedia } = require('../services/mediaCleanup');

router.post('/', requireAuth, upload.single('media'), async (req, res, next) => {
  let uploadedAsset = null;
  let postPersisted = false;
  try {
    if (!req.file) throw httpError(400, 'Upload an mp4, webm, jpg, png or webp file');
    const visibility = req.body.visibility === 'private' ? 'private' : 'public';
    const isSponsored = req.body.isSponsored === 'true';
    if (isSponsored) throw httpError(403, 'Sponsored posts must be created through an approved, funded advertiser campaign. Self-declared sponsored posts are disabled.');
    const allowRemix = req.body.allowRemix === 'true';
    const sourcePostId = String(req.body.sourcePostId || '').trim() || null;
    if (sourcePostId) {
      const source = await Post.findOne({ where: { id: sourcePostId, status: 'live', isStory: false, visibility: 'public' } });
      if (!source || !source.allowRemix) throw httpError(403, 'This post is not available for remixing');
      if (source.authorId === req.user.id) throw httpError(400, 'You do not need to remix your own post');
    }
    const sponsorName = String(req.body.sponsorName || '').trim().slice(0, 100);
    const sponsorDescription = String(req.body.sponsorDescription || '').trim().slice(0, 200);
    const sponsorCta = String(req.body.sponsorCta || 'Shop Now').trim().slice(0, 30);
    const sponsorUrl = String(req.body.sponsorUrl || '').trim().slice(0, 1024);
    if (isSponsored && visibility !== 'public') throw httpError(400, 'Sponsored posts must be public');
    if (isSponsored && (!sponsorName || !/^https?:\/\//i.test(sponsorUrl))) {
      throw httpError(400, 'Sponsored posts need a sponsor name and a valid http(s) destination URL');
    }
    const asset = await cloudinary.uploadFile(req.file);
    uploadedAsset = asset;
    const post = await Post.create({
      authorId: req.user.id, kind: kindFor(req.file.mimetype), mediaUrl: asset.url, mediaPublicId: asset.publicId,
      caption: String(req.body.caption || '').slice(0, 500),
      topic: String(req.body.topic || '').trim().slice(0, 60) || null,
      aiLabel: req.body.aiLabel === 'true', visibility, allowRemix, sourcePostId,
      isSponsored, sponsorName: isSponsored ? sponsorName : null,
      sponsorDescription: isSponsored ? sponsorDescription : null,
      sponsorCta: isSponsored ? (sponsorCta || 'Shop Now') : null,
      sponsorUrl: isSponsored ? sponsorUrl : null,
    });
    postPersisted = true;
    if (visibility === 'public') {
      const followers = await Follow.findAll({ where: { followeeId: req.user.id }, attributes: ['followerId'], raw: true });
      await feed.fanOutPost(post, followers.map((f) => f.followerId));
    }
    res.status(201).json(toPostDTO(post));
  } catch (e) {
    if (uploadedAsset?.publicId && !postPersisted) {
      await requestAssetCleanup(uploadedAsset.publicId, uploadedAsset.resourceType || (req.file?.mimetype?.startsWith('video/') ? 'video' : 'image'), 'orphan_post_upload', { knownUnreferenced: true }).catch((cleanupError) => console.error('Orphan post upload cleanup failed:', cleanupError.message));
    }
    next(e);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false }, include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }] });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
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
    try {
      // Remove the post from public feeds immediately; retain a durable cleanup job if Cloudinary is unavailable.
      await cleanupRemovedPostMedia(post);
    } catch (cleanupError) {
      console.error('Removed post media cleanup deferred:', cleanupError.message);
    }
    res.status(204).end();
  } catch (e) { next(e); }
});

router.post('/:id/report', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post) throw httpError(404, 'Post not found');
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!reason) throw httpError(400, 'Choose a reason for reporting this post');
    const existing = await PostReport.findOne({ where: { postId: post.id, reporterId: req.user.id, status: 'pending' } });
    if (existing) throw httpError(409, 'You have already reported this post');
    await PostReport.create({ postId: post.id, reporterId: req.user.id, reason });
    res.status(201).json({ reported: true });
  } catch (e) { next(e); }
});

router.post('/:id/view', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false, visibility: 'public' } });
    if (!post) throw httpError(404, 'Post not found');
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
    await redis.incr(`views:${req.params.id}`);
    res.status(204).end();
  } catch (e) { next(e); }
});

// Record watch-time and explicit feedback for the personalized Discover feed.
router.post('/:id/feedback', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false, visibility: 'public' } });
    if (!post) throw httpError(404, 'Post not found');
    const action = String(req.body?.action || 'watch');
    const watchedSeconds = Number(req.body?.watchedSeconds);
    const durationSeconds = Number(req.body?.durationSeconds);
    let delta = 0;
    if (action === 'not_interested') delta = -18;
    else if (action === 'skip') delta = -Math.min(8, Math.max(1, Number.isFinite(watchedSeconds) ? 8 - watchedSeconds : 6));
    else if (action === 'watch') {
      if (!Number.isFinite(watchedSeconds) || watchedSeconds < 0 || watchedSeconds > 3600
        || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 3600) {
        throw httpError(400, 'Provide valid watchedSeconds and durationSeconds');
      }
      const completion = Math.min(1, watchedSeconds / durationSeconds);
      delta = Math.round(Math.min(12, watchedSeconds * 0.4) + completion * 8);
      if (completion >= 0.9) delta += 4;
    } else throw httpError(400, 'Action must be watch, skip, or not_interested');
    const key = `feed:preferences:${req.user.id}`;
    await redis.hincrby(key, post.id, delta);
    await redis.expire(key, 60 * 60 * 24 * 90);
    res.json({ recorded: true });
  } catch (e) { next(e); }
});

router.get('/:id/engagement', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
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
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
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
    await redis.hincrby(`feed:preferences:${req.user.id}`, post.id, liked ? 4 : -4).catch(() => {});
    await redis.expire(`feed:preferences:${req.user.id}`, 60 * 60 * 24 * 90).catch(() => {});
    const fresh = await Post.findByPk(post.id, { attributes: ['likeCount'] });
    res.json({ likeCount: Math.max(0, Number(fresh.likeCount)), liked });
  } catch (e) { next(e); }
});

router.get('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
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
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
    const comment = await PostComment.create({ postId: post.id, userId: req.user.id, body });
    await redis.hincrby(`feed:preferences:${req.user.id}`, post.id, 3).catch(() => {});
    await redis.expire(`feed:preferences:${req.user.id}`, 60 * 60 * 24 * 90).catch(() => {});
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
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
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
    await redis.hincrby(`feed:preferences:${req.user.id}`, post.id, reposted ? 5 : -5).catch(() => {});
    await redis.expire(`feed:preferences:${req.user.id}`, 60 * 60 * 24 * 90).catch(() => {});
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
