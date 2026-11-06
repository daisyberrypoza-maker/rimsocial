const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, User, Post, Follow, UserBlock } = require('../db');
const { requireAuth } = require('../middleware/auth');
const feed = require('../services/feed');
const httpError = require('../utils/httpError');
const { upload, kindFor, mediaPath } = require('../middleware/upload');
const cloudinary = require('../services/cloudinary');
const { requestAssetCleanup } = require('../services/mediaCleanup');

const PUBLIC_ATTRS = ['id', 'username', 'displayName', 'avatarUrl', 'coverUrl', 'country', 'followerCount'];

// Resolve whether the currently authenticated viewer follows each person in a list.
async function excludeBlockedPeople(people, viewerId) {
  if (!people.length) return [];
  const rows = await UserBlock.findAll({
    where: { [Op.or]: [{ blockerId: viewerId }, { blockedUserId: viewerId }] },
    attributes: ['blockerId', 'blockedUserId'],
    raw: true,
  });
  const blockedIds = new Set(rows.map((row) => row.blockerId === viewerId ? row.blockedUserId : row.blockerId));
  return people.filter((person) => !blockedIds.has(person.id));
}

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

async function assertNotBlocked(viewerId, targetId) {
  if (viewerId === targetId) return;
  const relation = await UserBlock.findOne({
    where: { [Op.or]: [
      { blockerId: viewerId, blockedUserId: targetId },
      { blockerId: targetId, blockedUserId: viewerId },
    ] },
    attributes: ['blockerId'],
  });
  if (relation) throw httpError(404, 'User not found');
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
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/avatars');
    const oldAvatar = user.avatarUrl;
    try {
      await user.update({ avatarUrl: asset.url });
    } catch (updateError) {
      if (asset.publicId) {
        await requestAssetCleanup(asset.publicId, asset.resourceType || 'image', 'orphan_avatar_upload', { knownUnreferenced: true })
          .catch((cleanupError) => console.error('Orphan avatar cleanup failed:', cleanupError.message));
      }
      throw updateError;
    }
    const oldId = cloudinary.publicIdFromUrl(oldAvatar);
    if (oldId && oldId !== asset.publicId) {
      await requestAssetCleanup(oldId, 'image', 'avatar_replaced')
        .catch((cleanupError) => console.error('Old avatar cleanup queue failed:', cleanupError.message));
    }
    res.json({ avatarUrl: user.avatarUrl });
  } catch (e) { next(e); }
});
 
// Upload or replace the authenticated user's profile cover image.
router.post('/me/cover', requireAuth, upload.single('media'), async (req, res, next) => {
  try {
    if (!req.file || kindFor(req.file.mimetype) !== 'photo') throw httpError(400, 'Choose a JPG, PNG or WebP cover image');
    const user = await User.findByPk(req.user.id);
    if (!user) throw httpError(404, 'User not found');
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/covers');
    const oldCover = user.coverUrl;
    try {
      await user.update({ coverUrl: asset.url });
    } catch (updateError) {
      if (asset.publicId) {
        await requestAssetCleanup(asset.publicId, asset.resourceType || 'image', 'orphan_cover_upload', { knownUnreferenced: true })
          .catch((cleanupError) => console.error('Orphan cover cleanup failed:', cleanupError.message));
      }
      throw updateError;
    }
    const oldId = cloudinary.publicIdFromUrl(oldCover);
    if (oldId && oldId !== asset.publicId) {
      await requestAssetCleanup(oldId, 'image', 'cover_replaced')
        .catch((cleanupError) => console.error('Old cover cleanup queue failed:', cleanupError.message));
    }
    res.json({ coverUrl: user.coverUrl });
  } catch (e) { next(e); }
});


