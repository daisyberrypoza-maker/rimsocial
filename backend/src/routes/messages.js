const router = require('express').Router();
const { Op, User, DirectMessage, Order, Follow, Post, GroupConversation, GroupMember, GroupMessage, GroupMessageView, ChatPreference, sequelize } = require('../db');
const redis = require('../redis');
const { requireAuth } = require('../middleware/auth');
const liveChat = require('../services/liveChat');
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

async function createMessage({ me, other, body = '', mediaUrl = null, mediaKind = null, mediaName = null, replyToId = null, forwarded = false, orderId = null, storyAuthorId = null, storyPostId = null, viewLimit = 0 }) {
  const postId = storyPostId || await linkedPostId(body);
  const message = await DirectMessage.create({ senderId: me, recipientId: other, body, mediaUrl, mediaKind, mediaName, postId, replyToId, forwarded, orderId, storyAuthorId, viewLimit });
  liveChat.publish([other], { type: 'changed', kind: 'direct', with: String(me) }).catch(() => {});
  return message;
}

// ---- orders -----------------------------------------------------------------
function serializeOrder(o) {
  return {
    id: o.id, sellerId: o.sellerId, buyerId: o.buyerId, amountCents: o.amountCents, currency: o.currency,
    description: o.description, status: o.status, paidAt: o.paidAt || null, cancelledAt: o.cancelledAt || null, createdAt: o.createdAt,
  };
}
// Attach the order summary to each order message so the chat can show its card
async function withOrders(rows) {
  const ids = [...new Set(rows.map((row) => row.orderId).filter(Boolean).map(String))];
  if (!ids.length) return rows;
  const orders = await Order.findAll({ where: { id: ids }, raw: true });
  const byId = new Map(orders.map((o) => [String(o.id), serializeOrder(o)]));
  return rows.map((row) => (row.orderId ? { ...row, order: byId.get(String(row.orderId)) || null } : row));
}
// Only the seller and the buyer can see an order
async function loadOrderFor(me, id) {
  if (!UUID.test(String(id))) throw httpError(404, 'Order not found');
  const order = await Order.findByPk(id);
  if (!order || (String(order.sellerId) !== String(me) && String(order.buyerId) !== String(me))) throw httpError(404, 'Order not found');
  return order;
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
      // Photos quote with a thumbnail; view-once photos never show theirs
      mediaUrl: clean.mediaKind === 'photo' && !row.viewLimit ? clean.mediaUrl || null : null,
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
    attributes: ['id', 'kind', 'mediaUrl', 'thumbUrl', 'caption', 'authorId', 'storyText', 'storyBackground'],
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
      storyText: post.storyText || '',
      storyBackground: post.storyBackground || null,
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
// A new message brings a deleted chat back into the inbox for both people (the list hides chats marked hidden)
async function unhideChat(me, other) {
  await setPreference(me, { peerId: other }, { hidden: false }).catch(() => {});
  await setPreference(other, { peerId: me }, { hidden: false }).catch(() => {});
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
      avatarUrl: group.avatarUrl || null,
      createdById: group.createdById,
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
    const limitedIds = items.filter((m) => m.viewLimit > 0).map((m) => m.id);
    const views = limitedIds.length ? await GroupMessageView.findAll({ where: { messageId: limitedIds, userId: req.user.id }, raw: true }) : [];
    const myViews = new Map(views.map((row) => [String(row.messageId), row.viewCount]));
    const withViews = items.map((m) => ({ ...m, viewedByMe: myViews.get(String(m.id)) || 0 }));
    res.json({ group: { id: group.id, name: group.name, avatarUrl: group.avatarUrl || null, createdById: group.createdById, members: users }, items: await withGroupReplyPreviews(withViews.reverse()) });
  } catch (error) { next(error); }
});

// A group reply must quote a message from the same group
async function groupReplyTarget(groupId, replyToId) {
  if (!replyToId) return null;
  if (!UUID.test(String(replyToId))) throw httpError(400, 'That message is no longer available');
  const row = await GroupMessage.findOne({ where: { id: replyToId, groupId }, attributes: ['id'], raw: true });
  if (!row) throw httpError(400, 'That message is no longer available');
  return row.id;
}

