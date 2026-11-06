const router = require('express').Router();
const { Op, User, Post, Follow, UserBlock } = require('../db');
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
    const blocksPromise = UserBlock.findAll({ where: { [Op.or]: [{ blockerId: req.user.id }, { blockedUserId: req.user.id }] }, attributes: ['blockerId', 'blockedUserId'], raw: true });
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
    const [people, posts, blockRows] = await Promise.all([peoplePromise, postsPromise, blocksPromise]);
    const blockedIds = blockRows.map((row) => row.blockerId === req.user.id ? row.blockedUserId : row.blockerId);
    const visiblePeople = people.filter((person) => !blockedIds.includes(person.id));
    const visiblePosts = posts.filter((post) => !blockedIds.includes(post.authorId));
    const following = visiblePeople.length
      ? await Follow.findAll({
          where: { followerId: req.user.id, followeeId: { [Op.in]: visiblePeople.map((person) => person.id) } },
          attributes: ['followeeId'],
          raw: true,
        })
      : [];
    const followingIds = new Set(following.map((row) => row.followeeId));
    res.json({
      people: visiblePeople.map((person) => ({ ...person.toJSON(), isFollowing: followingIds.has(person.id) })),
      posts: visiblePosts.map(toPostDTO),
    });
  } catch (e) { next(e); }
});

module.exports = router;
