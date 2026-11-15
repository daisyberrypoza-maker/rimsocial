const { Op, fn, col } = require('sequelize');
const { User, Post } = require('../db');

// Creator earnings programme rules. Earnings still accrue for everyone; withdrawals need eligibility.
// Change these numbers here only.
const RULES = {
  followers: 1000,        // followers now
  publicPosts30d: 10,     // public posts published in the last 30 days
  views30d: 5000,         // views on those posts (last 30 days)
};
const WINDOW_MS = 30 * 24 * 3600 * 1000;

async function eligibilityFor(userId) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [user, recent] = await Promise.all([
    User.findByPk(userId, { attributes: ['followerCount'], raw: true }),
    Post.findAll({
      where: { authorId: userId, isStory: false, status: 'live', visibility: 'public', createdAt: { [Op.gte]: since } },
      attributes: ['viewCount'], raw: true,
    }),
  ]);
  const followers = Number(user?.followerCount || 0);
  const posts = recent.length;
  const views = recent.reduce((sum, p) => sum + Number(p.viewCount || 0), 0);
  const checks = [
    { key: 'followers', label: `${RULES.followers.toLocaleString()} followers`, required: RULES.followers, current: followers, met: followers >= RULES.followers },
    { key: 'posts', label: `${RULES.publicPosts30d} public posts in 30 days`, required: RULES.publicPosts30d, current: posts, met: posts >= RULES.publicPosts30d },
    { key: 'views', label: `${RULES.views30d.toLocaleString()} views in 30 days`, required: RULES.views30d, current: views, met: views >= RULES.views30d },
  ];
  return { eligible: checks.every((c) => c.met), checks };
}

module.exports = { eligibilityFor, RULES };