// Attach a small quote for each group reply (null when the original was deleted)
async function withGroupReplyPreviews(rows) {
  const ids = [...new Set(rows.map((row) => row.replyToId).filter(Boolean).map(String))];
  if (!ids.length) return rows;
  const originals = await GroupMessage.findAll({ where: { id: ids }, raw: true });
  const byId = new Map(originals.map((row) => [String(row.id), {
    id: row.id,
    senderId: row.senderId,
    body: row.body || '',
    mediaKind: row.mediaKind || null,
    mediaUrl: row.mediaKind === 'photo' ? row.mediaUrl || null : null,
  }]));
  return rows.map((row) => (row.replyToId ? { ...row, replyTo: byId.get(String(row.replyToId)) || null } : row));
}

// Open a view-limited group photo: counts this member's view (the sender is never limited)
router.post('/groups/:groupId/messages/:messageId/view', async (req, res, next) => {
  try {
    const membership = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id }, raw: true });
    if (!membership) throw httpError(404, 'Group not found');
    const row = await GroupMessage.findOne({ where: { id: req.params.messageId, groupId: req.params.groupId }, raw: true });
    if (!row || !row.viewLimit) throw httpError(404, 'Photo not available');
    if (String(row.senderId) === String(req.user.id)) return res.json({ viewedByMe: 0 });
    const [seen] = await GroupMessageView.findOrCreate({ where: { messageId: row.id, userId: req.user.id }, defaults: { viewCount: 0 } });
    if (seen.viewCount >= row.viewLimit) return res.json({ viewedByMe: seen.viewCount });
    await seen.update({ viewCount: seen.viewCount + 1 });
    res.json({ viewedByMe: seen.viewCount });
  } catch (error) { next(error); }
});

// Send a group text message to every current member.
router.post('/groups/:groupId/messages', async (req, res, next) => {
  try {
    const membership = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id }, raw: true });
    if (!membership) throw httpError(404, 'Group not found');
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    if (!body) throw httpError(400, 'Type a message first');
    const replyToId = await groupReplyTarget(req.params.groupId, req.body?.replyToId);
    const message = await GroupMessage.create({ groupId: req.params.groupId, senderId: req.user.id, body, replyToId });
    await GroupConversation.update({ updatedAt: new Date() }, { where: { id: req.params.groupId } });
    publishToGroup(req.params.groupId);
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

// Send a photo, video, audio file or voice note to every current member of a group.
router.post('/groups/:groupId/media', anyFileUpload.single('media'), async (req, res, next) => {
  try {
    const membership = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id }, raw: true });
    if (!membership) throw httpError(404, 'Group not found');
    if (!req.file) throw httpError(400, 'Choose a file to send');
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/messages', { resourceType: 'auto' });
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    const fileName = String(req.file.originalname || 'File').slice(0, 255);
    const replyToId = await groupReplyTarget(req.params.groupId, req.body?.replyToId);
    const viewLimit = [1, 2].includes(Number(req.body?.viewLimit)) && chatKindFor(req.file.mimetype) === 'photo' ? Number(req.body.viewLimit) : 0;
    const message = await GroupMessage.create({
      groupId: req.params.groupId,
      senderId: req.user.id,
      body,
      replyToId,
      viewLimit,
      mediaUrl: asset.url,
      mediaKind: chatKindFor(req.file.mimetype),
      mediaName: fileName,
    });
    await GroupConversation.update({ updatedAt: new Date() }, { where: { id: req.params.groupId } });
    publishToGroup(req.params.groupId);
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

// Delete one of your own group messages for every current member.
router.delete('/groups/:groupId/messages/:messageId', async (req, res, next) => {
  try {
    const member = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id }, attributes: ['userId'], raw: true });
    if (!member) throw httpError(404, 'Group not found');
    const message = await GroupMessage.findOne({ where: { id: req.params.messageId, groupId: req.params.groupId } });
    if (!message) throw httpError(404, 'Message not found');
    if (String(message.senderId) !== String(req.user.id)) throw httpError(403, 'You can only delete your own group messages');
    await message.destroy();
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

