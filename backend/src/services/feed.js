const { Op, Post, User, Follow, UserBlock, UserMute } = require('../db');
const redis = require('../redis');
const config = require('../config');
const { encodeCursor, decodeCursor, parseRankCursor } = require('../lib/cursor');
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
  const offset = parseRankCursor(cursor);
  const cacheKey = `feed:discover:ranked:${userId}`;
  let ids = await redis.get(cacheKey).then((value) => value ? JSON.parse(value) : null);

  if (!ids) {
    const [candidates, follows, blocks, mutedRows] = await Promise.all([
      Post.findAll({
        where: { status: 'live', isStory: false, visibility: 'public' },
        attributes: ['id', 'authorId', 'createdAt', 'viewCount', 'likeCount', 'giftCoins', 'repostCount'],
        order: [['createdAt', 'DESC']], limit: 500, raw: true,
      }),
      Follow.findAll({ where: { followerId: userId }, attributes: ['followeeId'], raw: true }),
      UserBlock.findAll({ where: { [Op.or]: [{ blockerId: userId }, { blockedUserId: userId }] }, attributes: ['blockerId', 'blockedUserId'], raw: true }),
    UserMute.findAll({ where: { userId }, attributes: ['mutedUserId'], raw: true }),
      UserMute.findAll({ where: { userId }, attributes: ['mutedUserId'], raw: true }),
    ]);
    const blocked = new Set(blocks.map((b) => b.blockerId === userId ? b.blockedUserId : b.blockerId));
    const followed = new Set(follows.map((f) => f.followeeId));
    const muted = new Set(mutedRows.map((row) => String(row.mutedUserId)));
    // Rimlight Discover is newest-first (LIFO): the latest published post appears first.
    // Keep recommendation scoring in Explore, while Following remains chronological too.
    ids = candidates
      .filter((p) => !blocked.has(p.authorId) && !muted.has(String(p.authorId)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((p) => p.id);
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

// Explore: what someone is likely to want to see from accounts they do not follow.
// Own posts and followed accounts are left out (Instagram's Explore works the same way), engagement
// rate counts more than age, and no author takes more than two places in a page.
const EXPLORE_AUTHOR_CAP = 2;
const EXPLORE_WINDOW = 30;

async function getExplorePage({ userId, cursor, limit }) {
  const n = clampLimit(limit);
  const offset = parseRankCursor(cursor);
  const cacheKey = `feed:explore:ranked:${userId}`;
  let ids = await redis.get(cacheKey).then((value) => value ? JSON.parse(value) : null);

  if (!ids) {
    const [candidates, follows, blocks, mutedRows] = await Promise.all([
      Post.findAll({
        where: { status: 'live', isStory: false, visibility: 'public' },
        attributes: ['id', 'authorId', 'createdAt', 'viewCount', 'likeCount', 'giftCoins', 'repostCount'],
        order: [['createdAt', 'DESC']], limit: 500, raw: true,
      }),
      Follow.findAll({ where: { followerId: userId }, attributes: ['followeeId'], raw: true }),
      UserBlock.findAll({ where: { [Op.or]: [{ blockerId: userId }, { blockedUserId: userId }] }, attributes: ['blockerId', 'blockedUserId'], raw: true }),
      UserMute.findAll({ where: { userId }, attributes: ['mutedUserId'], raw: true }),
    ]);
    const blocked = new Set(blocks.map((b) => b.blockerId === userId ? b.blockedUserId : b.blockerId));
    const followed = new Set(follows.map((f) => f.followeeId));
    const preferenceScores = await redis.hgetall(`feed:preferences:${userId}`).catch(() => ({}));
    const now = Date.now();
    const scored = candidates
      .filter((p) => p.authorId !== userId && !followed.has(p.authorId) && !blocked.has(p.authorId) && !muted.has(String(p.authorId)))
      .map((p) => {
        const views = Number(p.viewCount) || 0;
        const interactions = (Number(p.likeCount) || 0) * 2 + (Number(p.repostCount) || 0) * 3 + Math.log1p(Number(p.giftCoins) || 0) * 2;
        // Engagement rate, smoothed so a post with few views is not over-rewarded.
        const rate = interactions / (views + 20);
        const ageHours = Math.max(0, (now - new Date(p.createdAt).getTime()) / 3600000);
        const score = rate * 40
          + Math.log1p(views) * 0.8
          + 4 * Math.exp(-ageHours / 168)
          + (Number(preferenceScores[p.id]) || 0);
        return { id: p.id, authorId: p.authorId, score, createdAt: new Date(p.createdAt).getTime() };
      })
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);

    // Diversity: the first window keeps at most EXPLORE_AUTHOR_CAP posts per author; the rest follow in score order.
    const perAuthor = new Map();
    const head = [];
    const tail = [];
    for (const item of scored) {
      const count = perAuthor.get(item.authorId) || 0;
      if (head.length < EXPLORE_WINDOW && count >= EXPLORE_AUTHOR_CAP) { tail.push(item); continue; }
      perAuthor.set(item.authorId, count + 1);
      head.push(item);
    }
    ids = [...head, ...tail].map((item) => item.id);
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

  const [rows, blockedRows, mutedRows] = await Promise.all([
    hydrate(page.map((e) => e.id)),
    UserBlock.findAll({ where: { [Op.or]: [{ blockerId: userId }, { blockedUserId: userId }] }, attributes: ['blockerId', 'blockedUserId'], raw: true }),
    UserMute.findAll({ where: { userId }, attributes: ['mutedUserId'], raw: true }),
  ]);
  const blockedIds = new Set(blockedRows.map((row) => row.blockerId === userId ? row.blockedUserId : row.blockerId));
  const mutedIds = new Set(mutedRows.map((row) => String(row.mutedUserId)));
  const visibleRows = rows.filter((post) => !blockedIds.has(post.authorId) && !mutedIds.has(String(post.authorId)));
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

// Tells the viewer, for each post author, whether they already follow that author.
async function markFollowing(result, viewerId) {
  const authorIds = [...new Set(result.items.map((item) => item.author?.id).filter(Boolean))];
  if (!authorIds.length) return result;
  const rows = await Follow.findAll({
    where: { followerId: viewerId, followeeId: { [Op.in]: authorIds } }, attributes: ['followeeId'], raw: true,
  });
  const followed = new Set(rows.map((row) => row.followeeId));
  return {
    ...result,
    items: result.items.map((item) => (item.author
      ? { ...item, author: { ...item.author, isFollowing: followed.has(item.author.id) } }
      : item)),
  };
}

module.exports = {
  getExplorePage, pagePosts, getDiscoverPage, getFollowingPage, fanOutPost, clampLimit, authorInclude, markFollowing };
