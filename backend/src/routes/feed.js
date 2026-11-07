const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const feed = require('../services/feed');

// GET /v1/feed/discover?cursor=...&limit=10
router.get('/discover', requireAuth, async (req, res, next) => {
  try {
    res.json(await feed.markFollowing(await feed.getDiscoverPage({
      userId: req.user.id, cursor: req.query.cursor, limit: req.query.limit,
    }), req.user.id));
  } catch (e) { next(e); }
});

// GET /v1/feed/following?cursor=...&limit=10
router.get('/following', requireAuth, async (req, res, next) => {
  try {
    res.json(await feed.markFollowing(await feed.getFollowingPage({
      userId: req.user.id, cursor: req.query.cursor, limit: req.query.limit,
    }), req.user.id));
  } catch (e) { next(e); }
});


// Record first-party recommendation signals from the actual viewing session.
// Scores are bounded per viewer/post so repeatedly submitting an event cannot
// grow a single post's ranking score without limit.
router.post('/feedback', requireAuth, async (req, res, next) => {
  try {
    const redis = require('../redis');
    const { Post, UserBlock } = require('../db');
    const postId = String(req.body.postId || '').trim();
    const event = String(req.body.event || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(postId)) return res.status(400).json({ error: 'Valid postId is required' });
    const weights = { completed: 5, liked: 7, shared: 6, followed: 8, rewatch: 4, skipped: -3, not_interested: -18 };
    if (!Object.prototype.hasOwnProperty.call(weights, event) && event !== 'watch') {
      return res.status(400).json({ error: 'Unsupported feedback event' });
    }
    const post = await Post.findOne({ where: { id: postId, status: 'live', isStory: false, visibility: 'public' } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const blocked = await UserBlock.findOne({ where: { blockerId: post.authorId, blockedUserId: req.user.id } });
    const viewerBlocked = await UserBlock.findOne({ where: { blockerId: req.user.id, blockedUserId: post.authorId } });
    if (blocked || viewerBlocked) return res.status(404).json({ error: 'Post not found' });

    let delta = weights[event] || 0;
    if (event === 'watch') {
      const watchMs = Number(req.body.watchMs);
      const durationMs = Number(req.body.durationMs);
      if (!Number.isFinite(watchMs) || !Number.isFinite(durationMs) || durationMs <= 0 || watchMs < 0) {
        return res.status(400).json({ error: 'watchMs and durationMs must be valid non-negative durations' });
      }
      const completion = Math.max(0, Math.min(1, watchMs / durationMs));
      delta = completion >= 0.9 ? 5 : completion >= 0.5 ? 2 : completion < 0.15 ? -2 : 0;
    }
    const key = `feed:preferences:${req.user.id}`;
    const oldValue = Number(await redis.hget(key, postId).catch(() => 0)) || 0;
    const score = Math.max(-40, Math.min(80, oldValue + delta));
    await redis.hset(key, postId, String(score));
    // The ranked list is cached briefly; invalidate it so feedback takes effect
    // on the viewer's next Discover request.
    await redis.del(`feed:discover:ranked:${req.user.id}`).catch(() => {});
    res.json({ ok: true, event, preferenceScore: score });
  } catch (e) { next(e); }
});

module.exports = router;