// ---- chat list ------------------------------------------------------------

// Chat list: one row per person, newest conversation first, with unread counts.
// Text messages are end-to-end encrypted on the sender's device when the recipient has a key;
// the server stores ciphertext for those, and plain text when the recipient has no key yet
const E2E_PREFIX = 'e2e:v1:';
function textBody(raw) {
  const body = String(raw || '').trim();
  if (!body) return '';
  if (body.length > (body.startsWith(E2E_PREFIX) ? 8000 : 2000)) throw httpError(400, 'Message is too long');
  return body;
}

// Public encryption keys (the private key never leaves the device that made it)
router.put('/keys', async (req, res, next) => {
  try {
    const raw = String(req.body?.publicKey || '');
    let jwk = null;
    try { jwk = JSON.parse(raw); } catch { jwk = null; }
    if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string' || raw.length > 1000) {
      throw httpError(400, 'Invalid encryption key');
    }
    await sequelize.query(
      'INSERT INTO user_keys (userId, publicKey, updatedAt) VALUES (:userId, :publicKey, NOW()) ON DUPLICATE KEY UPDATE publicKey = VALUES(publicKey), updatedAt = NOW()',
      { replacements: { userId: req.user.id, publicKey: raw } },
    );
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get('/keys/:userId', async (req, res, next) => {
  try {
    await assertCanMessage(req.user.id, req.params.userId);
    const [rows] = await sequelize.query('SELECT publicKey FROM user_keys WHERE userId = :userId', { replacements: { userId: req.params.userId } });
    res.json({ publicKey: rows[0]?.publicKey || null });
  } catch (error) { next(error); }
});

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
      if (!byPartner.has(partner)) byPartner.set(partner, { last: row, unread: 0, unreadMedia: 0, msgs7d: 0 });
      const entry = byPartner.get(partner);
      if (Date.now() - new Date(row.createdAt).getTime() <= 7 * SHARE_DAY_MS) entry.msgs7d += 1;
      if (String(row.recipientId) === me && !row.readAt) {
        entry.unread += 1;
        if (row.mediaKind) entry.unreadMedia += 1;
      }
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
          unread: entry.unread || (prefByPeer.get(partner)?.markedUnread ? 1 : 0),
          muted: Boolean(prefByPeer.get(partner)?.muted),
          chatScore: chatListScore(entry, prefByPeer.get(partner)),
        };
      })
      .sort((a, b) => b.chatScore - a.chatScore);
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
    const rows = await DirectMessage.findAll({
      where: { [Op.or]: [
        { senderId: req.user.id, recipientId: req.params.userId },
        { senderId: req.params.userId, recipientId: req.user.id },
      ] },
    });
    for (const row of rows) {
      await row.update({ hiddenFor: JSON.stringify([...new Set([...hiddenIds(row), String(req.user.id)])]) });
    }
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
    const group = await GroupConversation.findByPk(req.params.groupId);
    if (!group) throw httpError(404, 'Group not found');
    if (req.query.scope === 'everyone') {
      if (String(group.createdById) !== String(req.user.id)) throw httpError(403, 'Only the group creator can delete this group for everyone');
      await sequelize.transaction(async (transaction) => {
        await GroupMessage.destroy({ where: { groupId: group.id }, transaction });
        await GroupMember.destroy({ where: { groupId: group.id }, transaction });
        await ChatPreference.destroy({ where: { groupId: group.id }, transaction });
        await group.destroy({ transaction });
      });
      return res.json({ deleted: true });
    }
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
    const chatPreference = await preferenceFor(me, { peerId: other });
    if (chatPreference?.hidden) return res.json({ items: [] });
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
    const chatPreference = await preferenceFor(me, { peerId: other });
    if (chatPreference?.hidden) return res.json({ items: [], typing: false });
    await DirectMessage.update({ deliveredAt: new Date() }, { where: { senderId: other, recipientId: me, deliveredAt: null } }).catch(() => {});
    const rows = await DirectMessage.findAll({
      where: { [Op.or]: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }] },
      order: [['createdAt', 'DESC']],
      limit: 200,
      raw: true,
    });
    const visible = rows.filter((row) => !isHiddenFor(row, me)).reverse().map(sanitize);
    const withReplies = await withReplyPreviews(visible);
    const items = await withOrders(await withPostPreviews(withReplies, me));
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
// The seller creates an order in the chat with the buyer (amount in USD, with a description)
router.post('/with/:userId/order', async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    const amount = Number(req.body?.amount);
    const description = String(req.body?.description || '').trim().slice(0, 500);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) throw httpError(400, 'Enter an amount greater than 0');
    await assertCanMessage(me, other);
    const order = await Order.create({ sellerId: me, buyerId: other, amountCents: Math.round(amount * 100), currency: 'USD', description, status: 'created' });
    const message = await createMessage({ me, other, body: '', orderId: order.id });
    await unhideChat(me, other);
    res.status(201).json({ message: message.toJSON(), order: serializeOrder(order.get({ plain: true })) });
  } catch (error) { next(error); }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await loadOrderFor(req.user.id, req.params.id);
    res.json({ order: serializeOrder(order.get({ plain: true })) });
  } catch (error) { next(error); }
});

