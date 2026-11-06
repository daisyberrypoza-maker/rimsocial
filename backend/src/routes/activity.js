const router = require('express').Router();
const { Op } = require('sequelize');
const { User, Post, PostLike, PostComment, Repost, Follow, UserBlock } = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Activity is assembled from existing social records. This is intentionally additive:
// it does not rewrite or duplicate likes, comments, reposts, or follows.
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [ownedPosts, incomingFollows, blocks] = await Promise.all([
      Post.findAll({
        where: { authorId: userId, status: 'live', isStory: false },
        attributes: ['id', 'caption', 'mediaUrl', 'kind', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit: 500,
        raw: true,
      }),
      Follow.findAll({ where: { followeeId: userId }, order: [['createdAt', 'DESC']], limit: 100, raw: true }),
      UserBlock.findAll({
        where: { [Op.or]: [{ blockerId: userId }, { blockedUserId: userId }] },
        attributes: ['blockerId', 'blockedUserId'],
        raw: true,
      }),
    ]);
    const blockedIds = new Set(blocks.map((row) => row.blockerId === userId ? row.blockedUserId : row.blockerId));
    const postIds = ownedPosts.map((post) => post.id);
    if (!postIds.length && !incomingFollows.length) return res.json({ items: [] });

    const [likes, comments, reposts] = postIds.length ? await Promise.all([
      PostLike.findAll({ where: { postId: postIds, userId: { [Op.ne]: userId } }, order: [['createdAt', 'DESC']], limit: 100, raw: true }),
      PostComment.findAll({ where: { postId: postIds, userId: { [Op.ne]: userId } }, order: [['createdAt', 'DESC']], limit: 100, raw: true }),
      Repost.findAll({ where: { postId: postIds, userId: { [Op.ne]: userId } }, order: [['createdAt', 'DESC']], limit: 100, raw: true }),
    ]) : [[], [], []];

    const postById = new Map(ownedPosts.map((post) => [String(post.id), post]));
    const actors = new Set([
      ...incomingFollows.map((row) => String(row.followerId)),
      ...likes.map((row) => String(row.userId)),
      ...comments.map((row) => String(row.userId)),
      ...reposts.map((row) => String(row.userId)),
    ]);
    for (const id of blockedIds) actors.delete(String(id));
    const users = actors.size ? await User.findAll({
      where: { id: [...actors] },
      attributes: ['id', 'username', 'displayName', 'avatarUrl'],
      raw: true,
    }) : [];
    const userById = new Map(users.map((person) => [String(person.id), person]));
    const items = [];

    function push(type, actorId, createdAt, postId, comment) {
      const actor = userById.get(String(actorId));
      if (!actor || blockedIds.has(String(actorId))) return;
      const post = postId ? postById.get(String(postId)) : null;
      items.push({
        id: [type, actorId, postId || 'profile', createdAt].join(':'),
        type,
        actor,
        post: post ? { id: post.id, caption: post.caption || '', mediaUrl: post.mediaUrl, kind: post.kind } : null,
        comment: comment || null,
        createdAt,
      });
    }

    for (const row of incomingFollows) push('follow', row.followerId, row.createdAt, null);
    for (const row of likes) push('like', row.userId, row.createdAt, row.postId);
    for (const row of comments) push('comment', row.userId, row.createdAt, row.postId, row.body);
    for (const row of reposts) push('repost', row.userId, row.createdAt, row.postId);

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ items: items.slice(0, 100) });
  } catch (error) { next(error); }
});

module.exports = router;
