const { Op, Post, User, Follow, StoryView, StoryLike, UserMute } = require('../db');
const { fn, col } = require('sequelize');
const redis = require('../redis');
const { discoverFeedScore } = require('./formulas');
const { sequelize } = require('../db');
const config = require('../config');
const { toPostDTO } = require('../lib/serialize');
const { blockedUserIds } = require('../lib/blocks');

const authorAttrs = ['id', 'username', 'displayName', 'avatarUrl', 'isCreator', 'country'];

async function viewedSet(viewerId, storyIds) {
  if (!storyIds.length) return new Set();
  const rows = await StoryView.findAll({
    where: { viewerId, storyId: storyIds }, attributes: ['storyId'], raw: true,
  });
  return new Set(rows.map((r) => r.storyId));
}

// Story tray: each viewer has a Redis sorted set of the story ids they can see (their own and the people they follow),
// written when a story is posted. The rail reads that short list instead of scanning every followed creator's stories.
const TRAY_LIMIT = 500;
const TRAY_TTL_SECONDS = 25 * 3600;
const trayKey = (viewerId) => `stories:tray:${viewerId}`;

function trayWrite(pipe, viewerId, storyId, score) {
  pipe.zadd(trayKey(viewerId), score, String(storyId));
  pipe.zremrangebyrank(trayKey(viewerId), 0, -(TRAY_LIMIT + 1));
  pipe.expire(trayKey(viewerId), TRAY_TTL_SECONDS);
}

// Called when a story is posted: writes it into the author's tray and each follower's tray
async function fanOutStory(story) {
  const followers = await Follow.findAll({ where: { followeeId: story.authorId }, attributes: ['followerId'], raw: true });
  const viewers = [story.authorId, ...followers.map((f) => f.followerId)];
  const score = new Date(story.createdAt || Date.now()).getTime();
  for (let i = 0; i < viewers.length; i += 500) {
    const pipe = redis.pipeline();
    for (const viewerId of viewers.slice(i, i + 500)) trayWrite(pipe, viewerId, story.id, score);
    await pipe.exec();
  }
}

// Called when someone starts following a creator: their live stories join the follower's tray at once
async function addFolloweeToTray(followerId, followeeId) {
  const stories = await Post.findAll({
    where: { isStory: true, status: 'live', authorId: followeeId, expiresAt: { [Op.gt]: new Date() } },
    attributes: ['id', 'createdAt'], raw: true, limit: TRAY_LIMIT,
  });
  if (!stories.length) return;
  const pipe = redis.pipeline();
  for (const story of stories) trayWrite(pipe, followerId, story.id, new Date(story.createdAt).getTime());
  await pipe.exec();
}

// Stories listed in the viewer's tray, newest first, re-checked against the database (expired, removed or unfollowed
// stories drop out). Returns null when the tray is empty, so the caller can rebuild it from the database.
async function trayStories(viewerId, authorIds) {
  const ids = await redis.zrevrange(trayKey(viewerId), 0, TRAY_LIMIT - 1);
  if (!ids.length) return null;
  return Post.findAll({
    where: { id: ids, isStory: true, status: 'live', expiresAt: { [Op.gt]: new Date() }, authorId: authorIds },
    include: [{ model: User, as: 'author', attributes: authorAttrs }],
    order: [['createdAt', 'DESC']],
  });
}

async function rebuildTray(viewerId, stories) {
  if (!stories.length) return;
  const pipe = redis.pipeline();
  for (const story of stories) trayWrite(pipe, viewerId, story.id, new Date(story.createdAt).getTime());
  await pipe.exec().catch(() => {});
}

