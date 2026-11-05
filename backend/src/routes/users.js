const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, User, Post, Follow, UserBlock } = require('../db');
const { requireAuth } = require('../middleware/auth');
const feed = require('../services/feed');
const httpError = require('../utils/httpError');
const { upload, kindFor, mediaPath } = require('../middleware/upload');

const PUBLIC_ATTRS = ['id', 'username', 'displayName', 'avatarUrl', 'country', 'followerCount'];

// Resolve whether the currently authenticated viewer follows each person in a list.
async function withFollowState(people, viewerId) {
  if (!people.length) return [];
  const ids = people.map((person) => person.id);
  const follows = await Follow.findAll({
    where: { followerId: viewerId, followeeId: ids },
    attributes: ['followeeId'],
    raw: true,
  });
  const followedIds = new Set(follows.map((row) => row.followeeId));
  return people.map((person) => ({
    ...person.toJSON(),
    isFollowing: followedIds.has(person.id),
  }));
}

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

// Suggested creators and people to follow back for the Discover screen.
router.get('/suggestions', requireAuth, async (req, res, next) => {
  try {
    const [followingRows, followerRows] = await Promise.all([
      Follow.findAll({ where: { followerId: req.user.id }, attributes: ['followeeId'], raw: true }),
      Follow.findAll({ where: { followeeId: req.user.id }, attributes: ['followerId'], raw: true }),
    ]);
    const followingIds = followingRows.map((row) => row.followeeId);
    const followerIds = followerRows.map((row) => row.followerId);
    const [suggested, followBack] = await Promise.all([
      User.findAll({
        where: { id: { [Op.notIn]: [req.user.id, ...followingIds] } },
        attributes: PUBLIC_ATTRS, order: [['followerCount', 'DESC']], limit: 12,
      }),
      followerIds.length ? User.findAll({
        where: { id: { [Op.in]: followerIds, [Op.notIn]: [req.user.id, ...followingIds] } },
        attributes: PUBLIC_ATTRS, limit: 12,
      }) : [],
    ]);
    res.json({
      suggested: await withFollowState(suggested, req.user.id),
      followBack: await withFollowState(followBack, req.user.id),
    });
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
    res.json({ items: await withFollowState(people, req.user.id) });
  } catch (e) { next(e); }
});

router.get('/:username/following', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    const rows = await Follow.findAll({ where: { followerId: user.id }, attributes: ['followeeId'], order: [['createdAt', 'DESC']], limit: 300, raw: true });
    const people = await User.findAll({ where: { id: rows.map((r) => r.followeeId) }, attributes: PUBLIC_ATTRS });
    res.json({ items: await withFollowState(people, req.user.id) });
  } catch (e) { next(e); }
});

// Block and unblock creators from the post controls menu.
router.post('/:id/block', requireAuth, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) throw httpError(400, 'You cannot block yourself');
    const target = await User.findByPk(req.params.id, { attributes: ['id'] });
    if (!target) throw httpError(404, 'User not found');
    await UserBlock.findOrCreate({ where: { blockerId: req.user.id, blockedUserId: req.params.id } });
    res.json({ blocked: true });
  } catch (e) { next(e); }
});
router.delete('/:id/block', requireAuth, async (req, res, next) => {
  try {
    await UserBlock.destroy({ where: { blockerId: req.user.id, blockedUserId: req.params.id } });
    res.json({ blocked: false });
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