// Suggested creators and people to follow back for the Discover screen.
router.get('/suggestions', requireAuth, async (req, res, next) => {
  try {
    const [followingRows, followerRows, blockRows] = await Promise.all([
      Follow.findAll({ where: { followerId: req.user.id }, attributes: ['followeeId'], raw: true }),
      Follow.findAll({ where: { followeeId: req.user.id }, attributes: ['followerId'], raw: true }),
      UserBlock.findAll({ where: { [Op.or]: [{ blockerId: req.user.id }, { blockedUserId: req.user.id }] }, attributes: ['blockerId', 'blockedUserId'], raw: true }),
    ]);
    const blockedIds = blockRows.map((row) => row.blockerId === req.user.id ? row.blockedUserId : row.blockerId);
    const followingIds = followingRows.map((row) => row.followeeId);
    const followerIds = followerRows.map((row) => row.followerId);
    const excludedIds = [...new Set([req.user.id, ...followingIds, ...blockedIds])];

    // Recommend second-degree connections first, ranked by shared follows.
    const mutualRows = followingIds.length ? await Follow.findAll({
      where: { followerId: { [Op.in]: followingIds }, followeeId: { [Op.notIn]: excludedIds } },
      attributes: ['followeeId'], raw: true,
    }) : [];
    const mutualCounts = new Map();
    for (const row of mutualRows) mutualCounts.set(row.followeeId, (mutualCounts.get(row.followeeId) || 0) + 1);
    const mutualIds = [...mutualCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const mutualPeople = mutualIds.length ? await User.findAll({
      where: { id: { [Op.in]: mutualIds } }, attributes: PUBLIC_ATTRS,
    }) : [];
    const peopleById = new Map(mutualPeople.map((person) => [person.id, person]));
    const friendOfFriends = mutualIds.map((id) => {
      const person = peopleById.get(id);
      return person ? { ...person.toJSON(), mutualCount: mutualCounts.get(id) || 0 } : null;
    }).filter(Boolean);

    const [popular, followBackRows] = await Promise.all([
      User.findAll({ where: { id: { [Op.notIn]: excludedIds } }, attributes: PUBLIC_ATTRS, order: [['followerCount', 'DESC']], limit: 24 }),
      followerIds.length ? User.findAll({
        where: { id: { [Op.in]: followerIds, [Op.notIn]: excludedIds] } },
        attributes: PUBLIC_ATTRS, limit: 24,
      }) : [],
    ]);
    const seen = new Set(friendOfFriends.map((person) => person.id));
    const suggested = [...friendOfFriends, ...popular.filter((person) => !seen.has(person.id))].slice(0, 24);
    res.json({
      suggested: await withFollowState(suggested, req.user.id),
      followBack: await withFollowState(followBackRows, req.user.id),
    });
  } catch (e) { next(e); }
});

// GET /v1/users/:username
// GET /v1/users/blocked — accounts blocked by the authenticated user.
router.get('/blocked', requireAuth, async (req, res, next) => {
  try {
    const rows = await UserBlock.findAll({
      where: { blockerId: req.user.id },
      attributes: ['blockedUserId'],
      raw: true,
    });
    const ids = rows.map((row) => row.blockedUserId);
    if (!ids.length) return res.json({ items: [] });
    const users = await User.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: PUBLIC_ATTRS,
      order: [['username', 'ASC']],
    });
    res.json({ items: users });
  } catch (e) { next(e); }
});

router.get('/:username', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, PUBLIC_ATTRS);
    if (!user) throw httpError(404, 'User not found');
    await assertNotBlocked(req.user.id, user.id);
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
    await assertNotBlocked(req.user.id, user.id);
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
    const visiblePeople = await excludeBlockedPeople(people, req.user.id);
    res.json({ items: await withFollowState(visiblePeople, req.user.id) });
  } catch (e) { next(e); }
});

router.get('/:username/following', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    const rows = await Follow.findAll({ where: { followerId: user.id }, attributes: ['followeeId'], order: [['createdAt', 'DESC']], limit: 300, raw: true });
    const people = await User.findAll({ where: { id: rows.map((r) => r.followeeId) }, attributes: PUBLIC_ATTRS });
    const visiblePeople = await excludeBlockedPeople(people, req.user.id);
    res.json({ items: await withFollowState(visiblePeople, req.user.id) });
  } catch (e) { next(e); }
});

// Block and unblock creators from the post controls menu.
router.post('/:id/block', requireAuth, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) throw httpError(400, 'You cannot block yourself');
    const target = await User.findByPk(req.params.id, { attributes: ['id'] });
    if (!target) throw httpError(404, 'User not found');
    await sequelize.transaction(async (t) => {
      await UserBlock.findOrCreate({ where: { blockerId: req.user.id, blockedUserId: req.params.id }, transaction: t });
      // Blocking ends any existing follow relationship in either direction.
      const removedOutgoing = await Follow.destroy({ where: { followerId: req.user.id, followeeId: req.params.id }, transaction: t });
      const removedIncoming = await Follow.destroy({ where: { followerId: req.params.id, followeeId: req.user.id }, transaction: t });
      if (removedOutgoing) await User.decrement('followerCount', { by: removedOutgoing, where: { id: req.params.id }, transaction: t });
      if (removedIncoming) await User.decrement('followerCount', { by: removedIncoming, where: { id: req.user.id }, transaction: t });
    });
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
    const blocked = await UserBlock.findOne({ where: { [Op.or]: [
      { blockerId: req.user.id, blockedUserId: followeeId },
      { blockerId: followeeId, blockedUserId: req.user.id },
    ] } });
    if (blocked) throw httpError(403, 'You cannot follow an account involved in a block relationship');

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
