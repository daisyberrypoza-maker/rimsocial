const { Op, Post, User, Follow, StoryView, StoryLike } = require('../db');
const { fn, col } = require('sequelize');
const redis = require('../redis');
const config = require('../config');
const { toPostDTO } = require('../lib/serialize');
const { blockedUserIds } = require('../lib/blocks');

const authorAttrs = ['id', 'username', 'displayName', 'avatarUrl'];

async function viewedSet(viewerId, storyIds) {
  if (!storyIds.length) return new Set();
  const rows = await StoryView.findAll({
    where: { viewerId, storyId: storyIds }, attributes: ['storyId'], raw: true,
  });
  return new Set(rows.map((r) => r.storyId));
}

// The rail groups active stories by creator: the viewer and the people they follow.
// Result is cached in Redis for a short time, so refreshes do not hit MySQL each time.
async function getStoryRail(viewerId) {
  const key = `stories:rail:${viewerId}`;
  const blocked = await blockedUserIds(viewerId);
  const cached = await redis.get(key);
  if (cached) {
    const hit = JSON.parse(cached);
    return { ...hit, items: (hit.items || []).filter((item) => !blocked.has(item.user?.id)) };
  }

  const follows = await Follow.findAll({
    where: { followerId: viewerId }, attributes: ['followeeId'], raw: true,
  });
  const authorIds = [viewerId, ...follows.map((f) => f.followeeId).filter((id) => !blocked.has(id))];

  const stories = await Post.findAll({
    where: { isStory: true, status: 'live', authorId: authorIds, expiresAt: { [Op.gt]: new Date() } },
    include: [{ model: User, as: 'author', attributes: authorAttrs }],
    order: [['createdAt', 'DESC']],
    limit: 500,
  });
  const viewed = await viewedSet(viewerId, stories.map((s) => s.id));

  const groups = new Map();
  for (const s of stories) {
    const dto = toPostDTO(s);
    const g = groups.get(s.authorId) || {
      user: dto.author, storyCount: 0, latestAt: dto.createdAt, expiresAt: dto.expiresAt, unseen: false,
    };
    g.storyCount += 1;
    if (!viewed.has(s.id)) g.unseen = true;
    if (dto.expiresAt > g.expiresAt) g.expiresAt = dto.expiresAt;
    groups.set(s.authorId, g);
  }

  const items = [...groups.values()]
    .sort((a, b) => Number(b.unseen) - Number(a.unseen) || new Date(b.latestAt) - new Date(a.latestAt))
    .slice(0, 50);

  const out = { items };
  await redis.set(key, JSON.stringify(out), 'EX', config.storyRailCacheSeconds);
  return out;
}

// Active stories for one creator, oldest first (plays like a story sequence)
async function getUserStories(userId, viewerId) {
  const stories = await Post.findAll({
    where: { isStory: true, status: 'live', authorId: userId, expiresAt: { [Op.gt]: new Date() } },
    include: [{ model: User, as: 'author', attributes: authorAttrs }],
    order: [['createdAt', 'ASC']],
    limit: 100,
  });
  const ids = stories.map((s) => s.id);
  const viewed = await viewedSet(viewerId, ids);
  const [likedRows, countRows] = ids.length ? await Promise.all([
    StoryLike.findAll({ where: { userId: viewerId, postId: ids }, attributes: ['postId'], raw: true }),
    StoryLike.findAll({ where: { postId: ids }, attributes: ['postId', [fn('COUNT', col('postId')), 'n']], group: ['postId'], raw: true }),
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

module.exports = { getStoryRail, getUserStories, getSubscription };