// The rail groups active stories by creator: the viewer and the people they follow.
// Result is cached in Redis for a short time, so refreshes do not hit MySQL each time.
async function getStoryRail(viewerId) {
  const key = `stories:rail:${viewerId}`;
  const [blocked, mutedRows] = await Promise.all([
    blockedUserIds(viewerId),
    UserMute.findAll({ where: { userId: viewerId }, attributes: ['mutedUserId'], raw: true }),
  ]);
  const muted = new Set(mutedRows.map((row) => String(row.mutedUserId)));
  const cached = await redis.get(key);
  if (cached) {
    const hit = JSON.parse(cached);
    return { ...hit, items: (hit.items || []).filter((item) => !blocked.has(item.user?.id) && !muted.has(String(item.user?.id))) };
  }

  const follows = await Follow.findAll({
    where: { followerId: viewerId }, attributes: ['followeeId'], raw: true,
  });
  const authorIds = [viewerId, ...follows.map((f) => f.followeeId).filter((id) => !blocked.has(id) && !muted.has(String(id)))];

  let stories = await trayStories(viewerId, authorIds).catch(() => null);
  if (!stories) {
    stories = await Post.findAll({
      where: { isStory: true, status: 'live', authorId: authorIds, expiresAt: { [Op.gt]: new Date() } },
      include: [{ model: User, as: 'author', attributes: authorAttrs }],
      order: [['createdAt', 'DESC']],
      limit: 500,
    });
    await rebuildTray(viewerId, stories);
  }
  const viewed = await viewedSet(viewerId, stories.map((s) => s.id));

  const groups = new Map();
  for (const s of stories) {
    const dto = toPostDTO(s);
    const g = groups.get(s.authorId) || {
      user: dto.author, storyCount: 0, latestAt: dto.createdAt, expiresAt: dto.expiresAt, unseen: false,
    };
    g.storyCount += 1;
    // Stories come newest first, so the first one seen is the latest: its picture shows on the ring
    if (!g.preview) g.preview = { kind: dto.kind, mediaUrl: dto.mediaUrl, thumbUrl: dto.thumbUrl, storyText: dto.storyText, storyBackground: dto.storyBackground };
    if (!viewed.has(s.id)) g.unseen = true;
    if (dto.expiresAt > g.expiresAt) g.expiresAt = dto.expiresAt;
    groups.set(s.authorId, g);
  }

  // Friends order: unseen first, then the friend story score (chat, affinity, recency), then newest
  const friendScore = await require('./ranking').friendScores(viewerId, [...groups.keys()].map(String)).catch(() => ({}));
  const items = [...groups.values()]
    .sort((a, b) => Number(b.unseen) - Number(a.unseen)
      || (friendScore[String(b.user?.id)] || 0) - (friendScore[String(a.user?.id)] || 0)
      || new Date(b.latestAt) - new Date(a.latestAt))
    .slice(0, 50);

  const out = { items };
  await redis.set(key, JSON.stringify(out), 'EX', config.storyRailCacheSeconds);
  return out;
}

// Active stories for one creator, oldest first (plays like a story sequence)
async function getUserStories(userId, viewerId) {
  if (String(userId) !== String(viewerId)) {
    const muted = await UserMute.findOne({ where: { userId: viewerId, mutedUserId: userId }, attributes: ['id'], raw: true });
    if (muted) return [];
  }
  const stories = await Post.findAll({
    where: { isStory: true, status: 'live', authorId: userId, expiresAt: { [Op.gt]: new Date() } },
    include: [{ model: User, as: 'author', attributes: authorAttrs }],
    order: [['createdAt', 'ASC']],
    limit: 100,
  });
  const ids = stories.map((s) => s.id);
  const viewed = await viewedSet(viewerId, ids);
  // If migration 026 has not run yet, stories still load without like state instead of failing.
  const [likedRows, countRows] = ids.length ? await Promise.all([
    StoryLike.findAll({ where: { userId: viewerId, postId: ids }, attributes: ['postId'], raw: true }).catch(() => []),
    StoryLike.findAll({ where: { postId: ids }, attributes: ['postId', [fn('COUNT', col('postId')), 'n']], group: ['postId'], raw: true }).catch(() => []),
  ]) : [[], []];
  const liked = new Set(likedRows.map((r) => r.postId));
  const counts = new Map(countRows.map((r) => [r.postId, Number(r.n)]));
  return stories.map((s) => ({
    ...toPostDTO(s),
    viewed: viewed.has(s.id),
    liked: liked.has(s.id),
    likeCount: counts.get(s.id) || 0,
  }));
}

// Whether the viewer subscribes to a creator (a follow) and has the bell on for new posts and stories.
async function getSubscription(creatorId, viewerId) {
  const follow = await Follow.findOne({ where: { followerId: viewerId, followeeId: creatorId }, raw: true });
  return { isSubscribed: Boolean(follow), isNotifying: Boolean(follow && follow.notifyPosts) };
}

// Ring for each author with an active story: the owner's own active story is always 'mine';
// other authors are 'unseen' until all active stories have been watched, then 'seen'.
async function storyRingsFor(viewerId, authorIds) {
  const ids = [...new Set((authorIds || []).map(String))];
  const rings = new Map();
  if (!ids.length) return rings;
  const stories = await Post.findAll({
    where: { authorId: ids, isStory: true, status: 'live', expiresAt: { [Op.gt]: new Date() } },
    attributes: ['id', 'authorId'], raw: true,
  });
  if (!stories.length) return rings;
  const views = await StoryView.findAll({
    where: { viewerId, storyId: stories.map((story) => story.id) }, attributes: ['storyId'], raw: true,
  });
  const watched = new Set(views.map((row) => String(row.storyId)));
  for (const story of stories) {
    const author = String(story.authorId);
    if (author === String(viewerId)) rings.set(author, 'mine');
    else if (!watched.has(String(story.id))) rings.set(author, 'unseen');
    else if (!rings.has(author)) rings.set(author, 'seen');
  }
  return rings;
}

