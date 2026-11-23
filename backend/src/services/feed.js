const { Op, Post, PostComment, User, Follow, UserBlock, UserMute, sequelize } = require('../db');
const redis = require('../redis');
const { rerankExploreFeed } = require('./explore-rerank');
const config = require('../config');
const { encodeCursor, decodeCursor, parseRankCursor } = require('../lib/cursor');
const { toPostDTO } = require('../lib/serialize');
const { spotlightScore, promotedToNextTier, creatorScore } = require('./formulas');

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
  const items = page.map(toPostDTO);
  await attachUniqueViewers(items);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(new Date(last.createdAt).getTime(), last.id) : null,
  };
}

// Number of distinct people who viewed each post (post_viewers), shown on profile tiles
async function attachUniqueViewers(items) {
  if (!items.length) return items;
  const ids = items.map((item) => String(item.id));
  const [rows] = await sequelize.query('SELECT postId, COUNT(*) AS n FROM post_viewers WHERE postId IN (:ids) GROUP BY postId', {
    replacements: { ids },
  }).catch(() => [[]]);
  const byId = new Map(rows.map((row) => [String(row.postId), Number(row.n)]));
  items.forEach((item) => { item.uniqueViewers = byId.get(String(item.id)) || 0; });
  return items;
}

// Rimlight Discover is the Spotlight-style recommendation feed. It shares the
// same ranking engine as Explore; Following remains strictly chronological.
async function getDiscoverPage({ userId, cursor, limit }) {
  return getRimlightPage({ userId, cursor, limit });
}

// Explore: what someone is likely to want to see from accounts they do not follow.
// Own posts and followed accounts are left out (Instagram's Explore works the same way), engagement
// rate counts more than age, and no author takes more than two places in a page.
const EXPLORE_AUTHOR_CAP = 2;
const EXPLORE_WINDOW = 30;

const SEED_POOL = 300;        // seed_pool_remaining starts at 300 (the blueprint's cold-start batch)
const SEED_EVERY = 4;         // one seeding post per four ranked posts
const SEED_WINDOW_HOURS = 72; // a post stops seeding after this long even if it has few views

