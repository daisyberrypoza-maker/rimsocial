const router = require('express').Router();
const { Op, User, DirectMessage, Follow, Post, GroupConversation, GroupMember, GroupMessage, ChatPreference, sequelize } = require('../db');
const redis = require('../redis');
const { requireAuth } = require('../middleware/auth');
const { anyFileUpload, chatKindFor } = require('../middleware/upload');
const { blockedUserIds } = require('../lib/blocks');
const cloudinary = require('../services/cloudinary');
const { storyRingsFor } = require('../services/stories');
const httpError = require('../utils/httpError');

router.use(requireAuth);

const PUBLIC_USER = ['id', 'username', 'displayName', 'avatarUrl'];
// A RimSocial post link: any URL with /p/<post id> (web app uses #/p/<id>)
const POST_LINK = /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDIT_WINDOW_MS = 15 * 60 * 1000;            // edit your own message for 15 minutes
const DELETE_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000; // delete for everyone for 48 hours
const TYPING_TTL_SECONDS = 6;

// ---- helpers -------------------------------------------------------------

// Checks the recipient exists and that neither side has blocked the other
async function assertCanMessage(me, other) {
  if (other === me) throw httpError(400, 'You cannot message yourself');
  const target = await User.findByPk(other, { attributes: ['id'], raw: true });
  if (!target) throw httpError(404, 'Account not found');
  if ((await blockedUserIds(me)).has(String(other))) throw httpError(403, 'You cannot message this account');
}

function hiddenIds(row) {
  try { return Array.isArray(JSON.parse(row.hiddenFor)) ? JSON.parse(row.hiddenFor).map(String) : []; } catch { return []; }
}
const isHiddenFor = (row, me) => hiddenIds(row).includes(String(me));

// The message must be part of a conversation I am in and not deleted just for me
async function findVisibleMessage(me, id) {
  if (!UUID.test(String(id))) throw httpError(404, 'Message not found');
  const row = await DirectMessage.findByPk(id);
  if (!row || (String(row.senderId) !== me && String(row.recipientId) !== me) || isHiddenFor(row, me)) {
    throw httpError(404, 'Message not found');
  }
  return row;
}

// If the text links to a live RimSocial post, remember it so the chat can show a preview card
async function linkedPostId(text) {
  const match = String(text || '').match(POST_LINK);
  if (!match) return null;
  const post = await Post.findOne({ where: { id: match[1], status: 'live' }, attributes: ['id'], raw: true });
  return post ? post.id : null;
}

// Reply target must be a message in the same conversation
async function validReplyTarget(me, other, replyToId) {
  if (!replyToId) return null;
  if (!UUID.test(String(replyToId))) throw httpError(400, 'That message is no longer available');
  const row = await DirectMessage.findByPk(replyToId, { attributes: ['id', 'senderId', 'recipientId'], raw: true });
  const inConversation = row && [[me, other], [other, me]].some(([a, b]) => String(row.senderId) === a && String(row.recipientId) === b);
  if (!inConversation) throw httpError(400, 'That message is no longer available');
  return row.id;
}

async function createMessage({ me, other, body = '', mediaUrl = null, mediaKind = null, mediaName = null, replyToId = null, forwarded = false }) {
  const postId = await linkedPostId(body);
  return DirectMessage.create({ senderId: me, recipientId: other, body, mediaUrl, mediaKind, mediaName, postId, replyToId, forwarded });
}

// Hide the content of messages deleted for everyone, so nothing of them is sent to the app
function sanitize(row) {
  if (!row.deletedForEveryone) return row;
  return { ...row, body: '', mediaUrl: null, mediaKind: null, mediaName: null, postId: null };
}

// Delivered: the recipient's app has fetched the message. Runs for every incoming message not yet delivered.
async function markDelivered(me) {
  await DirectMessage.update({ deliveredAt: new Date() }, { where: { recipientId: me, deliveredAt: null } }).catch(() => {});
}

