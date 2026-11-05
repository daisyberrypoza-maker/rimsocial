const { Op, Post, User } = require('../db');
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
async function getDiscoverPage({ country, cursor, limit }) {
  const n = clampLimit(limit);
  const cacheKey = !cursor && n === config.feedPageSize ? 'feed:discover:global' : null;
  if (cacheKey) {
    const hit = await redis.get(cacheKey);
    if (hit) return JSON.parse(hit);
  }
  const page = await pagePosts({
    where: { status: 'live', isStory: false, visibility: 'public' },
    include: [authorInclude()],
    cursor,
    limit: n,
  });
  if (cacheKey) await redis.set(cacheKey, JSON.stringify(page), 'EX', 30);
  return page;
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

  const rows = await hydrate(page.map((e) => e.id));
  const last = page[page.length - 1];
  return {
    items: rows.map(toPostDTO),
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
