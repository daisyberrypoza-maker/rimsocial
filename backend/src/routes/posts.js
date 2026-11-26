const config = require('../config');
const { pricingFor, pricingForCurrency, PAYSTACK_MIN_MINOR } = require('../lib/boostPricing');
const { normalizeAdFormat, defaultAdFormat } = require('../lib/adFormat');
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
const { Post, PostLike, PostComment, CommentLike, PostReport, Repost, Follow, User, UserBlock, SavedPost, LedgerEntry, sequelize } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, kindFor, mediaPath } = require('../middleware/upload');
const feed = require('../services/feed');
const redis = require('../redis');
const httpError = require('../utils/httpError');
const { toPostDTO } = require('../lib/serialize');
const { resolveMusic, storyMusicFields } = require('../services/storyMusic');
const cloudinary = require('../services/cloudinary');
const { requestAssetCleanup, cleanupRemovedPostMedia } = require('../services/mediaCleanup');
const uploads = require('../services/uploadSessions');

// Chunked uploads arrive as a JSON list of upload ids, in carousel order (at most 10)
function parseUploadIds(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { throw httpError(400, 'Invalid upload list'); }
  }
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 10) throw httpError(400, 'Choose up to 10 files');
  return list.map(String);
}

router.post('/', requireAuth, upload.array('media', 10), require('../middleware/verifyUpload').verifyUploads(['photo', 'video']), async (req, res, next) => {
  const uploadedAssets = [];
  let postPersisted = false;
  try {
    const files = Array.isArray(req.files) ? [...req.files] : [];
    const uploadIds = parseUploadIds(req.body.uploadIds);
    for (const id of uploadIds) files.push(await uploads.consumeSession(id, req.user.id));
    if (!files.length) throw httpError(400, 'Upload an mp4, webm, jpg, png or webp file');
    const visibility = req.body.visibility === 'private' ? 'private' : 'public';
    const isSponsored = req.body.isSponsored === 'true';
    if (isSponsored) throw httpError(403, 'Sponsored posts must be created through an approved, funded advertiser campaign. Self-declared sponsored posts are disabled.');
    const allowRemix = req.body.allowRemix === 'true';
    const sourcePostId = String(req.body.sourcePostId || '').trim() || null;
    if (sourcePostId) {
      const source = await Post.findOne({ where: { id: sourcePostId, status: 'live', isStory: false, visibility: 'public' } });
      if (!source || !source.allowRemix) throw httpError(403, 'This post is not available for remixing');
      if (String(source.authorId) === String(req.user.id)) throw httpError(400, 'You do not need to remix your own post');
      await assertPostAuthorNotBlocked(req.user.id, source.authorId);
    }
    const sponsorName = String(req.body.sponsorName || '').trim().slice(0, 100);
    const sponsorDescription = String(req.body.sponsorDescription || '').trim().slice(0, 200);
    const sponsorCta = String(req.body.sponsorCta || 'Shop Now').trim().slice(0, 30);
    const sponsorUrl = String(req.body.sponsorUrl || '').trim().slice(0, 1024);
    if (isSponsored && visibility !== 'public') throw httpError(400, 'Sponsored posts must be public');
    if (isSponsored && (!sponsorName || !/^https?:\/\//i.test(sponsorUrl))) {
      throw httpError(400, 'Sponsored posts need a sponsor name and a valid http(s) destination URL');
    }
    // A post can hold up to 10 photos and/or videos (carousel). The first item is the cover.
    const items = [];
    for (const file of files) {
      const asset = await cloudinary.uploadFile(file, 'rimsocial', { maxSeconds: 20 * 60 });
      uploadedAssets.push({ ...asset, mimetype: file.mimetype });
      items.push({ url: asset.url, publicId: asset.publicId, kind: kindFor(file.mimetype) });
    }
    const cover = items[0];
    const post = await Post.create({
      authorId: req.user.id, kind: cover.kind, mediaUrl: cover.url, mediaPublicId: cover.publicId, mediaItems: items.length > 1 ? items : null,
      caption: String(req.body.caption || '').slice(0, 500),
      topic: String(req.body.topic || '').trim().slice(0, 60) || null,
      aiLabel: req.body.aiLabel === 'true', visibility, allowRemix, sourcePostId, loopVideo: req.body.loopVideo !== 'false',
      isSponsored, sponsorName: isSponsored ? sponsorName : null,
      sponsorDescription: isSponsored ? sponsorDescription : null,
      sponsorCta: isSponsored ? (sponsorCta || 'Shop Now') : null,
      sponsorUrl: isSponsored ? sponsorUrl : null,
    });
    postPersisted = true;
    for (const id of uploadIds) await uploads.releaseSession(id);
    if (visibility === 'public') {
      const followers = await Follow.findAll({ where: { followeeId: req.user.id }, attributes: ['followerId'], raw: true });
      await feed.fanOutPost(post, followers.map((f) => f.followerId));
    }
    res.status(201).json(toPostDTO(post));
  } catch (e) {
    if (!postPersisted) {
      for (const asset of uploadedAssets) {
        if (!asset?.publicId) continue;
        await requestAssetCleanup(asset.publicId, asset.resourceType || (asset.mimetype?.startsWith('video/') ? 'video' : 'image'), 'orphan_post_upload', { knownUnreferenced: true }).catch((cleanupError) => console.error('Orphan post upload cleanup failed:', cleanupError.message));
      }
    }
    next(e);
  }
});

// Promotion pricing and the one-time first-boost credit, in the owner's country currency
async function promotionPricingFor(userId) {
  const user = await User.findByPk(userId, { attributes: ['id', 'country'], raw: true });
  return pricingFor(user?.country);
}
async function firstBoostCreditFor(userId, pricing) {
  const used = await LedgerEntry.findOne({ where: { kind: 'boost_credit', refId: String(userId) }, attributes: ['id'], raw: true });
  return used ? 0 : pricing.creditMinor;
}
router.get('/boost-offer', requireAuth, async (req, res, next) => {
  try {
    const pricing = await promotionPricingFor(req.user.id);
    const creditMinor = await firstBoostCreditFor(req.user.id, pricing);
    res.json({
      currency: pricing.currency, minorUnit: 100,
      dailyMinMinor: pricing.dailyMinMinor, dailyMaxMinor: pricing.dailyMaxMinor, dailyDefaultMinor: pricing.dailyDefaultMinor,
      creditMinor, eligible: creditMinor > 0,
    });
  } catch (e) { next(e); }
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
    // A report is a strong negative recommendation signal for the reporting viewer.
    const preferenceKey = `feed:preferences:${req.user.id}`;
    const previous = Number(await redis.hget(preferenceKey, post.id).catch(() => 0)) || 0;
    await redis.hset(preferenceKey, post.id, String(Math.max(-40, previous - 18)));
    if (post.topic) {
      const topicKey = `feed:topic-preferences:${req.user.id}`;
      const topic = String(post.topic).trim().toLowerCase().slice(0, 60);
      if (topic) {
        const topicPrevious = Number(await redis.hget(topicKey, topic).catch(() => 0)) || 0;
        await redis.hset(topicKey, topic, String(Math.max(-40, topicPrevious - 8)));
        await redis.expire(topicKey, 60 * 60 * 24 * 90);
      }
    }
    await Promise.all([
      redis.del(`feed:discover:ranked:${req.user.id}`),
      redis.del(`feed:explore:ranked:${req.user.id}`),
    ]).catch(() => {});
    res.status(201).json({ reported: true });
  } catch (e) { next(e); }
});

