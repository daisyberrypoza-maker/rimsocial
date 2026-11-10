const router = require('express').Router();
const { Op, User, DirectMessage, Follow, Post } = require('../db');
const redis = require('../redis');
const { requireAuth } = require('../middleware/auth');
const { anyFileUpload, chatKindFor } = require('../middleware/upload');
const { blockedUserIds } = require('../lib/blocks');
const cloudinary = require('../services/cloudinary');
const httpError = require('../utils/httpError');

router.use(requireAuth);

const PUBLIC_USER = ['id', 'username', 'displayName', 'avatarUrl'];
// A RimSocial post link: any URL with /p/<post id> (web app uses #/p/<id>)
const POST_LINK = /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// Checks the recipient exists and that neither side has blocked the other
async function assertCanMessage(me, other) {
  if (other === me) throw httpError(400, 'You cannot message yourself');
  const target = await User.findByPk(other, { attributes: ['id'], raw: true });
  if (!target) throw httpError(404, 'Account not found');
  if ((await blockedUserIds(me)).has(String(other))) throw httpError(403, 'You cannot message this account');
}

// If the text links to a live RimSocial post, remember it so the chat can show a preview card
async function linkedPostId(text) {
  const match = String(text || '').match(POST_LINK);
  if (!match) return null;
  const post = await Post.findOne({ where: { id: match[1], status: 'live' }, attributes: ['id'], raw: true });
  return post ? post.id : null;
}

async function createMessage({ me, other, body = '', mediaUrl = null, mediaKind = null, mediaName = null }) {
  const postId = await linkedPostId(body);
  return DirectMessage.create({ senderId: me, recipientId: other, body, mediaUrl, mediaKind, mediaName, postId });
}

// Attach a small preview (media, caption, author) to every message that links to a post.
// Removed posts and posts by blocked accounts come back as null, so the chat can say they are unavailable.
// Older messages have no stored post id, so the link in the text is read here as well.
function linkedPostOf(row) {
  if (row.postId) return String(row.postId);
  const match = String(row.body || '').match(POST_LINK);
  return match ? match[1] : null;
}

async function withPostPreviews(rows, me) {
  const ids = [...new Set(rows.map(linkedPostOf).filter(Boolean))];
  if (!ids.length) return rows;
  const posts = await Post.findAll({
    where: { id: ids, status: 'live' },
    attributes: ['id', 'kind', 'mediaUrl', 'thumbUrl', 'caption', 'authorId'],
    raw: true,
  });
  const authorIds = [...new Set(posts.map((post) => String(post.authorId)))];
  const authors = authorIds.length ? await User.findAll({ where: { id: authorIds }, attributes: ['id', 'username', 'displayName'], raw: true }) : [];
  const authorById = new Map(authors.map((author) => [String(author.id), author]));
  const blocked = await blockedUserIds(me);
  const previewById = new Map();
  for (const post of posts) {
    const author = authorById.get(String(post.authorId));
    if (!author || blocked.has(String(post.authorId))) continue;
    previewById.set(String(post.id), {
      id: post.id,
      kind: post.kind,
      mediaUrl: post.mediaUrl,
      thumbUrl: post.thumbUrl,
      caption: post.caption || '',
      author: { username: author.username, displayName: author.displayName },
    });
  }
  return rows.map((row) => {
    const id = linkedPostOf(row);
    return id ? { ...row, post: previewById.get(id) || null } : row;
  });
}

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
    const following = partners.length ? new Set((await Follow.findAll({ where: { followerId: me, followeeId: partners }, attributes: ['followeeId'], raw: true })).map((r) => String(r.followeeId))) : new Set();
    const replied = new Set(rows.filter((r) => String(r.senderId) === me).map((r) => String(r.recipientId)));
    const storyAuthors = partners.length ? new Set((await Post.findAll({ where: { authorId: partners, isStory: true, status: 'live', expiresAt: { [Op.gt]: new Date() } }, attributes: ['authorId'], raw: true })).map((r) => String(r.authorId))) : new Set();
    const online = await Promise.all(partners.map((id) => redis.get('presence:' + id).then(Boolean).catch(() => false)));
    const onlineIds = new Set(partners.filter((_, i) => online[i]));
    const items = [...byPartner.entries()]
      .filter(([partner]) => userById.has(partner))
      .map(([partner, entry]) => ({
        user: userById.get(partner),
        group: following.has(partner) ? 'primary' : (!replied.has(partner) && String(entry.last.senderId) !== me ? 'requests' : 'general'),
        hasStory: storyAuthors.has(partner),
        isOnline: onlineIds.has(partner),
        lastMessage: { body: entry.last.body, mediaKind: entry.last.mediaKind || null, senderId: entry.last.senderId, createdAt: entry.last.createdAt },
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
    const items = await withPostPreviews(rows.reverse(), me);
    res.json({ items });
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

// Send a text message to one person (a RimSocial post link in the text shows as a preview card).
router.post('/with/:userId', async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    if (!body) return res.status(400).json({ error: 'Type a message first' });
    await assertCanMessage(me, other);
    const message = await createMessage({ me, other, body });
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

// Send any file to one person (photo, video, audio or document), with an optional caption.
router.post('/with/:userId/media', anyFileUpload.single('media'), async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    if (!req.file) throw httpError(400, 'Choose a file to send');
    await assertCanMessage(me, other);
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/messages', { resourceType: 'auto' });
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    const fileName = String(req.file.originalname || 'File').slice(0, 255);
    const message = await createMessage({ me, other, body, mediaUrl: asset.url, mediaKind: chatKindFor(req.file.mimetype), mediaName: fileName });
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