// Attach a small quote for each reply (or null when the original is gone)
async function withReplyPreviews(rows) {
  const ids = [...new Set(rows.map((row) => row.replyToId).filter(Boolean).map(String))];
  if (!ids.length) return rows;
  const originals = await DirectMessage.findAll({ where: { id: ids }, raw: true });
  const byId = new Map(originals.map((row) => {
    const clean = sanitize(row);
    return [String(row.id), {
      id: row.id,
      senderId: row.senderId,
      body: clean.body,
      mediaKind: clean.mediaKind || null,
      deletedForEveryone: Boolean(row.deletedForEveryone),
    }];
  }));
  return rows.map((row) => (row.replyToId ? { ...row, replyTo: byId.get(String(row.replyToId)) || null } : row));
}

// Attach a small preview (media, caption, author) to every message that links to a post.
// Removed posts and posts by blocked accounts come back as null, so the chat can say they are unavailable.
function linkedPostOf(row) {
  if (row.deletedForEveryone) return null;
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



async function preferenceFor(userId, fields) {
  return ChatPreference.findOne({ where: { userId, ...fields } });
}
async function setPreference(userId, fields, patch) {
  const [row] = await ChatPreference.findOrCreate({ where: { userId, ...fields }, defaults: { ...fields, ...patch } });
  if (row) await row.update(patch);
  return row;
}

// ---- group conversations --------------------------------------------------

// Return groups for the signed-in user, including participants and latest message.
router.get('/groups', async (req, res, next) => {
  try {
    const memberships = await GroupMember.findAll({ where: { userId: req.user.id }, attributes: ['groupId'], raw: true });
    const ids = memberships.map((row) => row.groupId);
    const groupPrefs = await ChatPreference.findAll({ where: { userId: req.user.id, groupId: ids }, raw: true });
    const groupPrefById = new Map(groupPrefs.map((row) => [String(row.groupId), row]));
    if (!ids.length) return res.json({ items: [] });
    const groups = await GroupConversation.findAll({ where: { id: ids }, order: [['updatedAt', 'DESC']] });
    const members = await GroupMember.findAll({ where: { groupId: ids }, raw: true });
    const userIds = [...new Set(members.map((row) => String(row.userId)))];
    const users = userIds.length ? await User.findAll({ where: { id: userIds }, attributes: PUBLIC_USER, raw: true }) : [];
    const userById = new Map(users.map((user) => [String(user.id), user]));
    const messages = await GroupMessage.findAll({ where: { groupId: ids }, order: [['createdAt', 'DESC']], limit: Math.max(ids.length * 3, 100), raw: true });
    const latest = new Map();
    for (const message of messages) if (!latest.has(String(message.groupId))) latest.set(String(message.groupId), message);
    res.json({ items: groups.map((group) => ({
      id: group.id,
      name: group.name,
      members: members.filter((member) => String(member.groupId) === String(group.id)).map((member) => userById.get(String(member.userId))).filter(Boolean),
      lastMessage: latest.get(String(group.id)) || null,
      muted: Boolean(groupPrefById.get(String(group.id))?.muted),
    })) });
  } catch (error) { next(error); }
});

// Create a group. The creator is automatically an admin and a member.
router.post('/groups', async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const me = String(req.user.id);
    const requested = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [];
    const memberIds = [...new Set(requested)].filter((id) => id !== me);
    if (memberIds.length < 2) throw httpError(400, 'Choose at least two people to create a group');
    if (memberIds.length > 199) throw httpError(400, 'A group can have at most 200 members');
    const users = await User.findAll({ where: { id: memberIds }, attributes: PUBLIC_USER, raw: true, transaction });
    if (users.length !== memberIds.length) throw httpError(404, 'One or more selected accounts could not be found');
    const blocked = await blockedUserIds(me);
    if (memberIds.some((id) => blocked.has(id))) throw httpError(403, 'Remove blocked accounts before creating this group');
    const suppliedName = String(req.body?.name || '').trim().slice(0, 80);
    const defaultName = users.slice(0, 3).map((user) => user.displayName || user.username).join(', ') + (users.length > 3 ? ' +' + (users.length - 3) : '');
    const name = suppliedName || defaultName;
    const group = await GroupConversation.create({ name, createdById: me }, { transaction });
    await GroupMember.bulkCreate([
      { groupId: group.id, userId: me, isAdmin: true },
      ...memberIds.map((userId) => ({ groupId: group.id, userId, isAdmin: false })),
    ], { transaction });
    await transaction.commit();
    const creator = await User.findByPk(me, { attributes: PUBLIC_USER, raw: true });
    res.status(201).json({ group: { id: group.id, name, members: [creator, ...users] } });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

// Load a group and its recent messages; membership is required.
router.get('/groups/:groupId', async (req, res, next) => {
  try {
    const membership = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id }, raw: true });
    if (!membership) throw httpError(404, 'Group not found');
    const group = await GroupConversation.findByPk(req.params.groupId);
    if (!group) throw httpError(404, 'Group not found');
    const members = await GroupMember.findAll({ where: { groupId: group.id }, raw: true });
    const users = await User.findAll({ where: { id: members.map((member) => member.userId) }, attributes: PUBLIC_USER, raw: true });
    const items = await GroupMessage.findAll({ where: { groupId: group.id }, order: [['createdAt', 'DESC']], limit: 300, raw: true });
    res.json({ group: { id: group.id, name: group.name, members: users }, items: items.reverse() });
  } catch (error) { next(error); }
});

