const router = require('express').Router();
const { DAY, followRankScore, quickAddScore } = require('../services/formulas');
const redis = require('../redis');

// Post-notification bell state, read with SQL so the app works before migration 025 adds the column
async function readNotify(followerId, followeeId) {
  try {
    const [rows] = await sequelize.query(
      'SELECT notifyPosts FROM follows WHERE followerId = :followerId AND followeeId = :followeeId',
      { replacements: { followerId, followeeId } },
    );
    return Boolean(rows[0] && rows[0].notifyPosts);
  } catch { return false; }
}
const { Op } = require('sequelize');
const { sequelize, User, Post, Repost, Follow, Friendship, UserBlock, UserMute, SavedPost, GroupMember, DirectMessage, ProfileView, QuickAddDismissal, UserReport } = require('../db');
const { requireAuth } = require('../middleware/auth');
const feed = require('../services/feed');
const httpError = require('../utils/httpError');
const { upload, kindFor, mediaPath } = require('../middleware/upload');
const cloudinary = require('../services/cloudinary');
const { requestAssetCleanup } = require('../services/mediaCleanup');

const PUBLIC_ATTRS = ['id', 'username', 'displayName', 'avatarUrl', 'coverUrl', 'country', 'followerCount', 'isCreator'];

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
  const muted = await UserMute.findAll({ where: { userId: viewerId, mutedUserId: ids }, attributes: ['mutedUserId'], raw: true });
  const followedIds = new Set(follows.map((row) => row.followeeId));
  const mutedIds = new Set(muted.map((row) => String(row.mutedUserId)));
  return people.map((person) => ({
    ...(typeof person.toJSON === 'function' ? person.toJSON() : person),
    isFollowing: followedIds.has(person.id),
    isMuted: mutedIds.has(String(person.id)),
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
router.post('/me/avatar', requireAuth, upload.single('media'), require('../middleware/verifyUpload').verifyUploads(['photo']), async (req, res, next) => {
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
router.post('/me/cover', requireAuth, upload.single('media'), require('../middleware/verifyUpload').verifyUploads(['photo']), async (req, res, next) => {
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
// POST /v1/users/suggestions/:id/dismiss: hide this person from Suggested (Quick_Add_Score subtracts 100 for a dismissal)
router.post('/suggestions/:id/dismiss', requireAuth, async (req, res, next) => {
  try {
    const personId = req.params.id;
    if (String(personId) === String(req.user.id)) throw httpError(400, 'Invalid suggestion');
    await QuickAddDismissal.findOrCreate({ where: { userId: req.user.id, personId }, defaults: { userId: req.user.id, personId } });
    res.status(204).end();
  } catch (e) { next(e); }
});

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
    // A person is in one place only: people who follow you appear under Follow back, never under Suggested.
    const suggestExcludedIds = [...new Set([...excludedIds, ...followerIds])];

    // Recommend second-degree connections first, ranked by shared follows.
    const mutualRows = followingIds.length ? await Follow.findAll({
      where: { followerId: { [Op.in]: followingIds }, followeeId: { [Op.notIn]: suggestExcludedIds } },
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
      User.findAll({ where: { id: { [Op.notIn]: suggestExcludedIds } }, attributes: PUBLIC_ATTRS, order: [['followerCount', 'DESC']], limit: 24 }),
      followerIds.length ? User.findAll({
        where: { id: { [Op.in]: followerIds, [Op.notIn]: excludedIds } },
        attributes: PUBLIC_ATTRS, limit: 24,
      }) : [],
    ]);
    const seen = new Set(friendOfFriends.map((person) => person.id));
    const candidates = [...friendOfFriends, ...popular.filter((person) => !seen.has(person.id))];
    // Quick Add score: mutual friends, shared group chats, same country.
    // Phone contacts, profile searches and dismissals are not tracked yet, so they count as 0.
    const myGroupRows = await GroupMember.findAll({ where: { userId: req.user.id }, attributes: ['groupId'], raw: true });
    const myGroups = myGroupRows.map((row) => row.groupId);
    const sharedGroupRows = candidates.length && myGroups.length ? await GroupMember.findAll({
      where: { groupId: { [Op.in]: myGroups }, userId: { [Op.in]: candidates.map((person) => person.id) } },
      attributes: ['userId'], raw: true,
    }) : [];
    const sharedGroups = new Map();
    for (const row of sharedGroupRows) sharedGroups.set(String(row.userId), (sharedGroups.get(String(row.userId)) || 0) + 1);
    const candidateIds = candidates.map((person) => person.id);
    const [me, searchRows, dismissRows] = await Promise.all([
      User.findByPk(req.user.id, { attributes: ['country'], raw: true }),
      candidateIds.length ? ProfileView.findAll({ where: { viewerId: req.user.id, profileId: candidateIds }, attributes: ['profileId', 'views'], raw: true }) : [],
      candidateIds.length ? QuickAddDismissal.findAll({ where: { userId: req.user.id, personId: candidateIds }, attributes: ['personId'], raw: true }) : [],
    ]);
    const searches = new Map(searchRows.map((row) => [String(row.profileId), Number(row.views) || 0]));
    const dismissed = new Set(dismissRows.map((row) => String(row.personId)));
    const scoreOf = (person) => quickAddScore({
      mutual: mutualCounts.get(person.id) || 0,
      sharedGroups: sharedGroups.get(String(person.id)) || 0,
      profileSearches: searches.get(String(person.id)) || 0,
      sameLocation: me?.country && person.country === me.country ? 1 : 0,
      dismissCount: dismissed.has(String(person.id)) ? 1 : 0,
    });
    const suggested = candidates
      .filter((person) => !dismissed.has(String(person.id)))
      .map((person, index) => ({ person, index, score: scoreOf(person) }))
      .sort((a, b) => (b.score - a.score) || (a.index - b.index))
      .map(({ person }) => person)
      .slice(0, 24);
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

// Profile details (bio, website, city). Read and written with SQL so the app works before migration 027.
async function readProfileExtras(userId) {
  try {
    const [rows] = await sequelize.query('SELECT bio, website, city, gender, dateOfBirth FROM users WHERE id = :userId', { replacements: { userId } });
    return rows[0] || {};
  } catch { return {}; }
}

function cleanWebsite(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.')) throw new Error('no host');
    return url.toString().replace(/\/$/, '').slice(0, 200);
  } catch { throw httpError(400, 'Enter a valid website address'); }
}

// PUT /v1/users/me/profile  body: { displayName, bio, website, city, dateOfBirth, gender }
router.put('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const displayName = String(body.displayName || '').trim();
    const bio = String(body.bio || '').trim();
    const city = String(body.city || '').trim();
    const dateOfBirth = String(body.dateOfBirth || '').trim();
    const gender = String(body.gender || '').trim();
    if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(`${dateOfBirth}T00:00:00Z`)) || new Date(`${dateOfBirth}T00:00:00Z`).toISOString().slice(0, 10) !== dateOfBirth || dateOfBirth > new Date().toISOString().slice(0, 10))) throw httpError(400, 'Enter a valid date of birth');
    if (gender.length > 40) throw httpError(400, 'Gender must be 40 characters or fewer');
    if (!displayName || displayName.length > 64) throw httpError(400, 'Name must be 1 to 64 characters');
    if (bio.length > 150) throw httpError(400, 'Bio must be 150 characters or fewer');
    if (city.length > 80) throw httpError(400, 'City must be 80 characters or fewer');
    const website = cleanWebsite(body.website);
    const transaction = await sequelize.transaction();
    try {
      await User.update({ displayName }, { where: { id: req.user.id }, transaction });
      await sequelize.query(
        'UPDATE users SET bio = :bio, website = :website, city = :city, gender = :gender, dateOfBirth = :dateOfBirth WHERE id = :userId',
        { replacements: { bio: bio || null, website, city: city || null, gender: gender || null, dateOfBirth: dateOfBirth || null, userId: req.user.id }, transaction },
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      if (/bio|website|city|gender|dateOfBirth/.test(err.message)) throw httpError(503, 'Profile details are not available yet on this server');
      throw err;
    }
    res.json({ ok: true, dateOfBirth: dateOfBirth || null });
  } catch (e) { next(e); }
});

const { storyRingsFor, addFolloweeToTray } = require('../services/stories');
// The signed-in user is addressed as "me"
async function ownUsername(req) {
  const row = await User.findByPk(req.user.id, { attributes: ['username'], raw: true });
  if (!row) throw httpError(404, 'User not found');
  return row.username;
}

// Counts one profile visit per viewer per profile per day (a Redis guard stops refreshes from inflating the count)
async function recordProfileView(viewerId, profileId) {
  if (String(viewerId) === String(profileId)) return;
  const day = new Date().toISOString().slice(0, 10);
  const first = await redis.set(`pv:${viewerId}:${profileId}:${day}`, '1', 'EX', 86400, 'NX').catch(() => 'OK');
  if (!first) return;
  const [row] = await ProfileView.findOrCreate({ where: { viewerId, profileId }, defaults: { views: 0 } });
  await row.increment('views', { by: 1 });
  await row.update({ lastViewedAt: new Date() });
}

const profileFor = async (req, res, next, username) => {
  try {
    const user = await resolveUser(req, username, PUBLIC_ATTRS);
    if (!user) throw httpError(404, 'User not found');
    await assertNotBlocked(req.user.id, user.id);
    recordProfileView(req.user.id, user.id).catch((viewError) => console.error('Profile view record failed:', viewError.message));
    const [postCount, follow, followerCount, followingCount, storyCount] = await Promise.all([
      Post.count({ where: { authorId: user.id, status: 'live', isStory: false } }),
      Follow.findOne({ where: { followerId: req.user.id, followeeId: user.id } }),
      Follow.count({ where: { followeeId: user.id } }),
      Follow.count({ where: { followerId: user.id } }),
      Post.count({ where: { authorId: user.id, status: 'live', isStory: true, expiresAt: { [Op.gt]: new Date() } } }),
    ]);
    const isOnline = Boolean(await redis.get('presence:' + user.id).catch(() => null));
    const storyRing = (await storyRingsFor(req.user.id, [user.id])).get(String(user.id)) || null;
    const extras = await readProfileExtras(user.id);
    // Date of birth is private account information; expose it only on the owner's own edit endpoint.
    if (user.id !== req.user.id) delete extras.dateOfBirth;
    res.json({ ...user.toJSON(), ...extras, followerCount, isOnline, storyRing, postCount, followingCount, isFollowing: Boolean(follow), isNotifying: Boolean(follow) && await readNotify(req.user.id, user.id), isMe: user.id === req.user.id, hasStory: storyCount > 0 });
  } catch (e) { next(e); }
};

router.get('/me', requireAuth, async (req, res, next) => {
  try { await profileFor(req, res, next, await ownUsername(req)); } catch (e) { next(e); }
});
router.get('/:username', requireAuth, (req, res, next) => profileFor(req, res, next, req.params.username));

// GET /v1/users/:username/posts?cursor=...&limit=...
const postsFor = async (req, res, next, username) => {
  try {
    const user = await resolveUser(req, username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    await assertNotBlocked(req.user.id, user.id);
    res.json(await feed.pagePosts({
      where: { authorId: user.id, status: 'live', isStory: false, ...(user.id === req.user.id ? {} : { visibility: 'public' }) },
      cursor: req.query.cursor,
      limit: feed.clampLimit(req.query.limit),
    }));
  } catch (e) { next(e); }
};

router.get('/me/posts', requireAuth, async (req, res, next) => {
  try { await postsFor(req, res, next, await ownUsername(req)); } catch (e) { next(e); }
});
router.get('/:username/posts', requireAuth, (req, res, next) => postsFor(req, res, next, req.params.username));

// GET a creator's reposted posts for the Reposts profile tab.
router.get('/:username/reposts', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    await assertNotBlocked(req.user.id, user.id);
    const repostRows = await Repost.findAll({ where: { userId: user.id }, attributes: ['postId', 'createdAt'], order: [['createdAt', 'DESC']], limit: 100, raw: true });
    if (!repostRows.length) return res.json({ items: [], nextCursor: null });
    const ids = repostRows.map((row) => row.postId);
    const page = await feed.pagePosts({
      where: { id: ids, status: 'live', isStory: false, ...(user.id === req.user.id ? {} : { visibility: 'public' }) },
      limit: Math.min(100, ids.length),
    });
    const byId = new Map((page.items || []).map((post) => [post.id, post]));
    res.json({ items: ids.map((id) => byId.get(id)).filter(Boolean), nextCursor: null });
  } catch (e) { next(e); }
});

// GET a person's saved posts for the Saved profile tab. Only the owner can see their saved list.
router.get('/:username/saved', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    if (String(user.id) !== String(req.user.id)) return res.json({ items: [], nextCursor: null });
    const rows = await SavedPost.findAll({ where: { userId: user.id }, attributes: ['postId', 'createdAt'], order: [['createdAt', 'DESC']], limit: 100, raw: true });
    if (!rows.length) return res.json({ items: [], nextCursor: null });
    const ids = rows.map((row) => row.postId);
    const page = await feed.pagePosts({ where: { id: ids, status: 'live', isStory: false }, limit: Math.min(100, ids.length) });
    const byId = new Map((page.items || []).map((post) => [post.id, post]));
    res.json({ items: ids.map((id) => byId.get(id)).filter(Boolean), nextCursor: null });
  } catch (e) { next(e); }
});

