const { sequelize, Wallet, Gift, Post, User, EarningsWallet, GiftTransaction, LedgerEntry, LiveMatch } = require('../db');
const config = require('../config');
const { Op } = require('sequelize');
const httpError = require('../utils/httpError');

async function sendGift({ senderId, postId, giftId, idempotencyKey }) {
  // Fast path: a retry of a completed gift returns the original result
  const existing = await GiftTransaction.findOne({ where: { idempotencyKey } });
  if (existing) {
    if (existing.senderId !== senderId) throw httpError(409, 'Idempotency-Key has already been used by another account');
    return { id: existing.id, duplicate: true };
  }

  try {
    return await sequelize.transaction(async (t) => {
      const gift = await Gift.findOne({ where: { id: giftId, active: true }, transaction: t });
      if (!gift) throw httpError(404, 'Gift not available');
      const coins = gift.coinPrice;

      const post = await Post.findOne({ where: { id: postId, status: 'live', isStory: false, visibility: 'public' }, transaction: t });
      if (!post) throw httpError(404, 'Public post not found');
      if (post.authorId === senderId) throw httpError(400, 'You cannot gift your own post');
      const creator = await User.findByPk(post.authorId, { attributes: ['id', 'isCreator'], transaction: t });
      if (!creator?.isCreator) throw httpError(409, 'This account has not enabled creator monetization');

      // Row lock stops two concurrent gifts from overspending the balance
      const wallet = await Wallet.findOne({
        where: { userId: senderId }, lock: t.LOCK.UPDATE, transaction: t,
      });
      if (!wallet || Number(wallet.coinBalance) < coins) throw httpError(402, 'Not enough coins');

      await wallet.decrement('coinBalance', { by: coins, transaction: t });
      await post.increment('giftCoins', { by: coins, transaction: t });

      // Verified gifts contribute to an active creator battle. The client cannot
      // directly set scores, so only this server-side ledger path changes them.
      const match = await LiveMatch.findOne({
        where: { status: 'active', [Op.or]: [{ hostId: post.authorId }, { opponentId: post.authorId }] },
        transaction: t, lock: t.LOCK.UPDATE,
      });
      if (match) {
        if (match.hostId === post.authorId) await match.increment('hostScore', { by: coins, transaction: t });
        else await match.increment('opponentScore', { by: coins, transaction: t });
      }

      const creatorMinor = Math.floor(coins * config.coinValueMinor * config.creatorGiftShare);
      const [earnings] = await EarningsWallet.findOrCreate({
        where: { userId: post.authorId }, defaults: { userId: post.authorId }, transaction: t,
      });
      // Held for payoutHoldDays before it becomes withdrawable
      await earnings.increment('heldMinor', { by: creatorMinor, transaction: t });

      const tx = await GiftTransaction.create({
        senderId, creatorId: post.authorId, postId, giftId, coins, creatorMinor, idempotencyKey,
      }, { transaction: t });

      await LedgerEntry.bulkCreate([
        { userId: senderId, kind: 'gift_out', deltaMinor: -coins, refId: tx.id },
        { userId: post.authorId, kind: 'gift_in', deltaMinor: creatorMinor, refId: tx.id },
      ], { transaction: t });

      return { id: tx.id, duplicate: false };
    });
  } catch (err) {
    // Two parallel retries hit the unique idempotency key: treat as success
    if (err.name === 'SequelizeUniqueConstraintError') {
      const duplicate = await GiftTransaction.findOne({ where: { idempotencyKey } });
      if (duplicate?.senderId === senderId) return { id: duplicate.id, duplicate: true };
      if (duplicate) throw httpError(409, 'Idempotency-Key has already been used by another account');
    }
    throw err;
  }
}

module.exports = { sendGift };