router.post('/orders/:id/paid', async (req, res, next) => {
  try {
    const order = await loadOrderFor(req.user.id, req.params.id);
    if (String(order.sellerId) !== String(req.user.id)) throw httpError(403, 'Only the seller can mark this order as paid');
    if (order.status !== 'created') throw httpError(400, 'This order can no longer be marked as paid');
    await order.update({ status: 'paid', paidAt: new Date() });
    res.json({ order: serializeOrder(order.get({ plain: true })) });
  } catch (error) { next(error); }
});

router.post('/orders/:id/cancel', async (req, res, next) => {
  try {
    const order = await loadOrderFor(req.user.id, req.params.id);
    if (String(order.sellerId) !== String(req.user.id)) throw httpError(403, 'Only the seller can cancel this order');
    if (order.status !== 'created') throw httpError(400, 'This order can no longer be cancelled');
    await order.update({ status: 'cancelled', cancelledAt: new Date() });
    res.json({ order: serializeOrder(order.get({ plain: true })) });
  } catch (error) { next(error); }
});

// The recipient opens a view-limited photo: each open counts once, and the limit stops further views
router.post('/message/:id/view', async (req, res, next) => {
  try {
    if (!UUID.test(String(req.params.id))) throw httpError(404, 'Photo not found');
    const row = await DirectMessage.findByPk(req.params.id);
    if (!row || String(row.recipientId) !== String(req.user.id) || row.deletedForEveryone || row.viewLimit <= 0) throw httpError(404, 'Photo not found');
    if (row.viewCount >= row.viewLimit) throw httpError(403, 'This photo can no longer be viewed');
    await row.update({ viewCount: row.viewCount + 1 });
    res.json({ viewCount: row.viewCount, viewLimit: row.viewLimit });
  } catch (error) { next(error); }
});