// GET complete follower/following lists in relationship order.
// Follow_Rank_Score for the followers list: mutual follow, story replies sent to you (30d),
// verified creators, minus 0.2 per day since they followed. Profile visits are not tracked (0).
async function rankFollowers(rows, userId) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => String(row.followerId));
  const since = new Date(Date.now() - 30 * DAY);
  const [followsBack, replies, creators, visits] = await Promise.all([
    Follow.findAll({ where: { followerId: userId, followeeId: ids }, attributes: ['followeeId'], raw: true }),
    DirectMessage.findAll({ where: { senderId: ids, recipientId: userId, storyAuthorId: userId, createdAt: { [Op.gt]: since } }, attributes: ['senderId'], raw: true }),
    User.findAll({ where: { id: ids }, attributes: ['id', 'isCreator'], raw: true }),
    ProfileView.findAll({ where: { viewerId: ids, profileId: userId }, attributes: ['viewerId', 'views'], raw: true }),
  ]);
  const visitsBy = new Map(visits.map((row) => [String(row.viewerId), Number(row.views) || 0]));
  const mutual = new Set(followsBack.map((row) => String(row.followeeId)));
  const replied = new Map();
  for (const row of replies) replied.set(String(row.senderId), (replied.get(String(row.senderId)) || 0) + 1);
  const verified = new Set(creators.filter((u) => u.isCreator).map((u) => String(u.id)));
  return rows
    .map((row) => {
      const id = String(row.followerId);
      const rank = followRankScore({
        mutual: mutual.has(id) ? 1 : 0,
        profileVisits: visitsBy.get(id) || 0,
        storyReplies: replied.get(id) || 0,
        verified: verified.has(id) ? 1 : 0,
        daysFollowed: (Date.now() - new Date(row.createdAt).getTime()) / DAY,
      });
      return { row, rank };
    })
    .sort((a, b) => b.rank - a.rank || new Date(b.row.createdAt) - new Date(a.row.createdAt))
    .map(({ row }) => row);
}