// Send a group text message to every current member.
router.post('/groups/:groupId/messages', async (req, res, next) => {
  try {
    const membership = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id }, raw: true });
    if (!membership) throw httpError(404, 'Group not found');
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    if (!body) throw httpError(400, 'Type a message first');
    const message = await GroupMessage.create({ groupId: req.params.groupId, senderId: req.user.id, body });
    await GroupConversation.update({ updatedAt: new Date() }, { where: { id: req.params.groupId } });
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

// ---- chat list ------------------------------------------------------------

// Chat list: one row per person, newest conversation first, with unread counts.
router.get('/conversations', async (req, res, next) => {
  try {
    const me = req.user.id;
    await markDelivered(me);
    const blocked = await blockedUserIds(me);
    const prefs = await ChatPreference.findAll({ where: { userId: me, peerId: { [Op.ne]: null } }, raw: true });
    const prefByPeer = new Map(prefs.map((row) => [String(row.peerId), row]));
    const rows = await DirectMessage.findAll({
      where: { [Op.or]: [{ senderId: me }, { recipientId: me }] },
      order: [['createdAt', 'DESC']],
      limit: 1000,
      raw: true,
    });
    const byPartner = new Map();
    for (const row of rows) {
      if (isHiddenFor(row, me)) continue;
      const partner = String(row.senderId === me ? row.recipientId : row.senderId);
      if (prefByPeer.get(partner)?.hidden) continue;
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
    const rings = await storyRingsFor(me, partners);
    const online = await Promise.all(partners.map((id) => redis.get('presence:' + id).then(Boolean).catch(() => false)));
    const onlineIds = new Set(partners.filter((_, i) => online[i]));
    const items = [...byPartner.entries()]
      .filter(([partner]) => userById.has(partner))
      .map(([partner, entry]) => {
        const last = sanitize(entry.last);
        return {
          user: userById.get(partner),
          group: following.has(partner) ? 'primary' : (!replied.has(partner) && String(entry.last.senderId) !== me ? 'requests' : 'general'),
          hasStory: storyAuthors.has(partner),
          storyRing: rings.get(partner) || null,
          isOnline: onlineIds.has(partner),
          lastMessage: {
            body: last.body,
            mediaKind: last.mediaKind || null,
            senderId: entry.last.senderId,
            createdAt: entry.last.createdAt,
            deleted: Boolean(entry.last.deletedForEveryone),
            readAt: entry.last.readAt,
            deliveredAt: entry.last.deliveredAt,
          },
          unread: entry.unread,
          muted: Boolean(prefByPeer.get(partner)?.muted),
        };
      });
    res.json({ items });
  } catch (error) { next(error); }
});

// Total unread messages for the Chat tab badge.
router.get('/unread-count', async (req, res, next) => {
  try {
    const me = req.user.id;
    await markDelivered(me);
    const blocked = await blockedUserIds(me);
    const rows = await DirectMessage.findAll({ where: { recipientId: me, readAt: null }, attributes: ['senderId', 'hiddenFor'], raw: true, limit: 5000 });
    res.json({ count: rows.filter((row) => !blocked.has(String(row.senderId)) && !isHiddenFor(row, me)).length });
  } catch (error) { next(error); }
});


/* Per-user direct-chat controls. Deleting a conversation only removes it from this inbox. */
router.get('/direct/:userId/preferences', async (req, res, next) => {
  try {
    const row = await preferenceFor(req.user.id, { peerId: req.params.userId });
    res.json({ muted: Boolean(row?.muted) });
  } catch (error) { next(error); }
});
router.put('/direct/:userId/mute', async (req, res, next) => {
  try {
    if (String(req.params.userId) === String(req.user.id)) throw httpError(400, 'Invalid conversation');
    const target = await User.findByPk(req.params.userId, { attributes: ['id'] });
    if (!target) throw httpError(404, 'Account not found');
    const enabled = Boolean(req.body?.enabled);
    await setPreference(req.user.id, { peerId: req.params.userId }, { muted: enabled });
    res.json({ muted: enabled });
  } catch (error) { next(error); }
});
router.delete('/direct/:userId', async (req, res, next) => {
  try {
    if (String(req.params.userId) === String(req.user.id)) throw httpError(400, 'Invalid conversation');
    const target = await User.findByPk(req.params.userId, { attributes: ['id'] });
    if (!target) throw httpError(404, 'Account not found');
    await setPreference(req.user.id, { peerId: req.params.userId }, { hidden: true });
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

/* Group controls: mute is private; leave removes only this member. */
router.put('/groups/:groupId/mute', async (req, res, next) => {
  try {
    const member = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id } });
    if (!member) throw httpError(404, 'Group not found');
    const enabled = Boolean(req.body?.enabled);
    await setPreference(req.user.id, { groupId: req.params.groupId }, { muted: enabled });
    res.json({ muted: enabled });
  } catch (error) { next(error); }
});
router.delete('/groups/:groupId', async (req, res, next) => {
  try {
    const member = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id } });
    if (!member) throw httpError(404, 'Group not found');
    await member.destroy();
    await ChatPreference.destroy({ where: { userId: req.user.id, groupId: req.params.groupId } });
    res.json({ left: true });
  } catch (error) { next(error); }
});

