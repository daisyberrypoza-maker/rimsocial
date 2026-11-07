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
    const [viewer, ownedPosts, incomingFollows, blocks] = await Promise.all([
      User.findByPk(userId, { attributes: ['username'], raw: true }),
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
    const mentionPattern = viewer?.username
      ? new RegExp('(^|[^a-zA-Z0-9_])@' + viewer.username + '(?=$|[^a-zA-Z0-9_])', 'i')
      : null;
    const mentionCandidates = viewer?.username ? await Post.findAll({
      where: {
        authorId: { [Op.ne]: userId },
        status: 'live',
        isStory: false,
        visibility: 'public',
        caption: { [Op.like]: '%' + viewer.username + '%' },
      },
      attributes: ['id', 'authorId', 'caption', 'mediaUrl', 'kind', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 100,
      raw: true,
    }) : [];
    const mentionedPosts = mentionPattern
      ? mentionCandidates.filter((post) => mentionPattern.test(post.caption || '') && !blockedIds.has(String(post.authorId)))
      : [];
    const bellRows = Follow.rawAttributes.notifyPosts
      ? await Follow.findAll({ where: { followerId: userId, notifyPosts: true }, attributes: ['followeeId'], raw: true })
      : [];
    const bellIds = bellRows.map((row) => String(row.followeeId));
    const bellPosts = bellIds.length ? await Post.findAll({
      where: {
        authorId: bellIds,
        status: 'live',
        isStory: false,
        visibility: 'public',
        createdAt: { [Op.gte]: new Date(Date.now() - 14 * 24 * 3600 * 1000) },
      },
      attributes: ['id', 'authorId', 'caption', 'mediaUrl', 'kind', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 50,
      raw: true,
    }) : [];
    if (!postIds.length && !incomingFollows.length && !mentionedPosts.length && !bellPosts.length) return res.json({ items: [] });

    const [likes, comments, reposts] = postIds.length ? await Promise.all([
      PostLike.findAll({ where: { postId: postIds, userId: { [Op.ne]: userId } }, order: [['createdAt', 'DESC']], limit: 100, raw: true }),
      PostComment.findAll({ where: { postId: postIds, userId: { [Op.ne]: userId } }, order: [['createdAt', 'DESC']], limit: 100, raw: true }),
      Repost.findAll({ where: { postId: postIds, userId: { [Op.ne]: userId } }, order: [['createdAt', 'DESC']], limit: 100, raw: true }),
    ]) : [[], [], []];

    const postById = new Map(ownedPosts.map((post) => [String(post.id), post]));
    for (const post of mentionedPosts) postById.set(String(post.id), post);
    for (const post of bellPosts) postById.set(String(post.id), post);
    const actors = new Set([
      ...incomingFollows.map((row) => String(row.followerId)),
      ...mentionedPosts.map((post) => String(post.authorId)),
      ...bellPosts.map((post) => String(post.authorId)),
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
    for (const post of mentionedPosts) push('mention', post.authorId, post.createdAt, post.id);
    for (const post of bellPosts) push('post', post.authorId, post.createdAt, post.id);

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ items: items.slice(0, 100) });
  } catch (error) { next(error); }
});

module.exports = router;
