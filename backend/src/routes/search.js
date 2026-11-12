const router = require('express').Router();
const { Op, User, Post, Follow, UserBlock, AudioTrack } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toPostDTO } = require('../lib/serialize');

router.use(requireAuth);

// Global search for people, public posts, and hashtags. Country never limits results.
router.get('/', async (req, res, next) => {
  try {
    const raw = String(req.query.q || '').trim().slice(0, 80);
    const type = ['all', 'people', 'posts', 'hashtags', 'audio'].includes(req.query.type) ? req.query.type : 'all';
    if (!raw) return res.json({ people: [], posts: [], audio: [] });
    const audioPromise = type === 'all' || type === 'audio' ? AudioTrack.findAll({
      where: { [Op.or]: [{ title: { [Op.like]: `%${raw}%` } }, { artist: { [Op.like]: `%${raw}%` } }] },
      order: [['createdAt', 'DESC']], limit: 30,
    }) : Promise.resolve([]);
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
      order: [['followerCount', 'DESC']], limit: 100,
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
    const [people, posts, blockRows, audio] = await Promise.all([peoplePromise, postsPromise, blocksPromise, audioPromise]);
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
    const postAuthorIds = [...new Set(visiblePosts.map((post) => post.authorId))];
    const followedPostAuthors = postAuthorIds.length
      ? await Follow.findAll({
          where: { followerId: req.user.id, followeeId: { [Op.in]: postAuthorIds } },
          attributes: ['followeeId'],
          raw: true,
        })
      : [];
    const followingIds = new Set([
      ...following.map((row) => row.followeeId),
      ...followedPostAuthors.map((row) => row.followeeId),
    ]);
    const normalizedQuery = raw.replace(/^@/, '').toLowerCase();
    const relevance = (value = '') => {
      const text = String(value || '').toLowerCase();
      if (text === normalizedQuery) return 100;
      if (text.startsWith(normalizedQuery)) return 70;
      if (text.split(/\s+/).some((part) => part.startsWith(normalizedQuery))) return 45;
      return text.includes(normalizedQuery) ? 20 : 0;
    };
    const rankedPeople = visiblePeople.map((person) => ({
      person,
      score: Math.max(relevance(person.username), relevance(person.displayName))
        + (followingIds.has(person.id) ? 18 : 0)
        + Math.log1p(Number(person.followerCount || 0)),
    })).sort((a, b) => b.score - a.score).slice(0, 30);
    const rankedPosts = visiblePosts.map((post) => {
      const dto = toPostDTO(post);
      const captionScore = relevance(post.caption);
      const tagScore = raw.startsWith('#') && post.caption && post.caption.toLowerCase().includes('#' + tag.toLowerCase()) ? 30 : 0;
      const popularity = Math.log1p(Number(dto.likeCount || dto.likesCount || 0));
      const ageHours = Math.max(0, (Date.now() - new Date(post.createdAt).getTime()) / 3600000);
      return { dto, score: captionScore + tagScore + (followingIds.has(post.authorId) ? 14 : 0) + popularity + 8 / (1 + ageHours / 24) };
    }).sort((a, b) => b.score - a.score).map((item) => item.dto);
    res.json({
      people: rankedPeople.map(({ person }) => ({ ...person.toJSON(), isFollowing: followingIds.has(person.id) })),
      posts: rankedPosts,
      audio: audio.map((track) => ({ id: track.id, title: track.title, artist: track.artist, mediaUrl: track.mediaUrl, createdAt: track.createdAt })),
    });
  } catch (e) { next(e); }
});

module.exports = router;