router.post('/:id/view', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false, visibility: 'public' } });
    if (!post) throw httpError(404, 'Post not found');
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
    await redis.incr(`views:${req.params.id}`);
    // Unique viewers: each person counts once per post (the author's own views do not count)
    if (String(post.authorId) !== String(req.user.id)) {
      await sequelize.query('INSERT IGNORE INTO post_viewers (postId, userId, createdAt) VALUES (:postId, :userId, NOW())', {
        replacements: { postId: post.id, userId: req.user.id },
      }).catch((err) => console.warn('post viewer not recorded:', err.message));
    }
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
    const [liked, reposted, saved] = await Promise.all([
      PostLike.findOne({ where: { postId: post.id, userId: req.user.id } }),
      Repost.findOne({ where: { postId: post.id, userId: req.user.id } }),
      SavedPost.findOne({ where: { postId: post.id, userId: req.user.id } }),
    ]);
    res.json({ liked: Boolean(liked), reposted: Boolean(reposted), saved: Boolean(saved) });
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
    const likedRows = items.length ? await CommentLike.findAll({ where: { commentId: items.map((c) => c.id), userId: req.user.id }, attributes: ['commentId'], raw: true }) : [];
    const liked = new Set(likedRows.map((r) => String(r.commentId)));
    res.json({ items: items.map((c) => ({ id: c.id, body: c.body, parentId: c.parentId, likeCount: c.likeCount || 0, liked: liked.has(String(c.id)), createdAt: c.createdAt, author: c.author ? { id: c.author.id, username: c.author.username, displayName: c.author.displayName, avatarUrl: c.author.avatarUrl } : null, isMine: c.userId === req.user.id })) });
  } catch (e) { next(e); }
});