async function peopleInRelationshipOrder(rows, idField, viewerId) {
  const ids = rows.map((row) => String(row[idField]));
  if (!ids.length) return [];
  const people = await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: PUBLIC_ATTRS });
  const byId = new Map(people.map((person) => [String(person.id), person]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const visible = await excludeBlockedPeople(ordered, viewerId);
  const withState = await withFollowState(visible, viewerId);
  const dates = new Map(rows.map((row) => [String(row[idField]), row.createdAt || null]));
  return withState.map((person) => ({ ...person, relationshipCreatedAt: dates.get(String(person.id)) }));
}

router.get('/:username/followers', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    const rows = await Follow.findAll({ where: { followeeId: user.id }, attributes: ['followerId', 'createdAt'], order: [['createdAt', 'DESC'], ['followerId', 'ASC']], raw: true });
    res.json({ items: await peopleInRelationshipOrder(await rankFollowers(rows, req.user.id), 'followerId', req.user.id) });
  } catch (e) { next(e); }
});

router.get('/:username/following', requireAuth, async (req, res, next) => {
  try {
    const user = await resolveUser(req, req.params.username, ['id']);
    if (!user) throw httpError(404, 'User not found');
    const rows = await Follow.findAll({ where: { followerId: user.id }, attributes: ['followeeId', 'createdAt'], order: [['createdAt', 'DESC'], ['followeeId', 'ASC']], raw: true });
    const items = await peopleInRelationshipOrder(rows, 'followeeId', req.user.id);
    if (user.id === req.user.id) {
      await Promise.all(items.map(async (person) => { person.isNotifying = await readNotify(user.id, person.id); }));
    }
    res.json({ items });
  } catch (e) { next(e); }
});