/* Shared activity: actual media and post links exchanged in this direct conversation. */
router.get('/with/:userId/shared', async (req, res, next) => {
  try {
    const me = String(req.user.id), other = String(req.params.userId);
    if ((await blockedUserIds(me)).has(other)) throw httpError(404, 'Conversation not found');
    const rows = await DirectMessage.findAll({
      where: { [Op.and]: [
        { [Op.or]: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }] },
        { [Op.or]: [
          { mediaUrl: { [Op.ne]: null } },
          { postId: { [Op.ne]: null } },
          { body: { [Op.like]: '%/p/%' } },
        ] },
      ] },
      order: [['createdAt', 'DESC']],
      limit: 100,
      raw: true,
    });
    const visible = rows.filter((row) => !isHiddenFor(row, me)).map(sanitize);
    const items = await withPostPreviews(visible, me);
    res.json({ items });
  } catch (error) { next(error); }
});

// ---- conversation -------------------------------------------------------------

// Conversation with one person, oldest first. Also marks their messages as delivered, and says whether they are typing.
router.get('/with/:userId', async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    if (other === me) return res.json({ items: [], typing: false });
    if ((await blockedUserIds(me)).has(String(other))) return res.status(404).json({ error: 'Account not found' });
    await DirectMessage.update({ deliveredAt: new Date() }, { where: { senderId: other, recipientId: me, deliveredAt: null } }).catch(() => {});
    const rows = await DirectMessage.findAll({
      where: { [Op.or]: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }] },
      order: [['createdAt', 'DESC']],
      limit: 200,
      raw: true,
    });
    const visible = rows.filter((row) => !isHiddenFor(row, me)).reverse().map(sanitize);
    const withReplies = await withReplyPreviews(visible);
    const items = await withPostPreviews(withReplies, me);
    const typing = await redis.get(`typing:${other}:${me}`).then(Boolean).catch(() => false);
    res.json({ items, typing });
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
    const online = await redis.get('presence:' + other).then(Boolean).catch(() => false);
    res.json({ user, online });
  } catch (error) { next(error); }
});

