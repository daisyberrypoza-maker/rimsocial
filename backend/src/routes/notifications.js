const router = require('express').Router();
const { sequelize, User, Follow } = require('../db');
const { requireAuth } = require('../middleware/auth');
const httpError = require('../utils/httpError');

let schemaReady;
async function ensureTables() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sequelize.query(`CREATE TABLE IF NOT EXISTS post_notification_preferences (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId CHAR(36) NOT NULL,
        creatorId CHAR(36) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_post_notification_preference (userId, creatorId),
        KEY idx_post_notification_creator (creatorId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await sequelize.query(`CREATE TABLE IF NOT EXISTS post_notifications (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId CHAR(36) NOT NULL,
        creatorId CHAR(36) NOT NULL,
        postId CHAR(36) NOT NULL,
        kind VARCHAR(16) NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        readAt DATETIME NULL,
        KEY idx_post_notifications_user (userId, createdAt),
        KEY idx_post_notifications_post (postId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      // Keep these reference columns compatible with the app's UUID primary keys,
      // including databases where an earlier deployment created the tables.
      await sequelize.query('ALTER TABLE post_notification_preferences MODIFY userId CHAR(36) NOT NULL');
      await sequelize.query('ALTER TABLE post_notification_preferences MODIFY creatorId CHAR(36) NOT NULL');
      await sequelize.query('ALTER TABLE post_notifications MODIFY userId CHAR(36) NOT NULL');
      await sequelize.query('ALTER TABLE post_notifications MODIFY creatorId CHAR(36) NOT NULL');
      await sequelize.query('ALTER TABLE post_notifications MODIFY postId CHAR(36) NOT NULL');
    })().catch((error) => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

async function recordUploadNotifications(creatorId, postId, kind = 'post') {
  await ensureTables();
  await sequelize.query(
    `INSERT INTO post_notifications (userId, creatorId, postId, kind, createdAt)
     SELECT userId, creatorId, ?, ?, NOW()
     FROM post_notification_preferences
     WHERE creatorId = ? AND enabled = 1 AND userId <> ?`,
    { replacements: [postId, kind, creatorId, creatorId] }
  );
}

router.get('/preferences/:creatorId', requireAuth, async (req, res, next) => {
  try {
    await ensureTables();
    const creatorId = String(req.params.creatorId);
    if (creatorId === String(req.user.id)) throw httpError(400, 'You cannot subscribe to your own posts');
    const creator = await User.findByPk(creatorId, { attributes: ['id'] });
    if (!creator) throw httpError(404, 'Creator not found');
    const follow = await Follow.findOne({ where: { followerId: req.user.id, followeeId: creatorId } });
    if (!follow) return res.json({ enabled: false, following: false });
    const [rows] = await sequelize.query(
      'SELECT enabled FROM post_notification_preferences WHERE userId = ? AND creatorId = ? LIMIT 1',
      { replacements: [req.user.id, creatorId] }
    );
    res.json({ enabled: Boolean(rows[0]?.enabled), following: true });
  } catch (e) { next(e); }
});

router.put('/preferences/:creatorId', requireAuth, async (req, res, next) => {
  try {
    await ensureTables();
    const creatorId = String(req.params.creatorId);
    if (creatorId === String(req.user.id)) throw httpError(400, 'You cannot subscribe to your own posts');
    const creator = await User.findByPk(creatorId, { attributes: ['id'] });
    if (!creator) throw httpError(404, 'Creator not found');
    const follow = await Follow.findOne({ where: { followerId: req.user.id, followeeId: creatorId } });
    if (!follow) throw httpError(400, 'Follow this creator before enabling post notifications');
    const enabled = req.body?.enabled === true;
    await sequelize.query(
      `INSERT INTO post_notification_preferences (userId, creatorId, enabled)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updatedAt = NOW()`,
      { replacements: [req.user.id, creatorId, enabled ? 1 : 0] }
    );
    res.json({ enabled });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    await ensureTables();
    const [rows] = await sequelize.query(
      `SELECT n.id, n.kind, n.postId, n.createdAt, n.readAt,
        u.id AS creatorId, u.username, u.displayName, u.avatarUrl
       FROM post_notifications n
       JOIN Users u ON u.id = n.creatorId
       WHERE n.userId = ?
       ORDER BY n.createdAt DESC LIMIT 100`,
      { replacements: [req.user.id] }
    );
    res.json({ items: rows });
  } catch (e) { next(e); }
});

router.recordUploadNotifications = recordUploadNotifications;
module.exports = router;
