const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEconomics } = require('../src/lib/economics');
const { inviteCutoff, isInviteExpired } = require('../src/lib/matchInvites');

test('economics defaults equal the original hard-coded values', () => {
  assert.deepEqual(parseEconomics({}), {
    coinPriceMinor: 100, coinValueMinor: 100, creatorGiftShare: 0.5, payoutHoldDays: 7, minPayoutMinor: 500000,
  });
  assert.deepEqual(parseEconomics({ COIN_PRICE_MINOR: '', CREATOR_GIFT_SHARE: '' }), parseEconomics({}));
});

test('economics values can be overridden from the environment', () => {
  const e = parseEconomics({ COIN_PRICE_MINOR: '120', COIN_VALUE_MINOR: '100', CREATOR_GIFT_SHARE: '0.6', PAYOUT_HOLD_DAYS: '3', MIN_PAYOUT_MINOR: '300000' });
  assert.equal(e.coinPriceMinor, 120);
  assert.equal(e.creatorGiftShare, 0.6);
  assert.equal(e.payoutHoldDays, 3);
  assert.equal(e.minPayoutMinor, 300000);
  assert.equal(parseEconomics({ PAYOUT_HOLD_DAYS: '0' }).payoutHoldDays, 0);
  assert.equal(parseEconomics({ CREATOR_GIFT_SHARE: '0' }).creatorGiftShare, 0);
  assert.equal(parseEconomics({ CREATOR_GIFT_SHARE: '1' }).creatorGiftShare, 1);
});

test('economics rejects values that would mis-price or overpay', () => {
  for (const env of [
    { CREATOR_GIFT_SHARE: '1.2' }, { CREATOR_GIFT_SHARE: '-0.1' }, { CREATOR_GIFT_SHARE: 'half' },
    { COIN_PRICE_MINOR: '0' }, { COIN_PRICE_MINOR: '10.5' }, { COIN_VALUE_MINOR: '-5' },
    { MIN_PAYOUT_MINOR: '0' }, { PAYOUT_HOLD_DAYS: '-1' }, { PAYOUT_HOLD_DAYS: '2.5' },
  ]) {
    assert.throws(() => parseEconomics(env), Error, JSON.stringify(env));
  }
});

test('an unanswered match invitation expires after the configured hours', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  const make = (status, hoursAgo) => ({ status, createdAt: new Date(now.getTime() - hoursAgo * 3600 * 1000) });
  assert.equal(inviteCutoff(now, 24).toISOString(), '2026-11-05T12:00:00.000Z');
  assert.equal(isInviteExpired(make('pending', 23.9), now, 24), false);
  assert.equal(isInviteExpired(make('pending', 24), now, 24), true);
  assert.equal(isInviteExpired(make('pending', 100), now, 24), true);
  // Only pending invitations can expire; an active or finished match is never touched
  assert.equal(isInviteExpired(make('active', 100), now, 24), false);
  assert.equal(isInviteExpired(make('ended', 100), now, 24), false);
});