router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body || body.length > 1000) throw httpError(400, 'Comment must contain 1–1000 characters');
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
    // Replies go one level deep: a reply to a reply is stored under the top-level comment
    let parentId = null;
    if (req.body.parentId) {
      const target = await PostComment.findOne({ where: { id: String(req.body.parentId), postId: post.id } });
      if (!target) throw httpError(404, 'Comment not found');
      parentId = target.parentId || target.id;
    }
    const comment = await PostComment.create({ postId: post.id, userId: req.user.id, body, parentId });
    await redis.hincrby(`feed:preferences:${req.user.id}`, post.id, 3).catch(() => {});
    await redis.expire(`feed:preferences:${req.user.id}`, 60 * 60 * 24 * 90).catch(() => {});
    const author = await User.findByPk(req.user.id, { attributes: ['id', 'username', 'displayName', 'avatarUrl'] });
    res.status(201).json({ id: comment.id, body: comment.body, parentId: comment.parentId, createdAt: comment.createdAt, author, isMine: true });
  } catch (e) { next(e); }
});

// Like or unlike a comment (toggle). The count changes in the same transaction as the like row.
router.post('/:id/comments/:commentId/like', requireAuth, async (req, res, next) => {
  try {
    const comment = await PostComment.findOne({ where: { id: req.params.commentId, postId: req.params.id } });
    if (!comment) throw httpError(404, 'Comment not found');
    const result = await sequelize.transaction(async (t) => {
      const existing = await CommentLike.findOne({ where: { commentId: comment.id, userId: req.user.id }, transaction: t });
      if (existing) {
        await existing.destroy({ transaction: t });
        await PostComment.decrement('likeCount', { by: 1, where: { id: comment.id, likeCount: { [Op.gt]: 0 } }, transaction: t });
      } else {
        await CommentLike.create({ commentId: comment.id, userId: req.user.id }, { transaction: t });
        await PostComment.increment('likeCount', { by: 1, where: { id: comment.id }, transaction: t });
      }
      const fresh = await PostComment.findByPk(comment.id, { attributes: ['likeCount'], transaction: t });
      return { liked: !existing, likeCount: Math.max(0, Number(fresh.likeCount) || 0) };
    });
    res.json(result);
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

// Save a post to your Saved list (bookmark)
router.post('/:id/save', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false } });
    if (!post || (post.visibility === 'private' && post.authorId !== req.user.id)) throw httpError(404, 'Post not found');
    await assertPostAuthorNotBlocked(req.user.id, post.authorId);
    await SavedPost.findOrCreate({ where: { postId: post.id, userId: req.user.id }, defaults: { postId: post.id, userId: req.user.id } });
    res.json({ saved: true });
  } catch (e) { next(e); }
});

// Remove a post from your Saved list
router.delete('/:id/save', requireAuth, async (req, res, next) => {
  try {
    await SavedPost.destroy({ where: { postId: req.params.id, userId: req.user.id } });
    res.json({ saved: false });
  } catch (e) { next(e); }
});