router.post('/with/:userId/typing', async (req, res, next) => {
  try {
    await redis.set(`typing:${req.user.id}:${req.params.userId}`, '1', 'EX', TYPING_TTL_SECONDS).catch(() => {});
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// Send a text message to one person. Optional replyToId quotes another message in this chat.
const SHARE_DAY_MS = 86400000;

// Chat_List_Score: unread snaps first, then unread chats, pinned (not tracked yet), streak (not tracked yet),
// messages in 7 days, minus minutes since the last message
function chatListScore(entry, pref) {
  const unreadChat = entry.unread - entry.unreadMedia > 0 ? 1 : 0;
  const pinned = pref?.pinned ? 1 : 0;
  const minutesSince = (Date.now() - new Date(entry.last.createdAt).getTime()) / 60000;
  return (entry.unreadMedia > 0 ? 10000 : 0) + (unreadChat * 5000) + (pinned * 2000) + (entry.msgs7d * 10) - (minutesSince * 1.5);
}
const MAX_SHARE_RECIPIENTS = 15;

// Share sheet ranking: people you message, scored by shares sent (14d), chat volume (7d),
// mutual follows (stands in for best friends) and recency. Group chats are not ranked yet.
router.get('/share-targets', async (req, res, next) => {
  try {
    const me = req.user.id;
    const blocked = await blockedUserIds(me);
    const now = Date.now();
    const rows = await DirectMessage.findAll({
      where: { [Op.or]: [{ senderId: me }, { recipientId: me }], createdAt: { [Op.gt]: new Date(now - 30 * SHARE_DAY_MS) } },
      attributes: ['senderId', 'recipientId', 'postId', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 2000,
      raw: true,
    });
    const stats = new Map();
    for (const row of rows) {
      const peer = String(row.senderId === me ? row.recipientId : row.senderId);
      if (blocked.has(peer)) continue;
      if (!stats.has(peer)) stats.set(peer, { shares14d: 0, chat7d: 0, last: 0 });
      const s = stats.get(peer);
      const t = new Date(row.createdAt).getTime();
      if (t > s.last) s.last = t;
      if (now - t <= 7 * SHARE_DAY_MS) s.chat7d += 1;
      if (now - t <= 14 * SHARE_DAY_MS && String(row.senderId) === me && row.postId) s.shares14d += 1;
    }
    const peers = [...stats.keys()];
    if (!peers.length) return res.json({ items: [] });
    const [following, followedBy, users] = await Promise.all([
      Follow.findAll({ where: { followerId: me, followeeId: peers }, attributes: ['followeeId'], raw: true }),
      Follow.findAll({ where: { followeeId: me, followerId: peers }, attributes: ['followerId'], raw: true }),
      User.findAll({ where: { id: peers }, attributes: PUBLIC_USER, raw: true }),
    ]);
    const iFollow = new Set(following.map((r) => String(r.followeeId)));
    const followsMe = new Set(followedBy.map((r) => String(r.followerId)));
    const userById = new Map(users.map((u) => [String(u.id), u]));
    const items = peers
      .filter((id) => userById.has(id))
      .map((id) => {
        const s = stats.get(id);
        const mutual = iFollow.has(id) && followsMe.has(id) ? 1 : 0;
        const hoursSince = (now - s.last) / 3600000;
        const score = (s.shares14d * 8) + (s.chat7d * 5) + (mutual * 25) - (hoursSince * 0.25);
        return { user: userById.get(id), score: Math.round(score * 100) / 100 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
    res.json({ items });
  } catch (error) { next(error); }
});

// Share a post to up to 15 people at once. Each copy is sealed for its own recipient on the device.
router.post('/share', async (req, res, next) => {
  try {
    const me = req.user.id;
    const items = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const postId = req.body?.postId ? String(req.body.postId) : null;
    if (!items.length) throw httpError(400, 'Choose at least one person');
    if (items.length > MAX_SHARE_RECIPIENTS) throw httpError(400, `You can share with up to ${MAX_SHARE_RECIPIENTS} people at once`);
    const seen = new Set();
    for (const item of items) {
      const userId = String(item?.userId || '');
      if (!userId || !textBody(item?.body)) throw httpError(400, 'Each message needs a recipient and text');
      if (seen.has(userId)) throw httpError(400, 'Each person can be chosen only once');
      seen.add(userId);
      await assertCanMessage(me, userId);
    }
    if (postId && !(await Post.findOne({ where: { id: postId, status: 'live' }, attributes: ['id'] }))) {
      throw httpError(404, 'This post is no longer available');
    }
    for (const item of items) {
      const other = String(item.userId);
      await createMessage({ me, other, body: textBody(item.body), storyPostId: postId });
      await unhideChat(me, other);
    }
    res.status(201).json({ sent: items.length });
  } catch (error) { next(error); }
});

router.post('/with/:userId', async (req, res, next) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    const body = textBody(req.body?.body);
    const storyId = req.body?.storyId ? String(req.body.storyId) : null;
    if (!body && !storyId) return res.status(400).json({ error: 'Type a message first' });
    await assertCanMessage(me, other);
    const replyToId = await validReplyTarget(me, other, req.body?.replyToId);
    // A reply to a story sends the story's photo or video with the comment
    let media = {};
    if (storyId) {
      const story = await Post.findOne({
        where: { id: storyId, isStory: true, authorId: other, status: 'live', expiresAt: { [Op.gt]: new Date() } },
        attributes: ['id'],
      });
      if (!story) throw httpError(404, 'This story has expired');
      // The chat shows a card for the story (its thumbnail), with the reply or reaction under it
      media = { storyAuthorId: other, storyPostId: story.id };
    }
    const message = await createMessage({ me, other, body, replyToId, ...media });
    await unhideChat(me, other);
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
    const viewLimit = [1, 2].includes(Number(req.body?.viewLimit)) && chatKindFor(req.file.mimetype) === 'photo' ? Number(req.body.viewLimit) : 0;
    const message = await createMessage({ me, other, body, mediaUrl: asset.url, mediaKind: chatKindFor(req.file.mimetype), mediaName: fileName, replyToId, viewLimit });
    await unhideChat(me, other);
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

// Link preview for a chat message: title, description, image and site name of a public page.
// Private and local addresses are refused, redirects are checked one by one, and results are cached.
const dns = require('dns').promises;
const net = require('net');
const linkCache = new Map();

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  return true;
}

async function safeLinkUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw httpError(400, 'That link is not valid'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw httpError(400, 'That link is not valid');
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw httpError(400, 'That link cannot be previewed');
  return url;
}

async function readCapped(res, max) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return (await res.text()).slice(0, max);
  const chunks = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  try { await reader.cancel(); } catch { /* already finished */ }
  return Buffer.concat(chunks).toString('utf8').slice(0, max);
}

async function fetchLinkPage(start) {
  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    await safeLinkUrl(current.toString());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let res;
    try {
      res = await fetch(current, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'RimSocialLinkPreview/1.0', Accept: 'text/html' } });
    } catch {
      throw httpError(502, 'Could not load that link');
    } finally {
      clearTimeout(timer);
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) { current = new URL(location, current); continue; }
    if (!res.ok) throw httpError(404, 'No preview for that link');
    if (!/text\/html/i.test(res.headers.get('content-type') || '')) return { url: current, html: '' };
    return { url: current, html: await readCapped(res, 300000) };
  }
  throw httpError(400, 'That link redirects too many times');
}

function decodeHtml(value) {
  return String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function previewFrom(html, url) {
  const meta = (name) => {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i'));
    if (!tag) return '';
    const content = tag[0].match(/content=["']([^"']*)["']/i);
    return content ? decodeHtml(content[1]) : '';
  };
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  let image = meta('og:image') || meta('twitter:image');
  if (image) { try { image = new URL(image, url).toString(); } catch { image = ''; } }
  return {
    url: url.toString(),
    title: (meta('og:title') || meta('twitter:title') || (titleTag ? decodeHtml(titleTag[1]) : '')).trim().slice(0, 200),
    description: (meta('og:description') || meta('description') || meta('twitter:description')).trim().slice(0, 300),
    image,
    siteName: meta('og:site_name').slice(0, 80),
    domain: url.hostname.replace(/^www\./, ''),
  };
}

router.get('/link-preview', async (req, res, next) => {
  try {
    const raw = String(req.query.url || '').slice(0, 2000);
    const hit = linkCache.get(raw);
    if (hit && hit.at > Date.now() - 60 * 60 * 1000) return res.json({ preview: hit.preview });
    const start = await safeLinkUrl(raw);
    const page = await fetchLinkPage(start);
    const preview = previewFrom(page.html, page.url);
    if (linkCache.size > 500) linkCache.clear();
    linkCache.set(raw, { at: Date.now(), preview });
    res.json({ preview });
  } catch (error) { next(error); }
});

// Rename a group (any member can, like WhatsApp)
router.patch('/groups/:groupId', async (req, res, next) => {
  try {
    const member = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id } });
    if (!member) throw httpError(404, 'Group not found');
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) throw httpError(400, 'Give the group a name');
    const group = await GroupConversation.findByPk(req.params.groupId);
    await group.update({ name });
    publishToGroup(group.id);
    res.json({ group: { id: group.id, name: group.name, avatarUrl: group.avatarUrl || null } });
  } catch (error) { next(error); }
});

