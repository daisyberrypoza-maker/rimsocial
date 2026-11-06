const cloudinary = require('../services/cloudinary');
const { Op } = require('sequelize');
const config = require('../config');
const redis = require('../redis');
const {
  sequelize, Post, StoryView, GiftTransaction, EarningsWallet, LedgerEntry, Payout, ContentEarning, seedGifts,
} = require('../db');

// Move view counts from Redis to MySQL, one key at a time
async function flushViews() {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', 'views:*', 'COUNT', 500);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');

  for (const key of keys) {
    const n = Number(await redis.getdel(key));
    if (n) await Post.increment('viewCount', { by: n, where: { id: key.slice('views:'.length) } });
  }
}

// Delete stories past their 24 hours: rows, view records, and media files
async function purgeExpiredStories() {
  const expired = await Post.findAll({
    where: { isStory: true, expiresAt: { [Op.lt]: new Date() } },
    attributes: ['id', 'mediaUrl', 'mediaPublicId', 'kind'],
    limit: 500,
  });
  if (!expired.length) return 0;

  const ids = expired.map((p) => p.id);
  await StoryView.destroy({ where: { storyId: ids } });
  await Post.destroy({ where: { id: ids } });
  for (const p of expired) {
    if (p.mediaPublicId) {
      const remaining = await Post.count({ where: { mediaPublicId: p.mediaPublicId, status: 'live' } });
      if (!remaining) {
        try { await cloudinary.deleteAsset(p.mediaPublicId, p.kind === 'video' ? 'video' : 'image'); }
        catch (e) { console.error('Expired story Cloudinary cleanup failed:', p.mediaPublicId, e.message); }
      }
    } else {
      const legacyId = cloudinary.publicIdFromUrl(p.mediaUrl);
      if (legacyId) {
        const remaining = await Post.count({ where: { mediaUrl: p.mediaUrl, status: 'live' } });
        if (!remaining) {
          try { await cloudinary.deleteAsset(legacyId, p.kind === 'video' ? 'video' : 'image'); }
          catch (e) { console.error('Expired legacy story Cloudinary cleanup failed:', legacyId, e.message); }
        }
      } else {
        const fs = require('fs');
        const path = require('path');
        fs.promises.unlink(path.join(config.uploadDir, path.basename(p.mediaUrl))).catch(() => {});
      }
    }
  }
  return ids.length;
}

// Release gift money past the hold period into the withdrawable balance
async function releaseHolds() {
  const cutoff = new Date(Date.now() - config.payoutHoldDays * 864e5);
  const due = await GiftTransaction.findAll({
    where: { released: false, createdAt: { [Op.lt]: cutoff } }, limit: 500, raw: true,
  });
  for (const tx of due) {
    await sequelize.transaction(async (t) => {
      const [claimed] = await GiftTransaction.update(
        { released: true }, { where: { id: tx.id, released: false }, transaction: t });
      if (!claimed) return;
      await EarningsWallet.increment(
        { balanceMinor: tx.creatorMinor, heldMinor: -tx.creatorMinor },
        { where: { userId: tx.creatorId }, transaction: t });
      await LedgerEntry.create({
        userId: tx.creatorId, kind: 'release', deltaMinor: tx.creatorMinor, refId: tx.id,
      }, { transaction: t });
      await ContentEarning.update(
        { status: 'released' },
        { where: { reference: `gift:${tx.id}`, status: 'pending' }, transaction: t },
      );
    });
  }
}

// Turn balances above the minimum into pending payouts (transfers are a separate step)
async function createPayouts() {
  const ready = await EarningsWallet.findAll({
    where: { balanceMinor: { [Op.gte]: config.minPayoutMinor } }, raw: true,
  });
  for (const w of ready) {
    await sequelize.transaction(async (t) => {
      const row = await EarningsWallet.findOne({
        where: { userId: w.userId }, lock: t.LOCK.UPDATE, transaction: t,
      });
      if (row.balanceMinor < config.minPayoutMinor) return;
      const amount = row.balanceMinor;
      await row.decrement('balanceMinor', { by: amount, transaction: t });
      await Payout.create({ userId: w.userId, amountMinor: amount, status: 'pending' }, { transaction: t });
      await LedgerEntry.create({ userId: w.userId, kind: 'payout', deltaMinor: -amount, refId: null }, { transaction: t });
    });
  }
}

async function main() {
  if (config.nodeEnv === 'production' && config.syncDatabase) {
    throw new Error('DB_SYNC must be false in production; apply schema migrations before starting the worker.');
  }
  await sequelize.authenticate();
  if (config.syncDatabase) await sequelize.sync();
  await seedGifts();
  console.log('Worker running');

  const every = (fn, ms, label) => setInterval(() => {
    Promise.resolve().then(fn).catch((e) => console.error(`${label} failed:`, e));
  }, ms);

  every(flushViews, 30 * 1000, 'flushViews');
  every(async () => {
    const n = await purgeExpiredStories();
    if (n) console.log(`Purged ${n} expired stories`);
  }, 10 * 60 * 1000, 'purgeExpiredStories');
  every(releaseHolds, 60 * 60 * 1000, 'releaseHolds');
  // Automatically convert released creator balances above the configured threshold
  // into auditable pending payouts. Transfers still require the verified operator flow.
  every(createPayouts, 60 * 60 * 1000, 'createPayouts');
  // Run once on startup as well, so a restart does not delay eligible payouts by an hour.
  Promise.resolve().then(createPayouts).catch((e) => console.error('createPayouts startup run failed:', e));
}

main().catch((e) => { console.error(e); process.exit(1); });
