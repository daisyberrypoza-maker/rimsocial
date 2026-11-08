// Ordering for Stories: Friends by interaction and recency, Discover by behaviour, interests,
// country, engagement and variety. Each signal is read on its own, so one missing table never
// breaks the whole ranking.
const { sequelize } = require('../db');

const DAY = 86400000;
const TAG = /#[\p{L}\p{N}_]+/gu;

async function run(sql, replacements) {
  try {
    const [rows] = await sequelize.query(sql, { replacements });
    return rows || [];
  } catch { return []; }
}

// Friends: messages and story views in the last 30 days, plus how recent their newest story is.
async function friendScores(viewerId, creatorIds) {
  const scores = Object.fromEntries(creatorIds.map((id) => [id, 0]));
  if (!creatorIds.length) return scores;
  const since = new Date(Date.now() - 30 * DAY);
  const [messages, views, latest] = await Promise.all([
    run(`SELECT CASE WHEN senderId = :me THEN recipientId ELSE senderId END AS other, COUNT(*) AS n
         FROM direct_messages WHERE createdAt > :since AND (senderId = :me OR recipientId = :me) GROUP BY other`,
      { me: viewerId, since }),
    run(`SELECT p.authorId AS other, COUNT(*) AS n FROM story_views sv JOIN posts p ON p.id = sv.storyId
         WHERE sv.viewerId = :me AND sv.createdAt > :since GROUP BY p.authorId`, { me: viewerId, since }),
    run(`SELECT authorId AS other, MAX(createdAt) AS latest FROM posts
         WHERE isStory = 1 AND status = 'live' AND expiresAt > NOW() AND authorId IN (:ids) GROUP BY authorId`,
      { ids: creatorIds }),
  ]);
  for (const row of messages) if (row.other in scores) scores[row.other] += Number(row.n) * 3;
  for (const row of views) if (row.other in scores) scores[row.other] += Number(row.n) * 2;
  for (const row of latest) {
    if (!(row.other in scores)) continue;
    const hours = (Date.now() - new Date(row.latest).getTime()) / 3600000;
    scores[row.other] += Math.max(0, 24 - hours);
  }
  return scores;
}

// Discover: interests from posts the viewer liked, creator topics, country, engagement, verified.
async function discoverScores(viewer, candidates) {
  const scores = Object.fromEntries(candidates.map((c) => [c.id, 0]));
  if (!candidates.length) return scores;
  const ids = candidates.map((c) => c.id);
  const [liked, recent, engagement] = await Promise.all([
    run(`SELECT p.caption FROM post_likes pl JOIN posts p ON p.id = pl.postId
         WHERE pl.userId = :me AND p.caption IS NOT NULL ORDER BY pl.createdAt DESC LIMIT 200`, { me: viewer.id }),
    run(`SELECT authorId, caption FROM posts WHERE status = 'live' AND isStory = 0 AND caption IS NOT NULL
         AND authorId IN (:ids) AND createdAt > :since LIMIT 3000`, { ids, since: new Date(Date.now() - 14 * DAY) }),
    run(`SELECT authorId, SUM(viewCount) AS views FROM posts WHERE status = 'live' AND authorId IN (:ids)
         AND createdAt > :since GROUP BY authorId`, { ids, since: new Date(Date.now() - 7 * DAY) }),
  ]);
  const interests = new Set();
  for (const row of liked) for (const tag of row.caption.match(TAG) || []) interests.add(tag.toLowerCase());
  const topics = new Map();
  for (const row of recent) {
    const set = topics.get(row.authorId) || new Set();
    for (const tag of row.caption.match(TAG) || []) set.add(tag.toLowerCase());
    topics.set(row.authorId, set);
  }
  const views = new Map(engagement.map((row) => [row.authorId, Number(row.views) || 0]));
  for (const c of candidates) {
    let score = 0;
    const tags = topics.get(c.id) || new Set();
    for (const tag of tags) if (interests.has(tag)) score += 4;
    if (viewer.country && c.country === viewer.country) score += 5;
    score += Math.log10(1 + (views.get(c.id) || 0)) * 2;
    if (c.isCreator) score += 2;
    scores[c.id] = score;
  }
  return scores;
}

// Variety: interleave countries so the same region doesn't dominate the row.
function varied(orderedIds, countryOf) {
  const buckets = new Map();
  for (const id of orderedIds) {
    const key = countryOf.get(id) || '';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
  }
  const queues = [...buckets.values()];
  const out = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift());
  return out;
}

module.exports = { friendScores, discoverScores, varied };