// Change the group photo (any member)
router.post('/groups/:groupId/avatar', anyFileUpload.single('media'), async (req, res, next) => {
  try {
    const member = await GroupMember.findOne({ where: { groupId: req.params.groupId, userId: req.user.id } });
    if (!member) throw httpError(404, 'Group not found');
    if (!req.file || !/^image\//.test(String(req.file.mimetype || ''))) throw httpError(400, 'Choose a photo');
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/groups', { resourceType: 'image' });
    const group = await GroupConversation.findByPk(req.params.groupId);
    await group.update({ avatarUrl: asset.url });
    publishToGroup(group.id);
    res.json({ group: { id: group.id, name: group.name, avatarUrl: group.avatarUrl } });
  } catch (error) { next(error); }
});

// Tells every member of a group that the group changed (new message, edit or delete)
async function publishToGroup(groupId) {
  const members = await GroupMember.findAll({ where: { groupId }, attributes: ['userId'], raw: true }).catch(() => []);
  liveChat.publish(members.map((m) => m.userId), { type: 'changed', kind: 'group', groupId: String(groupId) }).catch(() => {});
}

// Live updates: one long-lived stream per signed-in user. Sent with the auth header, never in the URL.
router.get('/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const stop = liveChat.listen(req.user.id, res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(heartbeat); stop(); });
});