async function getSpotlightPage({ userId, cursor, limit, cachePrefix = 'feed:explore' }) {
  const n = clampLimit(limit);
  const offset = parseRankCursor(cursor);
  const cacheKey = `${cachePrefix}:ranked:${userId}`;
  const includeOwn = cachePrefix === 'feed:discover';
  let ids = await redis.get(cacheKey).then((value) => value ? JSON.parse(value) : null);

  if (!ids) {
    const [candidates, follows, blocks, mutedRows] = await Promise.all([
      Post.findAll({
        where: { status: 'live', isStory: false, visibility: 'public' },
        attributes: ['id', 'authorId', 'createdAt', 'viewCount', 'likeCount', 'giftCoins', 'repostCount', 'topic'],
        order: [['createdAt', 'DESC']], limit: 500, raw: true,
      }),
      Follow.findAll({ where: { followerId: userId }, attributes: ['followeeId'], raw: true }),
      UserBlock.findAll({ where: { [Op.or]: [{ blockerId: userId }, { blockedUserId: userId }] }, attributes: ['blockerId', 'blockedUserId'], raw: true }),
      UserMute.findAll({ where: { userId }, attributes: ['mutedUserId'], raw: true }),
    ]);
    const blocked = new Set(blocks.map((b) => b.blockerId === userId ? b.blockedUserId : b.blockerId));
    const followed = new Set(follows.map((f) => f.followeeId));
    const muted = new Set(mutedRows.map((row) => String(row.mutedUserId)));
    const [authors, viewer] = await Promise.all([
      User.findAll({ where: { id: [...new Set(candidates.map((p) => p.authorId))] }, attributes: ['id', 'followerCount', 'country'], raw: true }),
      User.findByPk(userId, { attributes: ['id', 'country'], raw: true }),
    ]);
    const followersOf = new Map(authors.map((u) => [String(u.id), Number(u.followerCount) || 0]));
    const countryOf = new Map(authors.map((u) => [String(u.id), String(u.country || '').toUpperCase()]));
    const viewerCountry = String(viewer?.country || '').toUpperCase();
    // Topic affinity is learned from explicit and behavioural feedback, independently
    // of any single post's score. Unknown topics remain neutral.
    const topics = [...new Set(candidates.map((p) => String(p.topic || '').trim().toLowerCase()).filter(Boolean))];
    // Personalization opt-out (Snapchat: basic data only). Public signals and country still apply.
    const personalized = await redis.get(`feed:personalization-off:${userId}`).then((v) => v !== '1').catch(() => true);
    const topicPipe = redis.pipeline();
    for (const topic of topics) topicPipe.hget(`feed:topic-preferences:${userId}`, topic);
    const topicRows = await topicPipe.exec().catch(() => []);
    const topicPreferenceOf = new Map(topics.map((topic, i) => [topic, Number(topicRows[i]?.[1]) || 0]));
    // Read only this page's candidate preferences; do not load a viewer's entire history hash.
    const preferencePipe = redis.pipeline();
    for (const p of candidates) preferencePipe.hget(`feed:preferences:${userId}`, String(p.id));
    const preferenceRows = await preferencePipe.exec().catch(() => []);
    const preferenceOf = new Map(candidates.map((p, i) => [String(p.id), Number(preferenceRows[i]?.[1]) || 0]));
    // Rimlight/Spotlight audience aggregates: average watch completion, completion,
    // rewatch rate and fast skips. Missing history is neutral rather than negative.
    const spotPipe = redis.pipeline();
    for (const p of candidates) spotPipe.hmget(`spot:${p.id}`, 'watchPct', 'watches', 'skips', 'completions', 'rewatches');
    const spotRows = await spotPipe.exec().catch(() => []);
    const spotOf = new Map(candidates.map((p, i) => {
      const [watchPct, watches, skips, completions, rewatches] = (spotRows[i] && spotRows[i][1]) || [];
      const watchCount = Number(watches) || 0;
      return [String(p.id), {
        watchPct: Number(watchPct) || 0,
        watches: watchCount,
        skips: Number(skips) || 0,
        completions: Number(completions) || 0,
        rewatches: Number(rewatches) || 0,
      }];
    }));
    const now = Date.now();
    const scored = candidates
      // Rimlight Discover includes the viewer's own posts; Explore leaves them out
      .filter((p) => (includeOwn || p.authorId !== userId) && !followed.has(p.authorId) && !blocked.has(p.authorId) && !muted.has(String(p.authorId)))
      .map((p) => {
        // Rimlight uses the same Spotlight ranking engine as Explore. Likes/reposts
        // are durable post counters; watch, completion, rewatch and fast-skip signals
        // are aggregated from authenticated viewing-session feedback.
        const views = Math.max(1, Number(p.viewCount) || 0);
        const ageHours = Math.max(0, (now - new Date(p.createdAt).getTime()) / 3600000);
        const likes = Number(p.likeCount) || 0;
        const shares = Number(p.repostCount) || 0;
        const spot = spotOf.get(String(p.id)) || { watchPct: 0, watches: 0, skips: 0, completions: 0, rewatches: 0 };
        const avgWatchPct = spot.watches > 0 ? spot.watchPct / spot.watches : 0;
        const loopRate = spot.watches > 0 ? Math.min(1, spot.rewatches / spot.watches) : 0;
        // Promote only after a meaningful audience sample; completions are measured,
        // not inferred from likes or reposts.
        const tier = promotedToNextTier({
          views: Number(p.viewCount) || 0,
          likes,
          shares,
          watches75: spot.completions,
        }) ? 2 : 1;
        const baseScore = tier * spotlightScore({
          avgWatchPct,
          loopRate,
          skipUnder2s: Math.min(1, spot.skips / views),
          likeRate: Math.min(1, likes / views),
          shareRate: Math.min(1, shares / views),
          creatorScore: creatorScore({ followers: followersOf.get(String(p.authorId)) || 0, engagementRate: likes / views }),
          hoursPosted: ageHours,
        });
        // Personalize ranking with this viewer's bounded feedback history. Positive
        // watch/completion/share signals lift relevant posts; skips and "not interested"
        // lower them. The per-viewer score is deliberately capped to prevent domination.
        const preference = preferenceOf.get(String(p.id)) || 0;
        const personalizedBoost = personalized ? Math.max(-20, Math.min(40, preference * 0.5)) : 0;
        const topic = String(p.topic || '').trim().toLowerCase();
        const topicPreference = topicPreferenceOf.get(topic) || 0;
        const topicBoost = personalized ? Math.max(-12, Math.min(18, topicPreference * 0.3)) : 0;
        // Country is a low-weight localization hint, never a substitute for relevance.
        const localBoost = viewerCountry && countryOf.get(String(p.authorId)) === viewerCountry ? 3 : 0;
        const score = baseScore + personalizedBoost + topicBoost + localBoost;
        // Cold start (Inject_Into_Cold_Start_Queue): a new post is seeding until SEED_POOL views or SEED_WINDOW_HOURS pass
        const seeding = (Number(p.viewCount) || 0) < SEED_POOL && ageHours < SEED_WINDOW_HOURS;
        // Explore re-ranking inputs. Save and comment counters are not stored yet, so they are 0.
        const unit = (x) => Math.min(1, Math.max(0, x));
        const probs = {
          watch_complete: unit(avgWatchPct),
          share: unit(shares / views),
          save: 0,
          comment: 0,
          like: unit(likes / views),
          not_interested: unit(Math.max(0, -preference) / 40),
          quick_skip: unit(spot.skips / views),
        };
        return { id: p.id, authorId: p.authorId, topic, score, seeding, createdAt: new Date(p.createdAt).getTime(), probs, ageHours };
      })
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);

    // Explore ranks with the MMR re-ranking (explore-rerank.js). Other surfaces keep the author and topic caps.
    let ranked;
    if (cachePrefix === 'feed:explore') {
      const vocabulary = [...new Set(scored.map((item) => item.topic).filter(Boolean))];
      const topicIndex = new Map(vocabulary.map((topic, i) => [topic, i]));
      const candidates = scored.map((item) => {
        const embedding = new Array(vocabulary.length).fill(0);
        if (item.topic) embedding[topicIndex.get(item.topic)] = 1;
        return { ...item, embedding };
      });
      const reranked = rerankExploreFeed(candidates, { topK: Math.min(candidates.length, 200) });
      const placed = new Set(reranked.map((item) => item.id));
      ranked = [...reranked, ...scored.filter((item) => !placed.has(item.id))];
    } else {
      // Diversity: cap repeat creators and topics in the first recommendation window.
      const perAuthor = new Map();
      const perTopic = new Map();
      const head = [];
      const tail = [];
      for (const item of scored) {
        const count = perAuthor.get(item.authorId) || 0;
        const topicCount = item.topic ? (perTopic.get(item.topic) || 0) : 0;
        if (head.length < EXPLORE_WINDOW && (count >= EXPLORE_AUTHOR_CAP || (item.topic && topicCount >= 5))) {
          tail.push(item);
          continue;
        }
        perAuthor.set(item.authorId, count + 1);
        if (item.topic) perTopic.set(item.topic, topicCount + 1);
        head.push(item);
      }
      // Seeding posts take one slot after every SEED_EVERY ranked posts, newest first, so new posts get early views
        ranked = [...head, ...tail];
    }
    const seedQueue = ranked.filter((item) => item.seeding).sort((a, b) => b.createdAt - a.createdAt);
    const rankedOnly = ranked.filter((item) => !item.seeding);
    const merged = [];
    let next = 0;
    rankedOnly.forEach((item, index) => {
      merged.push(item);
      if ((index + 1) % SEED_EVERY === 0 && next < seedQueue.length) merged.push(seedQueue[next++]);
    });
    merged.push(...seedQueue.slice(next));
    ids = merged.map((item) => item.id);
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

// Rimlight Discover: TikTok-style ranking. Driven by watch time, completion and loops,
// shares, comments, likes, topic interest and fast skips, with no creator follower count.
// Explore keeps the Spotlight engine above. Own posts are included.
async function getRimlightPage({ userId, cursor, limit }) {
  const n = clampLimit(limit);
  const offset = parseRankCursor(cursor);
  // Same key as before, so the existing cache invalidation on posts, reports and feedback still applies
  const cacheKey = `feed:discover:ranked:${userId}`;
  let ids = await redis.get(cacheKey).then((value) => value ? JSON.parse(value) : null);

  if (!ids) {
    const [candidates, blocks] = await Promise.all([
      Post.findAll({
        where: { status: 'live', isStory: false, visibility: 'public' },
        attributes: ['id', 'authorId', 'createdAt', 'viewCount', 'likeCount', 'repostCount', 'topic'],
        order: [['createdAt', 'DESC']], limit: 500, raw: true,
      }),
      UserBlock.findAll({ where: { [Op.or]: [{ blockerId: userId }, { blockedUserId: userId }] }, attributes: ['blockerId', 'blockedUserId'], raw: true }),
    ]);
    const blocked = new Set(blocks.map((b) => b.blockerId === userId ? b.blockedUserId : b.blockerId));
    const topicList = [...new Set(candidates.map((p) => String(p.topic || '').trim().toLowerCase()).filter(Boolean))];
    const topicPipe = redis.pipeline();
    for (const topic of topicList) topicPipe.hget(`feed:topic-preferences:${userId}`, topic);
    const topicRows = await topicPipe.exec().catch(() => []);
    const topicPrefOf = new Map(topicList.map((topic, i) => [topic, Number(topicRows[i]?.[1]) || 0]));
    const spotPipe = redis.pipeline();
    for (const p of candidates) spotPipe.hmget(`spot:${p.id}`, 'watchPct', 'watches', 'skips', 'completions', 'rewatches');
    const spotRows = await spotPipe.exec().catch(() => []);
    const commentRows = candidates.length
      ? await PostComment.findAll({
        where: { postId: candidates.map((p) => p.id) },
        attributes: ['postId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
        group: ['postId'], raw: true,
      }).catch(() => [])
      : [];
    const commentsOf = new Map(commentRows.map((r) => [String(r.postId), Number(r.n) || 0]));

    const now = Date.now();
    const scored = candidates
      .map((p, i) => ({ p, spot: (spotRows[i] && spotRows[i][1]) || [] }))
      .filter(({ p }) => !blocked.has(p.authorId))
      .map(({ p, spot }) => {
        const views = Math.max(1, Number(p.viewCount) || 0);
        const [watchPct, watches, skips, completions, rewatches] = spot;
        const watchCount = Number(watches) || 0;
        // Average share of the video watched (watchPct is stored as a percentage sum)
        const avgWatchRatio = watchCount > 0 ? Math.min(1, (Number(watchPct) || 0) / watchCount / 100) : 0;
        const completionRate = (Number(completions) || 0) / views;
        const rewatchRate = (Number(rewatches) || 0) / views;
        const shareRate = (Number(p.repostCount) || 0) / views;
        const commentRate = (commentsOf.get(String(p.id)) || 0) / views;
        const likeRate = (Number(p.likeCount) || 0) / views;
        const fastSkipRate = (Number(skips) || 0) / views;
        const topic = String(p.topic || '').trim().toLowerCase();
        // Topic interest from this viewer's feedback, scaled to 0–1
        const longTermInterest = Math.max(0, Math.min(1, (topicPrefOf.get(topic) || 0) / 10));
        const ageHours = Math.max(0, (now - new Date(p.createdAt).getTime()) / 3600000);
        const freshness = 1 / Math.pow(ageHours + 2, 1.15);
        const rawScore =
          avgWatchRatio * 4.0 +
          completionRate * 4.5 +
          rewatchRate * 5.0 +
          shareRate * 3.5 +
          commentRate * 2.5 +
          likeRate * 1.5 +
          longTermInterest * 2.5 -
          fastSkipRate * 5.5;
        return { id: p.id, score: rawScore * freshness };
      })
      .sort((a, b) => b.score - a.score);

    // Exploration: from 60% down the ranking, one more post is inserted after every 6 ranked posts
    const ordered = [];
    let exploreIndex = Math.floor(scored.length * 0.6);
    for (let i = 0; i < scored.length; i++) {
      if (i > 0 && i % 6 === 0 && exploreIndex < scored.length) ordered.push(scored[exploreIndex++].id);
      ordered.push(scored[i].id);
    }
    ids = [...new Set(ordered)];
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
// Posts reach the Following index when they are published. Posts made before the
// viewer followed someone, or while the index was missing, are added from the
// database so Following always shows the creators the viewer follows.
async function backfillFollowing(userId) {
  const follows = await Follow.findAll({ where: { followerId: userId }, attributes: ['followeeId'], raw: true });
  const authorIds = follows.map((f) => f.followeeId);
  if (!authorIds.length) return;
  const rows = await Post.findAll({
    where: { authorId: authorIds, status: 'live', isStory: false, visibility: 'public' },
    attributes: ['id', 'createdAt'], order: [['createdAt', 'DESC']], limit: 200, raw: true,
  });
  if (!rows.length) return;
  const pipe = redis.pipeline();
  for (const row of rows) pipe.zadd(`feed:following:${userId}`, new Date(row.createdAt).getTime(), row.id);
  await pipe.exec();
}

async function getFollowingPage({ userId, cursor, limit }) {
  const n = clampLimit(limit);
  const c = decodeCursor(cursor);
  const max = c ? c.t : '+inf';
  let raw = await redis.zrevrangebyscore(
    `feed:following:${userId}`, max, '-inf', 'WITHSCORES', 'LIMIT', 0, n * 4 + 10);
  if (!c && raw.length === 0) {
    await backfillFollowing(userId).catch(() => {});
    raw = await redis.zrevrangebyscore(`feed:following:${userId}`, max, '-inf', 'WITHSCORES', 'LIMIT', 0, n * 4 + 10);
  }

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

async function getExplorePage({ userId, cursor, limit }) {
  return getSpotlightPage({ userId, cursor, limit, cachePrefix: 'feed:explore' });
}

module.exports = {
  getExplorePage, pagePosts, getDiscoverPage, getFollowingPage, fanOutPost, clampLimit, authorInclude, markFollowing };
