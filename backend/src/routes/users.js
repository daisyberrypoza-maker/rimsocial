const router = require('express').Router();
const { sequelize, User, Post, Follow } = require('../db');
const { requireAuth } = require('../middleware/auth');
const feed = require('../services/feed');
const httpError = require('../utils/httpError');
const { upload, kindFor, mediaPath } = require('../middleware/upload');

const PUBLIC_ATTRS = ['id', 'username', 'displayName', 'avatarUrl', 'backgroundUrl', 'country', 'followerCount'];

// "me" means the logged-in user; anything else is a username
async function resolveUser(req, ref, attributes) {
  if (ref === 'me') return User.findByPk(req.user.id, { attributes });
  return User.findOne({ where: { username: ref.toLowerCase() }, attributes });
}

// Upload or replace the authenticated user's profile photo.
router.post('/me/avatar', requireAuth, upload.single('media'), async (req, res, next) => {
  try {
    if (!req.file || kindFor(req.file.mimetype) !== 'photo') throw httpError(400, 'Choose a JPG, PNG or WebP profile photo');
    const user = await User.findByPk(req.user.id);
    if (!user) throw httpError(404, 'User not found');
    await user.update({ avatarUrl: mediaPath(req.file.filename) });
    res.json({ avatarUrl: user.avatarUrl });
  } catch (e) { next(e); }
});

// Upload or replace the authenticated user's profile background image.
router.post('/me/background', requireAuth, upload.single('media'), async (req, res, next) => {
  try {
    if (!req.file || kindFor(req.file.mimetype) !== 'photo') throw httpError(400, 'Choose a JPG, PNG or WebP background image');
    const user = await User.findByPk(req.user.id);
    if (!user) throw httpError(404, 'User not found');
    await user.update({ backgroundUrl: mediaPath(req.file.filename) });
    res.json({ backgroundUrl: user.backgroundUrl });
  } catch (e) { next(e); }
});

// GET /v1/users/:username
router.get('/:username', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, PUBLIC_ATTRS);
    if (!user) throw httpError(404, 'User not found');
    const [postCount, follow, followingCount] = await Promise.all([
      Post.count({ where: { authorId: user.id, status: 'live', isStory: false } }),
      Follow.findOne({ where: { followerId: req.user.id, followeeId: user.id } }),
      Follow.count({ where: { followerId: user.id } }),
    ]);
    res.json({ ...user.toJSON(), postCount, followingCount, isFollowing: Boolean(follow), isMe: user.id === req.user.id });
  } catch (e) { next(e); }
});

// GET /v1/users/:username/posts?cursor=...&limit=...
router.get('/:username/posts', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    res.json(await feed.pagePosts({
      where: { authorId: user.id, status: 'live', isStory: false, ...(user.id === req.user.id ? {} : { visibility: 'public' }) },
      cursor: req.query.cursor,
      limit: feed.clampLimit(req.query.limit),
    }));
  } catch (e) { next(e); }
});

// GET follower/following lists for profile stats.
router.get('/:username/followers', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    const rows = await Follow.findAll({ where: { followeeId: user.id }, attributes: ['followerId'], order: [['createdAt', 'DESC']], limit: 300, raw: true });
    const people = await User.findAll({ where: { id: rows.map((r) => r.followerId) }, attributes: PUBLIC_ATTRS });
    res.json({ items: people });
  } catch (e) { next(e); }
});

router.get('/:username/following', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    const rows = await Follow.findAll({ where: { followerId: user.id }, attributes: ['followeeId'], order: [['createdAt', 'DESC']], limit: 300, raw: true });
    const people = await User.findAll({ where: { id: rows.map((r) => r.followeeId) }, attributes: PUBLIC_ATTRS });
    res.json({ items: people });
  } catch (e) { next(e); }
});

// POST /v1/users/:id/follow
router.post('/:id/follow', requireAuth, async (req, res, next) => {
  try {
    const followeeId = req.params.id;
    if (followeeId === req.user.id) throw httpError(400, 'You cannot follow yourself');
    const target = await User.findByPk(followeeId, { attributes: ['id'] });
    if (!target) throw httpError(404, 'User not found');

    await sequelize.transaction(async (t) => {
      const [, created] = await Follow.findOrCreate({
        where: { followerId: req.user.id, followeeId }, transaction: t,
      });
      if (created) await User.increment('followerCount', { by: 1, where: { id: followeeId }, transaction: t });
    });

    const fresh = await User.findByPk(followeeId, { attributes: ['followerCount'] });
    res.json({ isFollowing: true, followerCount: fresh.followerCount });
  } catch (e) { next(e); }
});

// DELETE /v1/users/:id/follow
router.delete('/:id/follow', requireAuth, async (req, res, next) => {
  try {
    const followeeId = req.params.id;
    await sequelize.transaction(async (t) => {
      const removed = await Follow.destroy({
        where: { followerId: req.user.id, followeeId }, transaction: t,
      });
      if (removed) await User.decrement('followerCount', { by: 1, where: { id: followeeId }, transaction: t });
    });
    const fresh = await User.findByPk(followeeId, { attributes: ['followerCount'] });
    if (!fresh) throw httpError(404, 'User not found');
    res.json({ isFollowing: false, followerCount: fresh.followerCount });
  } catch (e) { next(e); }
});

module.exports = router;
