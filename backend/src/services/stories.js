const { Op, Post, User, Follow, StoryView, StoryLike, UserMute } = require('../db');
const { fn, col } = require('sequelize');
const redis = require('../redis');
const { discoverScore, interestBoostFor, discoverFeedScore } = require('./formulas');
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
    attributes: ['id', 'createdAt'], raw: true, order: [['createdAt', 'DESC']], limit: TRAY_LIMIT,
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
  const cached = await redis.get(key).catch(() => null);
  if (cached) {
    try {
      const hit = JSON.parse(cached);
      if (hit && Array.isArray(hit.items)) {
        return {
          ...hit,
          items: hit.items
            .filter((item) => !blocked.has(item.user?.id) && !muted.has(String(item.user?.id)))
            .filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > Date.now()),
        };
      }
    } catch { /* Discard malformed cache and rebuild from the story tray/database. */ }
    await redis.del(key).catch(() => {});
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
  await redis.set(key, JSON.stringify(out), 'EX', config.storyRailCacheSeconds).catch(() => {});
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
    // Keep the newest 100 active stories, then play that retained window oldest-first.
    order: [['createdAt', 'DESC']],
    limit: 100,
  });
  stories.reverse();
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
  const [blocked, mutedRows] = await Promise.all([
    blockedUserIds(viewerId),
    UserMute.findAll({ where: { userId: viewerId }, attributes: ['mutedUserId'], raw: true }),
  ]);
  const muted = mutedRows.map((row) => String(row.mutedUserId));
  const candidates = await Post.findAll({
    where: {
      isStory: true, status: 'live', visibility: 'public', expiresAt: { [Op.gt]: new Date() },
      authorId: { [Op.notIn]: [viewerId, ...blocked, ...muted] },
    },
    include: [{ model: User, as: 'author', attributes: authorAttrs }],
    order: [['createdAt', 'DESC']],
    limit: 300,
  });
  if (!candidates.length) return [];

  const ids = candidates.map((story) => story.id);
  const authorIds = [...new Set(candidates.map((story) => String(story.authorId)))];
  const [follows, likedRows, viewed, likeRows, shareRows, affinity] = await Promise.all([
    Follow.findAll({ where: { followerId: viewerId, followeeId: authorIds }, attributes: ['followeeId'], raw: true }),
    sequelize.query(
      `SELECT p.topic FROM post_likes pl JOIN posts p ON p.id = pl.postId
       WHERE pl.userId = :me AND p.topic IS NOT NULL ORDER BY pl.createdAt DESC LIMIT 200`,
      { replacements: { me: viewerId } },
    ).then(([rows]) => rows || []).catch(() => []),
    viewedSet(viewerId, ids),
    StoryLike.findAll({
      where: { postId: ids },
      attributes: ['postId', [fn('COUNT', col('postId')), 'n']],
      group: ['postId'], raw: true,
    }).catch(() => []),
    sequelize.query(
      `SELECT postId, COUNT(*) AS n FROM reposts WHERE postId IN (:ids) GROUP BY postId`,
      { replacements: { ids } },
    ).then(([rows]) => rows || []).catch(() => []),
    require('./ranking').friendScores(viewerId, authorIds).catch(() => ({})),
  ]);

  const followedIds = new Set(follows.map((row) => String(row.followeeId)));
  const likedTopics = new Set(likedRows.map((row) => String(row.topic).toLowerCase()));
  const likesByStory = new Map(likeRows.map((row) => [String(row.postId), Number(row.n) || 0]));
  const sharesByStory = new Map(shareRows.map((row) => [String(row.postId), Number(row.n) || 0]));
  const now = Date.now();

  const scored = candidates.map((story) => {
    const id = String(story.id);
    const creatorId = String(story.authorId);
    const hoursPosted = Math.max(0, (now - new Date(story.createdAt).getTime()) / 3600000);
    const views = Math.max(0, Number(story.viewCount) || 0);
    const likes = likesByStory.get(id) || 0;
    const shares = sharesByStory.get(id) || 0;
    const topic = String(story.topic || '').trim().toLowerCase();
    const interest = topic && likedTopics.has(topic) ? 1.5 : 1;
    const isViewed = viewed.has(story.id);

    // Carousel score: social affinity + measured story interactions, with 1.6 recency gravity.
    // StoryView currently stores a view event, not completion duration; creator affinity is used
    // as the available watch-habit proxy until completion telemetry exists.
    const interactions = likes * 2 + shares * 3;
    const socialAffinity = Number(affinity[creatorId]) || 0;
    const carouselScore = ((2 * interactions) + (1.5 * socialAffinity))
      / Math.pow(hoursPosted + 2, 1.6) * (isViewed ? 0.1 : 1);

    // Discover expected-value proxy: CTR is approximated from positive interactions per view.
    // Watch-time and bounce/exit are not persisted in the current StoryView schema, so they
    // remain neutral instead of fabricating behavioural measurements.
    const pClick = Math.min(1, (likes + shares * 1.5 + 1) / (views + 10));
    const watchValue = views > 0 ? Math.min(1, views / (views + 20)) : 0.1;
    const engagementValue = (watchValue * 10) + (shares * 3) + (likes * 1.5);
    const freshness = 1 / Math.pow(hoursPosted + 2, 1.2);
    const discoverScoreValue = pClick * engagementValue * interest * freshness;
    const score = followedIds.has(creatorId) ? carouselScore : discoverScoreValue;

    return {
      story,
      score,
      carouselScore,
      discoverScore: discoverScoreValue,
      viewed: isViewed,
      subscribed: followedIds.has(creatorId),
      topic: topic || null,
    };
  });

  scored.sort((a, b) => b.score - a.score || new Date(b.story.createdAt) - new Date(a.story.createdAt));
  return scored.slice(0, limit).map(({ story, viewed: isViewed, subscribed, topic, carouselScore, discoverScore: ev }) => ({
    ...toPostDTO(story),
    viewed: isViewed,
    subscribed,
    topic,
    ranking: { carousel: Number(carouselScore.toFixed(4)), discover: Number(ev.toFixed(4)) },
  }));
}

