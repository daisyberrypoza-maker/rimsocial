const router = require('express').Router();
const { Op, User, Post } = require('../db');
const { requireAuth } = require('../middleware/auth');
const httpError = require('../utils/httpError');
const { toPostDTO } = require('../lib/serialize');

router.use(requireAuth);

// Search is deliberately bounded and only returns public posts.
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().replace(/^#/, '').slice(0, 80);
    const type = String(req.query.type || 'all');
    if (!q) throw httpError(400, 'Enter a name, caption or hashtag to search');
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const people = type === 'posts' || type === 'hashtags' ? [] : await User.findAll({
      where: {
        id: { [Op.ne]: req.user.id },
        [Op.or]: [
          { username: { [Op.like]: like } },
          { displayName: { [Op.like]: like } },
        ],
      },
      attributes: ['id', 'username', 'displayName', 'avatarUrl', 'country', 'followerCount'],
      order: [['followerCount', 'DESC']],
      limit: 20,
    });
    const posts = type === 'people' ? [] : await Post.findAll({
      where: {
        status: 'live', isStory: false, visibility: 'public',
        caption: { [Op.like]: like },
      },
      include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }],
      order: [['createdAt', 'DESC']],
      limit: 30,
    });
    res.json({ people, posts: posts.map(toPostDTO) });
  } catch (e) { next(e); }
});

module.exports = router;
