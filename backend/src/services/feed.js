const { Op, Post, User, Follow, UserBlock } = require('../db');
const redis = require('../redis');
const config = require('../config');
const { encodeCursor, decodeCursor } = require('../lib/cursor');
const { toPostDTO } = require('../lib/serialize');

const authorInclude = (extra = {}) => ({
  model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'], ...extra,
});

function clampLimit(value) {
  const n = parseInt(value, 10);
  if (!n || n < 1) return config.feedPageSize;
  return Math.min(n, config.feedMaxPage);
}

// Keyset paging: ordered by (createdAt, id), so new posts never shift pages
// and each request reads only the rows it needs.
async function pagePosts({ where, include = [authorInclude()], cursor, limit }) {
  const w = { ...where };
  const c = decodeCursor(cursor);
  if (c) {
    w[Op.or] = [
      { createdAt: { [Op.lt]: new Date(c.t) } },
      { createdAt: new Date(c.t), id: { [Op.lt]: c.id } },
    ];
  }
  const rows = await Post.findAll({
    where: w,
    include,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toPostDTO),
    nextCursor: hasMore && last ? encodeCursor(new Date(last.createdAt).getTime(), last.id) : null,
  };
}

// Discover: newest public posts in the viewer's country. First page is cached briefly.
async function getDiscoverPage({ userId, cursor, limit }) {
  const n = clampLimit(limit);
  const parsed = /^rank:(\\d+)$/.exec(String(cursor || ''));
  const offset = parsed ? Number(parsed[1]) : 0;
  const cacheKey = `feed:discover:ranked:${userId}`;
  let ids = await redis.get(cacheKey).then((value) => value ? JSON.parse(value) : null);

  if (!ids) {
    const [candidates, follows, blocks] = await Promise.all([
      Post.findAll({
        where: { status: 'live', isStory: false, visibility: 'public' },
        attributes: ['id', 'authorId', 'createdAt', 'viewCount', 'likeCount', 'giftCoins', 'repostCount'],
        order: [['createdAt', 'DESC']], limit: 500, raw: true,
      }),
      Follow.findAll({ where: { followerId: userId }, attributes: ['followeeId'], raw: true }),
      UserBlock.findAll({ where: { blockerId: userId }, attributes: ['blockedUserId'], raw: true }),
    ]);
    const blocked = new Set(blocks.map((b) => b.blockedUserId));
    const followed = new Set(follows.map((f) => f.followeeId));
    const now = Date.now();
    ids = candidates.filter((p) => !blocked.has(p.authorId)).map((p) => {
      const ageHours = Math.max(0, (now - new Date(p.createdAt).getTime()) / 3600000);
      const freshness = 12 * Math.exp(-ageHours / 48);
      const engagement = Math.log1p(Number(p.viewCount) || 0) * 1.2
        + (Number(p.likeCount) || 0) * 2
        + (Number(p.repostCount) || 0) * 3
        + Math.log1p(Number(p.giftCoins) || 0) * 1.5;
      const community = followed.has(p.authorId) ? 5 : 0;
      return { id: p.id, score: freshness + engagement + community, createdAt: new Date(p.createdAt).getTime() };
    }).sort((a, b) => b.score - a.score || b.createdAt - a.createdAt).map((p) => p.id);
    await redis.set(cacheKey, JSON.stringify(ids), 'EX', 45);
  }

  const pageIds = ids.slice(offset, offset + n + 1);
  const hasMore = pageIds.length > n;
  const page = await hydrate(pageIds.slice(0, n));
  return {
    items: page.map(toPostDTO),
    nextCursor: hasMore ? `rank:${offset + n}` : null,
  };
}

// Following: a Redis sorted set per user (score = post time), filled on post.
// Paging walks that set in small windows and resumes after the cursor member.
async function getFollowingPage({ userId, cursor, limit }) {
  const n = clampLimit(limit);
  const c = decodeCursor(cursor);
  const max = c ? c.t : '+inf';
  const raw = await redis.zrevrangebyscore(
    `feed:following:${userId}`, max, '-inf', 'WITHSCORES', 'LIMIT', 0, n * 4 + 10);

  const entries = [];
  for (let i = 0; i < raw.length; i += 2) entries.push({ id: raw[i], t: Number(raw[i + 1]) });

  let start = 0;
  if (c) {
    const idx = entries.findIndex((e) => e.id === c.id);
    if (idx >= 0) start = idx + 1;
  }
  const window = entries.slice(start, start + n + 1);
  const hasMore = window.length > n;
  const page = window.slice(0, n);

  const [rows, blockedRows] = await Promise.all([
    hydrate(page.map((e) => e.id)),
    UserBlock.findAll({ where: { blockerId: userId }, attributes: ['blockedUserId'], raw: true }),
  ]);
  const blockedIds = new Set(blockedRows.map((row) => row.blockedUserId));
  const visibleRows = rows.filter((post) => !blockedIds.has(post.authorId));
  const last = page[page.length - 1];
  return {
    items: visibleRows.map(toPostDTO),
    nextCursor: hasMore && last ? encodeCursor(last.t, last.id) : null,
  };
}

async function hydrate(ids) {
  if (!ids.length) return [];
  const rows = await Post.findAll({
    where: { id: ids, status: 'live', isStory: false, visibility: 'public' },
    include: [authorInclude()],
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// Fan-out on write: add the new post to each follower's set, keep the newest 800
async function fanOutPost(post, followerIds) {
  const score = new Date(post.createdAt).getTime();
  for (let i = 0; i < followerIds.length; i += 500) {
    const pipe = redis.pipeline();
    for (const fid of followerIds.slice(i, i + 500)) {
      pipe.zadd(`feed:following:${fid}`, score, post.id);
      pipe.zremrangebyrank(`feed:following:${fid}`, 0, -801);
    }
    await pipe.exec();
  }
}

module.exports = { pagePosts, getDiscoverPage, getFollowingPage, fanOutPost, clampLimit, authorInclude };
