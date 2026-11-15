const router = require('express').Router();
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { sequelize, Wallet, LedgerEntry, Payout, EarningsWallet } = require('../db');
const { settlePayoutTransfer } = require('../services/payoutSettlement');
const { signatureMatches } = require('../lib/signature');

router.post('/paystack', express.raw({ type: '*/*' }), async (req, res) => {
  if (!config.paystackSecret || !Buffer.isBuffer(req.body)) return res.status(503).end();
  const sig = req.headers['x-paystack-signature'] || '';
  const expected = crypto.createHmac('sha512', config.paystackSecret).update(req.body).digest('hex');
  if (!signatureMatches(sig, expected)) {
    return res.status(401).end();
  }

  let event;
  try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).end(); }
  if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event.event)) {
    try {
      await settlePayoutTransfer({
        eventName: event.event,
        reference: event.data?.reference,
        sequelize, Payout, EarningsWallet, LedgerEntry,
      });
    } catch (error) {
      console.error('Payout settlement webhook failed:', error.message);
      return res.status(500).end();
    }
    return res.status(200).end();
  }
  if (event.event !== 'charge.success') return res.status(200).end();

  try {
    const { reference, amount, metadata, status, currency } = event.data || {};
    if (status !== 'success' || !reference || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || !metadata || !metadata.userId) return res.status(200).end();
    const { User } = require('../db');
    if (!(await User.findByPk(metadata.userId, { attributes: ['id'] }))) return res.status(200).end();

    // Promote payment: the post is boosted only for the exact amount, once per payment reference
    if (metadata.purpose === 'post_boost') {
      const { Post } = require('../db');
      const days = Number(metadata.days);
      const expected = Number(metadata.amountMinor);
      if (!Number.isInteger(days) || days < 1 || days > 14 || currency !== 'NGN' || Number(amount) !== expected ||
          expected < days * 50000 || expected > days * 5000000) return res.status(200).end();
      const post = await Post.findOne({ where: { id: metadata.postId, authorId: metadata.userId, status: 'live', isStory: false } });
      if (!post) return res.status(200).end();
      try {
        await sequelize.transaction(async (t) => {
          await LedgerEntry.create({ userId: metadata.userId, kind: 'post_boost', deltaMinor: Number(amount), refId: reference }, { transaction: t });
          const now = new Date();
          // Extra days stack on top of a boost that is still running
          const start = post.promotedUntil && new Date(post.promotedUntil) > now ? new Date(post.promotedUntil) : now;
          await post.update({
            isSponsored: true,
            promotedUntil: new Date(start.getTime() + days * 86400000),
            sponsorName: String(metadata.sponsorName || '').slice(0, 100),
            sponsorDescription: String(metadata.sponsorDescription || '').slice(0, 200),
            sponsorCta: String(metadata.sponsorCta || 'Shop Now').slice(0, 30),
            sponsorUrl: String(metadata.sponsorUrl || '').slice(0, 1024),
          }, { transaction: t });
        });
      } catch (e) {
        if (e.name !== 'SequelizeUniqueConstraintError') throw e;
      }
      return res.status(200).end();
    }

    let coins;
    if (metadata.coinPackId) {
    // Never trust client-supplied coin counts or amounts. Resolve the pack from
    // server configuration and require exact currency and amount match.
    const pack = config.coinPacks.find((item) => item.enabled && item.id === metadata.coinPackId);
    if (!pack || currency !== pack.currency || Number(amount) !== pack.amountMinor ||
        Number(metadata.coinPackAmountMinor) !== pack.amountMinor) return res.status(200).end();
    coins = pack.coins;
  } else {
    // Compatibility for checkout references created before fixed packs shipped.
    if (currency !== 'NGN') return res.status(200).end();
    coins = Math.floor(Number(amount) / config.coinPriceMinor);
  }
    if (!Number.isSafeInteger(coins) || coins < 1) return res.status(200).end();

    try {
      await sequelize.transaction(async (t) => {
      await LedgerEntry.create({
        userId: metadata.userId, kind: 'coin_purchase', deltaMinor: amount, refId: reference,
      }, { transaction: t });
      await Wallet.findOrCreate({ where: { userId: metadata.userId }, defaults: { userId: metadata.userId }, transaction: t });
      await Wallet.increment('coinBalance', { by: coins, where: { userId: metadata.userId }, transaction: t });
    });
    } catch (e) {
      if (e.name !== 'SequelizeUniqueConstraintError') throw e;
      // Duplicate reference: the unique ledger index makes the credit idempotent.
    }
    return res.status(200).end();
  } catch (error) {
    console.error('Coin purchase webhook failed:', error.message);
    return res.status(500).end();
  }
});

module.exports = router;