// Promote: pay with Paystack to show a post as an ad. The budget and currency follow the owner's country.
router.post('/:id/boost', requireAuth, async (req, res, next) => {
  try {
    if (!config.paystackSecret) throw httpError(503, 'Promotion payments are not set up yet');
    const post = await Post.findOne({ where: { id: req.params.id, status: 'live', isStory: false, authorId: req.user.id } });
    if (!post) throw httpError(404, 'Post not found');
    const pricing = await promotionPricingFor(req.user.id);
    const days = Math.round(Number(req.body?.days));
    if (!Number.isInteger(days) || days < 1 || days > 14) throw httpError(400, 'Choose between 1 and 14 days');
    const dailyMinor = Math.round(Number(req.body?.dailyMinor));
    if (!Number.isFinite(dailyMinor) || dailyMinor < pricing.dailyMinMinor || dailyMinor > pricing.dailyMaxMinor) throw httpError(400, 'Choose a daily budget within the allowed range');
    const sponsorName = String(req.body?.sponsorName || '').trim().slice(0, 100);
    const sponsorDescription = String(req.body?.sponsorDescription || '').trim().slice(0, 200);
    const sponsorCta = String(req.body?.sponsorCta || 'Shop Now').trim().slice(0, 30);
    const sponsorUrl = String(req.body?.sponsorUrl || '').trim().slice(0, 1024);
    if (!sponsorName) throw httpError(400, 'Enter the name to show on the ad');
    const adFormat = normalizeAdFormat(req.body?.adFormat) || defaultAdFormat(post.kind);
    if (req.body?.adFormat && !normalizeAdFormat(req.body.adFormat)) throw httpError(400, 'Choose an ad format: video, photo, text, music or product');
    if (!/^https?:\/\//i.test(sponsorUrl)) throw httpError(400, 'Enter a valid link starting with https://');
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'email'] });
    const email = String(user?.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Add a valid email to your account first');

    const amountMinor = dailyMinor * days;
    // The first-boost credit covers part or all of it. A card charge is at least the Paystack minimum.
    let creditMinor = Math.min(await firstBoostCreditFor(req.user.id, pricing), amountMinor);
    let chargeMinor = amountMinor - creditMinor;
    if (chargeMinor > 0 && chargeMinor < PAYSTACK_MIN_MINOR) { chargeMinor = PAYSTACK_MIN_MINOR; creditMinor = amountMinor - chargeMinor; }
    if (chargeMinor === 0) {
      // Fully covered by the first-boost credit: promote now, no payment
      try {
        await sequelize.transaction(async (t) => {
          await LedgerEntry.create({ userId: req.user.id, kind: 'boost_credit', deltaMinor: creditMinor, refId: String(req.user.id) }, { transaction: t });
          const now = new Date();
          const start = post.promotedUntil && new Date(post.promotedUntil) > now ? new Date(post.promotedUntil) : now;
          await post.update({
            isSponsored: true,
            promotedUntil: new Date(start.getTime() + days * 86400000),
            sponsorName, sponsorDescription, sponsorCta, sponsorUrl, adFormat,
          }, { transaction: t });
        });
      } catch (e) {
        if (e.name === 'SequelizeUniqueConstraintError') throw httpError(409, 'Your first-boost offer has already been used');
        throw e;
      }
      return res.json({ free: true, boosted: true, days, currency: pricing.currency, amountMinor, creditMinor, chargeMinor: 0 });
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.paystackSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: chargeMinor,
        currency: pricing.currency,
        ...(config.appUrl ? { callback_url: `${config.appUrl}/p/${post.id}` } : {}),
        metadata: {
          userId: req.user.id, purpose: 'post_boost', postId: post.id, days, currency: pricing.currency,
          dailyMinor, amountMinor, creditMinor, chargeMinor, sponsorName, sponsorDescription, sponsorCta, sponsorUrl, adFormat,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.status || !data.data?.authorization_url || !data.data?.reference) throw httpError(502, 'Payment provider could not start checkout');
    res.json({ free: false, authorizationUrl: data.data.authorization_url, reference: data.data.reference, currency: pricing.currency, amountMinor, creditMinor, chargeMinor, days });
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

// POST /v1/posts/text  (JSON: text, background, visibility) - a text-only post shown in Rimlight
router.post('/text', requireAuth, async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim().slice(0, 500);
    const music = await resolveMusic(req.body || {}, { AudioTrack: require('../db').AudioTrack });
    if (!text && !music) throw httpError(400, 'Write some text or choose a music track');
    const background = String(req.body?.background || 'sunset').slice(0, 40);
    const visibility = req.body?.visibility === 'private' ? 'private' : 'public';
    const post = await Post.create({
      authorId: req.user.id, kind: 'text', mediaUrl: null, storyText: text || null, storyBackground: background,
      ...storyMusicFields(music, req.body || {}),
      caption: '', visibility, allowRemix: false, isStory: false,
    });
    res.status(201).json(toPostDTO(post));
  } catch (e) { next(e); }
});

module.exports = router;