// Greedy topic diversity: repeated topics receive a 0.7 multiplier; adjacent creators are also avoided.
function diversify(list, keyOf) {
  const pool = [...list];
  const out = [];
  while (pool.length) {
    const previous = out[out.length - 1];
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const item = pool[i];
      if (previous && keyOf(item) === keyOf(previous)) continue;
      const repeatedTopic = Boolean(previous?.topic && item.topic && previous.topic === item.topic);
      const base = Number(item.ranking?.discover ?? item.ranking?.carousel ?? 0);
      const effective = base * (repeatedTopic ? 0.7 : 1);
      if (effective > bestScore) { bestScore = effective; bestIndex = i; }
    }
    if (bestIndex < 0) {
      // If every remaining item belongs to the previous creator, preserve ranking order.
      bestIndex = 0;
    }
    out.push(pool.splice(bestIndex, 1)[0]);
  }
  return out;
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


async function getDiscoverSections(viewerId, limit = 24) {
  // The carousel holds stories from creators the viewer follows, until they expire: watched
  // ones stay in the carousel (after unseen ones) and never move to the grid. The grid holds
  // everything else, with one story per creator across both sections.
  const ranked = await getDiscoverStories(viewerId, Math.max(limit * 3, 72));
  const creatorOf = (story) => String(story.author?.id ?? '');
  const seenCreators = new Set();
  const carousel = [];
  const carouselCandidates = ranked
    .filter((story) => story.subscribed)
    .sort((a, b) => (Number(a.viewed) - Number(b.viewed))
      || (Number(b.ranking?.carousel) || 0) - (Number(a.ranking?.carousel) || 0));
  for (const story of carouselCandidates) {
    if (carousel.length >= limit) break;
    const creator = creatorOf(story);
    if (!creator || seenCreators.has(creator)) continue;
    seenCreators.add(creator);
    carousel.push(story);
  }
  const items = [];
  for (const story of ranked) {
    if (items.length >= limit) break;
    if (story.subscribed) continue;
    const creator = creatorOf(story);
    if (!creator || seenCreators.has(creator)) continue;
    seenCreators.add(creator);
    items.push(story);
  }
  return { carousel, items };
}

module.exports = { getDiscoverSections, getPopularStories, getStoryRail, getUserStories, getSubscription, storyRingsFor, invalidateRailsFor, fanOutStory, addFolloweeToTray };