// Mark everything another person sent to you as read (seen).
router.post('/with/:userId/read', async (req, res, next) => {
  try {
    await DirectMessage.update({ readAt: new Date(), deliveredAt: new Date() }, { where: { senderId: req.params.userId, recipientId: req.user.id, readAt: null } });
    await setPreference(req.user.id, { peerId: req.params.userId }, { markedUnread: false });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// Mark all incoming messages unread from this conversation in the inbox.
router.post('/with/:userId/unread', async (req, res, next) => {
  try {
    if (String(req.params.userId) === String(req.user.id)) throw httpError(400, 'Invalid conversation');
    // Stays unread even when the last message was mine: the flag is kept per chat
    await DirectMessage.update({ readAt: null }, { where: { senderId: req.params.userId, recipientId: req.user.id } });
    await setPreference(req.user.id, { peerId: req.params.userId }, { markedUnread: true });
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
    const body = textBody(req.body?.body);
    if (!body) throw httpError(400, 'Type a message first');
    await row.update({ body, editedAt: new Date(), postId: await linkedPostId(body) });
    res.json({ message: row.toJSON() });
  } catch (error) { next(error); }
});

// Delete a message. scope=me hides it only for me. scope=everyone removes it for both people (my own messages, instantly).
router.delete('/message/:id', async (req, res, next) => {
  try {
    const me = req.user.id;
    const row = await findVisibleMessage(me, req.params.id);
    if (req.query.scope === 'everyone') {
      if (String(row.senderId) !== me) throw httpError(403, 'You can only delete your own messages for everyone');
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
    if (String(row.body || '').startsWith(E2E_PREFIX)) throw httpError(400, "Encrypted messages can't be forwarded yet");
    const toUserId = String(req.body?.toUserId || '');
    await assertCanMessage(me, toUserId);
    await unhideChat(me, toUserId);
    const message = await createMessage({
      me,
      other: toUserId,
      body: row.body || '',
      mediaUrl: row.mediaUrl,
      mediaKind: row.mediaKind,
      mediaName: row.mediaName,
      storyAuthorId: row.storyAuthorId || null,
      forwarded: true,
    });
    res.status(201).json({ message: message.toJSON() });
  } catch (error) { next(error); }
});

module.exports = router;
