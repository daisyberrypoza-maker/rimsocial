const router = require('express').Router();
const { sequelize, User, Post, Follow } = require('../db');
const { requireAuth } = require('../middleware/auth');
const feed = require('../services/feed');
const httpError = require('../utils/httpError');

const PUBLIC_ATTRS = ['id', 'username', 'displayName', 'avatarUrl', 'country', 'followerCount'];

// "me" means the logged-in user; anything else is a username
async function resolveUser(req, ref, attributes) {
  if (ref === 'me') return User.findByPk(req.user.id, { attributes });
  return User.findOne({ where: { username: ref.toLowerCase() }, attributes });
}

// GET /v1/users/suggestions — creators not followed by the current user
router.get('/suggestions', requireAuth, async (req, res, next) => {
  try {
    const follows = await Follow.findAll({ where: { followerId: req.user.id }, attributes: ['followeeId'], raw: true });
    const excluded = [req.user.id, ...follows.map((row) => row.followeeId)];
    const items = await User.findAll({
      where: { id: { [require('sequelize').Op.notIn]: excluded } },
      attributes: PUBLIC_ATTRS,
      order: [['followerCount', 'DESC'], ['createdAt', 'DESC']],
      limit: 12,
    });
    res.json({ items });
  } catch (e) { next(e); }
});

// GET /v1/users/:username
router.get('/:username', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, PUBLIC_ATTRS);
    if (!user) throw httpError(404, 'User not found');
    const [postCount, follow] = await Promise.all([
      Post.count({ where: { authorId: user.id, status: 'live', isStory: false } }),
      Follow.findOne({ where: { followerId: req.user.id, followeeId: user.id } }),
    ]);
    res.json({ ...user.toJSON(), postCount, isFollowing: Boolean(follow), isMe: user.id === req.user.id });
  } catch (e) { next(e); }
});

// GET /v1/users/:username/posts?cursor=...&limit=...
router.get('/:username/posts', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    res.json(await feed.pagePosts({
      where: { authorId: user.id, status: 'live', isStory: false },
      cursor: req.query.cursor,
      limit: feed.clampLimit(req.query.limit),
    }));
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

/* Followers/following lists use public profile fields only. */
router.get('/:username/followers', requireAuth, async (req, res, next) => {
  try {
    const target = await resolveUser(req, req.params.username, ['id']);
    if (!target) throw httpError(404, 'User not found');
    const rows = await Follow.findAll({ where: { followeeId: target.id }, attributes: ['followerId'], order: [['createdAt', 'DESC']], limit: 100 });
    const ids = rows.map((row) => row.followerId);
    const users = ids.length ? await User.findAll({ where: { id: ids }, attributes: PUBLIC_ATTRS }) : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    res.json({ items: ids.map((id) => byId.get(id)).filter(Boolean) });
  } catch (e) { next(e); }
});

router.get('/:username/following', requireAuth, async (req, res, next) => {
  try {
    const target = await resolveUser(req, req.params.username, ['id']);
    if (!target) throw httpError(404, 'User not found');
    const rows = await Follow.findAll({ where: { followerId: target.id }, attributes: ['followeeId'], order: [['createdAt', 'DESC']], limit: 100 });
    const ids = rows.map((row) => row.followeeId);
    const users = ids.length ? await User.findAll({ where: { id: ids }, attributes: PUBLIC_ATTRS }) : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    res.json({ items: ids.map((id) => byId.get(id)).filter(Boolean) });
  } catch (e) { next(e); }
});

module.exports = router;
