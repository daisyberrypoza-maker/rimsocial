const router = require('express').Router();
const { Op, User, DirectMessage, Follow, Post } = require('../db');
const redis = require('../redis');
const { requireAuth } = require('../middleware/auth');
const { blockedUserIds } = require('../lib/blocks');

router.use(requireAuth);

const PUBLIC_USER = ['id', 'username', 'displayName', 'avatarUrl'];

// Chat list: one row per person, newest conversation first, with unread counts.
router.get('/conversations', async (req, res, next) => {
  try {
    const me = req.user.id;
    const blocked = await blockedUserIds(me);
    const rows = await DirectMessage.findAll({
      where: { [Op.or]: [{ senderId: me }, { recipientId: me }] },
      order: [['createdAt', 'DESC']],
      limit: 1000,
      raw: true,
    });
    const byPartner = new Map();
    for (const row of rows) {
      const partner = String(row.senderId === me ? row.recipientId : row.senderId);
      if (blocked.has(partner)) continue;
      if (!byPartner.has(partner)) byPartner.set(partner, { last: row, unread: 0 });
      if (String(row.recipientId) === me && !row.readAt) byPartner.get(partner).unread += 1;
    }
    const partners = [...byPartner.keys()];
    const users = partners.length ? await User.findAll({ where: { id: partners }, attributes: PUBLIC_USER, raw: true }) : [];
    const userById = new Map(users.map((u) => [String(u.id), u]));
    // Inbox groups like Instagram: Primary = people you follow, Requests = wrote to you and you never replied, General = the rest
    const following = partners.length ? new Set((await Follow.findAll({ where: { followerId: me, followeeId: partners }, attributes: [followeeId], raw: true })).map((r) => String(r.followeeId))) : new Set();
    const replied = new Set(rows.filter((r) => String(r.senderId) === me).map((r) => String(r.recipientId)));
    const storyAuthors = partners.length ? new Set((await Post.findAll({ where: { authorId: partners, isStory: true, status: live, expiresAt: { [Op.gt]: new Date() } }, attributes: [authorId], raw: true })).map((r) => String(r.authorId))) : new Set();
    const online = await Promise.all(partners.map((id) => redis.get('presence:' + id).then(Boolean).catch(() => false)));
    const onlineIds = new Set(partners.filter((_, i) => online[i]));
    const items = [...byPartner.entries()]
      .filter(([partner]) => userById.has(partner))
      .map(([partner, entry]) => ({
        user: userById.get(partner),
        group: following.has(partner) ? 'primary' : (!replied.has(partner) && String(entry.last.senderId) !== me ? 'requests' : 'general'),
        hasStory: storyAuthors.has(partner),
        isOnline: onlineIds.has(partner),
        lastMessage: { body: entry.last.body, senderId: entry.last.senderId, createdAt: entry.last.createdAt },
        unread: entry.unread,
      }));
    res.json({ items });
  } catch (error) { next(error); }
});

// Total unread messages for the Chat tab badge.
router.get('/unread-count', async (req, res, next) => {
  try {
    const me = req.user.id;
    const blocked = await blockedUserIds(me);
    const rows = await DirectMessage.findAll({ where: { recipientId: me, readAt: null }, attributes: ['senderId'], raw: true, limit: 5000 });
    res.json({ count: rows.filter((row) => !blocked.has(String(row.senderId))).length });
  } catch (error) { next(error); }
});

// Conversation with one person, oldest first.
router.get('/with/:userId', async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    if (other === me) return res.json({ items: [] });
    if ((await blockedUserIds(me)).has(String(other))) return res.status(404).json({ error: 'Account not found' });
    const rows = await DirectMessage.findAll({
      where: { [Op.or]: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }] },
      order: [['createdAt', 'DESC']],
      limit: 200,
      raw: true,
    });
    res.json({ items: rows.reverse() });
  } catch (error) { next(error); }
});

// Public details of the person being messaged (for the conversation header).
router.get('/with/:userId/info', async (req, res, next) => {
  try {
    const other = req.params.userId;
    if (other === req.user.id) return res.status(400).json({ error: 'Choose someone else' });
    if ((await blockedUserIds(req.user.id)).has(String(other))) return res.status(404).json({ error: 'Account not found' });
    const user = await User.findByPk(other, { attributes: PUBLIC_USER, raw: true });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    res.json({ user });
  } catch (error) { next(error); }
});

// Send a message to one person.
router.post('/with/:userId', async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    if (!body) return res.status(400).json({ error: 'Type a message first' });
    if (other === me) return res.status(400).json({ error: 'You cannot message yourself' });
    const target = await User.findByPk(other, { attributes: ['id'], raw: true });
    if (!target) return res.status(404).json({ error: 'Account not found' });
    if ((await blockedUserIds(me)).has(String(other))) return res.status(403).json({ error: 'You cannot message this account' });
    const message = await DirectMessage.create({ senderId: me, recipientId: other, body });
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

// Mark everything another person sent to you as read.
router.post('/with/:userId/read', async (req, res, next) => {
  try {
    await DirectMessage.update({ readAt: new Date() }, { where: { senderId: req.params.userId, recipientId: req.user.id, readAt: null } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