// I am typing to this person. Lasts a few seconds unless I keep typing.
router.post('/with/:userId/typing', async (req, res, next) => {
  try {
    await redis.set(`typing:${req.user.id}:${req.params.userId}`, '1', 'EX', TYPING_TTL_SECONDS).catch(() => {});
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// Send a text message to one person. Optional replyToId quotes another message in this chat.
router.post('/with/:userId', async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    const storyId = req.body?.storyId ? String(req.body.storyId) : null;
    if (!body && !storyId) return res.status(400).json({ error: 'Type a message first' });
    await assertCanMessage(me, other);
    const replyToId = await validReplyTarget(me, other, req.body?.replyToId);
    // A reply to a story sends the story's photo or video with the comment
    let media = {};
    if (storyId) {
      const story = await Post.findOne({
        where: { id: storyId, isStory: true, authorId: other, status: 'live', expiresAt: { [Op.gt]: new Date() } },
        attributes: ['mediaUrl', 'kind'],
      });
      if (!story) throw httpError(404, 'This story has expired');
      media = { mediaUrl: story.mediaUrl, mediaKind: story.kind === 'video' ? 'video' : 'photo' };
    }
    const message = await createMessage({ me, other, body, replyToId, ...media });
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

// Send any file to one person (photo, video, audio or document), with an optional caption and reply.
router.post('/with/:userId/media', anyFileUpload.single('media'), async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    if (!req.file) throw httpError(400, 'Choose a file to send');
    await assertCanMessage(me, other);
    const replyToId = await validReplyTarget(me, other, req.body?.replyToId);
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/messages', { resourceType: 'auto' });
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    const fileName = String(req.file.originalname || 'File').slice(0, 255);
    const message = await createMessage({ me, other, body, mediaUrl: asset.url, mediaKind: chatKindFor(req.file.mimetype), mediaName: fileName, replyToId });
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

// Mark everything another person sent to you as read (seen).
router.post('/with/:userId/read', async (req, res, next) => {
  try {
    await DirectMessage.update({ readAt: new Date(), deliveredAt: new Date() }, { where: { senderId: req.params.userId, recipientId: req.user.id, readAt: null } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ---- message actions ----------------------------------------------------------

// Edit my own text message within 15 minutes.
router.patch('/message/:id', async (req, res, next) => {
  try {
    const me = req.user.id;
    const row = await findVisibleMessage(me, req.params.id);
    if (String(row.senderId) !== me) throw httpError(403, 'You can only edit your own messages');
    if (row.deletedForEveryone) throw httpError(400, 'This message was deleted');
    if (Date.now() - new Date(row.createdAt).getTime() > EDIT_WINDOW_MS) throw httpError(400, 'You can only edit a message within 15 minutes');
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    if (!body) throw httpError(400, 'Type a message first');
    await row.update({ body, editedAt: new Date(), postId: await linkedPostId(body) });
    res.json({ message: row.toJSON() });
  } catch (error) { next(error); }
});

// Delete a message. scope=me hides it only for me. scope=everyone removes it for both people (my own messages, within 48 hours).
router.delete('/message/:id', async (req, res, next) => {
  try {
    const me = req.user.id;
    const row = await findVisibleMessage(me, req.params.id);
    if (req.query.scope === 'everyone') {
      if (String(row.senderId) !== me) throw httpError(403, 'You can only delete your own messages for everyone');
      if (Date.now() - new Date(row.createdAt).getTime() > DELETE_EVERYONE_WINDOW_MS) throw httpError(400, 'You can only delete for everyone within 48 hours');
      await row.update({ deletedForEveryone: true, body: '', mediaUrl: null, mediaKind: null, mediaName: null, postId: null });
    } else {
      await row.update({ hiddenFor: JSON.stringify([...new Set([...hiddenIds(row), String(me)])]) });
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// Forward a message to another person as a new message (marked as forwarded).
router.post('/message/:id/forward', async (req, res, next) => {
  try {
    const me = req.user.id;
    const row = await findVisibleMessage(me, req.params.id);
    if (row.deletedForEveryone) throw httpError(400, 'This message was deleted');
    const toUserId = String(req.body?.toUserId || '');
    await assertCanMessage(me, toUserId);
    const message = await createMessage({
      me,
      other: toUserId,
      body: row.body || '',
      mediaUrl: row.mediaUrl,
      mediaKind: row.mediaKind,
      mediaName: row.mediaName,
      forwarded: true,
    });
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

module.exports = router;