// Block and unblock creators from the post controls menu.
// POST /v1/users/:id/report  body: { reason }: report a profile for review (one pending report per reporter)
router.post('/:id/report', requireAuth, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) throw httpError(400, 'You cannot report yourself');
    const target = await User.findByPk(req.params.id, { attributes: ['id'] });
    if (!target) throw httpError(404, 'User not found');
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!reason) throw httpError(400, 'Choose a reason for reporting this profile');
    const existing = await UserReport.findOne({ where: { reportedUserId: req.params.id, reporterId: req.user.id, status: 'pending' } });
    if (existing) throw httpError(409, 'You have already reported this profile');
    await UserReport.create({ reportedUserId: req.params.id, reporterId: req.user.id, reason });
    res.status(201).json({ reported: true });
  } catch (err) { next(err); }
});

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
      const [userAId, userBId] = [String(req.user.id), String(req.params.id)].sort();
      await Friendship.destroy({ where: { userAId, userBId }, transaction: t });
      if (removedOutgoing) await User.decrement('followerCount', { by: removedOutgoing, where: { id: req.params.id }, transaction: t });
      if (removedIncoming) await User.decrement('followerCount', { by: removedIncoming, where: { id: req.user.id }, transaction: t });
    });
    await Promise.all([req.user.id, req.params.id].map((id) => redis.del(`stories:rail:${id}`).catch(() => {})));
    res.json({ blocked: true });
  } catch (e) { next(e); }
});
router.delete('/:id/block', requireAuth, async (req, res, next) => {
  try {
    await UserBlock.destroy({ where: { blockerId: req.user.id, blockedUserId: req.params.id } });
    await Promise.all([req.user.id, req.params.id].map((id) => redis.del(`stories:rail:${id}`).catch(() => {})));
    res.json({ blocked: false });
  } catch (e) { next(e); }
});