// Clears cached story rails for the author and everyone who follows them, so a new story shows at once
async function invalidateRailsFor(authorId) {
  const followers = await Follow.findAll({ where: { followeeId: authorId }, attributes: ['followerId'], raw: true });
  const keys = [authorId, ...followers.map((f) => f.followerId)].map((id) => `stories:rail:${id}`);
  for (let i = 0; i < keys.length; i += 500) await redis.del(...keys.slice(i, i + 500));
}

// Popular public stories for Rimlight: the most viewed active stories from other people, not blocked.
// Discover ranking for one viewer (a Snapchat-style feed, not Snapchat's own model): stories the viewer has not seen
// come first, then people they follow and creators, then popular and recent stories. Stories they already watched
// drop down the list.
async function getDiscoverStories(viewerId, limit) {
  const blocked = await blockedUserIds(viewerId);
  const candidates = await Post.findAll({
    where: {
      isStory: true, status: 'live', visibility: 'public', expiresAt: { [Op.gt]: new Date() },
      authorId: { [Op.notIn]: [viewerId, ...blocked] },
    },
    include: [{ model: User, as: 'author', attributes: authorAttrs }],
    order: [['createdAt', 'DESC']],
    limit: 200,
  });
  if (!candidates.length) return [];
  const ids = candidates.map((story) => story.id);
  const authorIds = [...new Set(candidates.map((story) => String(story.authorId)))];
  const [follows] = await Promise.all([
    Follow.findAll({ where: { followerId: viewerId, followeeId: authorIds }, attributes: ['followeeId'], raw: true }),
  ]);
  const followedIds = new Set(follows.map((row) => String(row.followeeId)));
  // Interest_Boost: topics of posts the viewer liked (stories carry a topic when one is set)
  const viewer = await User.findByPk(viewerId, { attributes: ['country'], raw: true }).catch(() => null);
  const now = Date.now();
  const scored = candidates.map((story) => {
    const hoursPosted = (now - new Date(story.createdAt).getTime()) / 3600000;
    // Discover_Score: subscription and same-country boosts, freshness. Click and completion models are not built yet (1).
    const score = discoverFeedScore({
      subscribed: followedIds.has(String(story.authorId)),
      sameCountry: Boolean(viewer?.country) && story.author?.country === viewer.country,
      hoursPosted,
    });
    return { story, score };
  });
  scored.sort((a, b) => b.score - a.score || new Date(b.story.createdAt) - new Date(a.story.createdAt));
  return scored.slice(0, limit).map(({ story }) => ({ ...toPostDTO(story), subscribed: followedIds.has(String(story.authorId)) }));
}

// Diversity rule: never put two items from the same creator side by side (adjacent grid slots)
function diversify(list, keyOf) {
  const pool = [...list];
  const out = [];
  while (pool.length) {
    const prev = out[out.length - 1];
    let index = prev ? pool.findIndex((item) => keyOf(item) !== keyOf(prev)) : 0;
    if (index < 0) index = 0;
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

// Discover sections (backend ranking pipeline): a carousel of unseen stories from creators the viewer follows
// (high affinity, 112px cards), and a 2-column grid of the rest, diversified. Ads are added by the client.
const CAROUSEL_SIZE = 8;
async function getDiscoverSections(viewerId, limit = 24) {
  const ranked = await getDiscoverStories(viewerId, limit);
  const viewed = await viewedSet(viewerId, ranked.map((item) => item.id));
  const withViewed = ranked.map((item) => ({ ...item, viewed: viewed.has(item.id) }));
  // One carousel card per creator, in ranking order, so a single creator cannot fill the row
  const seenCreators = new Set();
  const carousel = [];
  for (const item of withViewed) {
    if (carousel.length >= CAROUSEL_SIZE) break;
    if (!item.subscribed || item.viewed) continue;
    const creator = String(item.author?.id || item.authorId);
    if (seenCreators.has(creator)) continue;
    seenCreators.add(creator);
    carousel.push(item);
  }
  const carouselIds = new Set(carousel.map((item) => item.id));
  const grid = diversify(withViewed.filter((item) => !carouselIds.has(item.id)), (item) => String(item.author?.id || item.authorId));
  return { items: grid, carousel };
}

async function getPopularStories(viewerId, limit = 4, { personalized = false } = {}) {
  if (personalized) return getDiscoverStories(viewerId, limit);
  const blocked = await blockedUserIds(viewerId);
  const rows = await Post.findAll({
    where: {
      isStory: true, status: 'live', visibility: 'public', expiresAt: { [Op.gt]: new Date() },
      authorId: { [Op.notIn]: [viewerId, ...blocked] },
    },
    include: [{ model: User, as: 'author', attributes: authorAttrs }],
    order: [['viewCount', 'DESC'], ['createdAt', 'DESC']],
    limit,
  });
  return rows.map((s) => toPostDTO(s));
}

module.exports = { getDiscoverSections, getPopularStories, getStoryRail, getUserStories, getSubscription, storyRingsFor, invalidateRailsFor, fanOutStory, addFolloweeToTray };
