// Money settings. Defaults are the values that were previously hard-coded in config.js, so
// nothing changes unless an operator sets the matching environment variable.
// All amounts are minor units (kobo / cents). Changes apply only to new transactions.
function readNumber(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number (got "${raw}")`);
  return value;
}

function parseEconomics(env = process.env) {
  const positiveInt = (name, fallback) => {
    const value = readNumber(env, name, fallback);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive whole number`);
    return value;
  };

  const creatorGiftShare = readNumber(env, 'CREATOR_GIFT_SHARE', 0.5);
  if (creatorGiftShare < 0 || creatorGiftShare > 1) throw new Error('CREATOR_GIFT_SHARE must be between 0 and 1');

  const payoutHoldDays = readNumber(env, 'PAYOUT_HOLD_DAYS', 7);
  if (!Number.isSafeInteger(payoutHoldDays) || payoutHoldDays < 0) throw new Error('PAYOUT_HOLD_DAYS must be a whole number, 0 or more');

  return {
    coinPriceMinor: positiveInt('COIN_PRICE_MINOR', 100), // 1 coin costs NGN 1.00
    coinValueMinor: positiveInt('COIN_VALUE_MINOR', 100), // 1 coin represents NGN 1.00 before the creator/platform split
    creatorGiftShare,
    payoutHoldDays,
    minPayoutMinor: positiveInt('MIN_PAYOUT_MINOR', 500000), // NGN 5,000 when currency is NGN
  };
}

module.exports = { parseEconomics };