// Mute or unmute an account. This is a private preference and does not unfollow them.
router.put('/:id/mute', requireAuth, async (req, res, next) => {
  try {
    const targetId = String(req.params.id);
    if (targetId === String(req.user.id)) throw httpError(400, 'You cannot mute yourself');
    const target = await User.findByPk(targetId, { attributes: ['id'] });
    if (!target) throw httpError(404, 'User not found');
    const enabled = Boolean(req.body?.enabled);
    if (enabled) await UserMute.findOrCreate({ where: { userId: req.user.id, mutedUserId: targetId } });
    else await UserMute.destroy({ where: { userId: req.user.id, mutedUserId: targetId } });
    await Promise.all([
      redis.del(`feed:discover:ranked:${req.user.id}`, `feed:explore:ranked:${req.user.id}`),
      redis.del(`stories:rail:${req.user.id}`),
    ]).catch(() => {});
    res.json({ muted: enabled });
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
      const reciprocal = await Follow.findOne({ where: { followerId: followeeId, followeeId: req.user.id }, transaction: t });
      if (reciprocal) {
        const [userAId, userBId] = [String(req.user.id), String(followeeId)].sort();
        await Friendship.findOrCreate({ where: { userAId, userBId }, defaults: { status: 'accepted' }, transaction: t });
      }
    });
    await addFolloweeToTray(req.user.id, followeeId).catch((trayError) => console.error('Story tray update failed:', trayError.message));
    await redis.del(`stories:rail:${req.user.id}`).catch(() => {});

    const fresh = await User.findByPk(followeeId, { attributes: ['followerCount'] });
    res.json({ isFollowing: true, followerCount: fresh.followerCount });
  } catch (e) { next(e); }
});

