const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const feed = require('../services/feed');

// GET /v1/feed/discover?cursor=...&limit=10
router.get('/discover', requireAuth, async (req, res, next) => {
  try {
    res.json(await feed.getDiscoverPage({
      country: req.user.country, cursor: req.query.cursor, limit: req.query.limit,
    }));
  } catch (e) { next(e); }
});

// GET /v1/feed/following?cursor=...&limit=10
router.get('/following', requireAuth, async (req, res, next) => {
  try {
    res.json(await feed.getFollowingPage({
      userId: req.user.id, cursor: req.query.cursor, limit: req.query.limit,
    }));
  } catch (e) { next(e); }
});

module.exports = router;
