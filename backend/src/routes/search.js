const router = require('express').Router();
const { Op, User, Post } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toPostDTO } = require('../lib/serialize');

router.use(requireAuth);

// Global search for people, public posts, and hashtags. Country never limits results.
router.get('/', async (req, res, next) => {
  try {
    const raw = String(req.query.q || '').trim().slice(0, 80);
    const type = ['all', 'people', 'posts', 'hashtags'].includes(req.query.type) ? req.query.type : 'all';
    if (!raw) return res.json({ people: [], posts: [] });
    const tag = raw.replace(/^#/, '').replace(/[^a-zA-Z0-9_]/g, '');
    const peoplePromise = type === 'posts' || type === 'hashtags' ? Promise.resolve([]) : User.findAll({
      where: {
        id: { [Op.ne]: req.user.id },
        [Op.or]: [
          { username: { [Op.like]: `%${raw.replace(/^@/, '')}%` } },
          { displayName: { [Op.like]: `%${raw}%` } },
        ],
      },
      attributes: ['id', 'username', 'displayName', 'avatarUrl', 'country', 'followerCount'],
      order: [['followerCount', 'DESC']], limit: 30,
    });
    const postNeedle = type === 'hashtags' ? `%#${tag}%` : `%${raw}%`;
    const postsPromise = type === 'people' ? Promise.resolve([]) : Post.findAll({
      where: {
        status: 'live', isStory: false, visibility: 'public',
        caption: { [Op.like]: postNeedle },
      },
      include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }],
      order: [['createdAt', 'DESC']], limit: 40,
    });
    const [people, posts] = await Promise.all([peoplePromise, postsPromise]);
    res.json({ people, posts: posts.map(toPostDTO) });
  } catch (e) { next(e); }
});

module.exports = router;