// PUT /v1/users/:id/follow/notify  body: { enabled }  (bell: notify me when this creator posts)
router.put('/:id/follow/notify', requireAuth, async (req, res, next) => {
  try {
    const enabled = Boolean(req.body && req.body.enabled);
    const follow = await Follow.findOne({ where: { followerId: req.user.id, followeeId: req.params.id } });
    if (!follow) throw httpError(409, 'Follow this account to turn on notifications');
    try {
      await sequelize.query(
        'UPDATE follows SET notifyPosts = :enabled WHERE followerId = :followerId AND followeeId = :followeeId',
        { replacements: { enabled: enabled ? 1 : 0, followerId: req.user.id, followeeId: req.params.id } },
      );
    } catch (err) {
      if (/notifyPosts/.test(err.message)) throw httpError(503, 'Post notifications are not available yet on this server');
      throw err;
    }
    // The rail leaves out bell creators, so the viewer's rail changes when the bell does
    await redis.del(`stories:rail:${req.user.id}`).catch(() => {});
    res.json({ isNotifying: enabled });
  } catch (e) { next(e); }
});

// Remove a follower from the authenticated user's own followers list.
router.delete('/:id/follower', requireAuth, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) throw httpError(400, 'You cannot remove yourself as a follower');
    const target = await User.findByPk(req.params.id, { attributes: ['id'] });
    if (!target) throw httpError(404, 'User not found');
    let removed = 0;
    await sequelize.transaction(async (t) => {
      removed = await Follow.destroy({ where: { followerId: req.params.id, followeeId: req.user.id }, transaction: t });
      if (removed) await User.decrement('followerCount', { by: removed, where: { id: req.user.id }, transaction: t });
    });
    const fresh = await User.findByPk(req.user.id, { attributes: ['followerCount'] });
    res.json({ removed: Boolean(removed), followerCount: fresh?.followerCount || 0 });
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
      const [userAId, userBId] = [String(req.user.id), String(followeeId)].sort();
      await Friendship.destroy({ where: { userAId, userBId }, transaction: t });
    });
    await redis.del(`stories:rail:${req.user.id}`).catch(() => {});
    const fresh = await User.findByPk(followeeId, { attributes: ['followerCount'] });
    if (!fresh) throw httpError(404, 'User not found');
    res.json({ isFollowing: false, followerCount: fresh.followerCount });
  } catch (e) { next(e); }
});

// Delete account (App Store 5.1.1(v) and Google Play account deletion policy). The account is anonymised
// rather than hard-deleted so chats and shared records keep their structure: the login details, name, photos
// and bio are removed, every post and story is hidden, and follows and blocks are cleared.
router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    if (String(req.body?.confirm || '').trim().toUpperCase() !== 'DELETE') throw httpError(400, 'Type DELETE to confirm');
    const me = req.user.id;
    await sequelize.transaction(async (transaction) => {
      await Post.update({ status: 'removed' }, { where: { authorId: me }, transaction });
      await Follow.destroy({ where: { [Op.or]: [{ followerId: me }, { followeeId: me }] }, transaction });
      await UserBlock.destroy({ where: { [Op.or]: [{ blockerId: me }, { blockedUserId: me }] }, transaction });
      const tag = me.replace(/-/g, '').slice(0, 20);
      await User.update({
        username: `deleted_${tag}`,
        email: `deleted-${tag}@deleted.invalid`,
        passwordHash: `deleted-${tag}`,
        displayName: 'Deleted account',
        avatarUrl: null,
        coverUrl: null,
        isCreator: false,
      }, { where: { id: me }, transaction });
    });
    await redis.set('acct-deleted:' + me, '1').catch(() => {});
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
