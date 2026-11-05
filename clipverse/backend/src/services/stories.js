const { Op, Post, User, Follow, StoryView } = require('../db');
const redis = require('../redis');
const config = require('../config');
const { toPostDTO } = require('../lib/serialize');

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
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const follows = await Follow.findAll({
    where: { followerId: viewerId }, attributes: ['followeeId'], raw: true,
  });
  const authorIds = [viewerId, ...follows.map((f) => f.followeeId)];

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
  const viewed = await viewedSet(viewerId, stories.map((s) => s.id));
  return stories.map((s) => ({ ...toPostDTO(s), viewed: viewed.has(s.id) }));
}

module.exports = { getStoryRail, getUserStories };
