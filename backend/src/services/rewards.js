// Creator Rewards: paid per 1,000 qualified views, by viewer country tier (minor units)
const RPM_BY_TIER = { tier1: 250, tier2: 120, tier3: 40 };
const TIER = { US: 'tier1', GB: 'tier1', CA: 'tier1', AU: 'tier1',
               NG: 'tier2', GH: 'tier2', KE: 'tier2', ZA: 'tier2' };

const isEligible = (c) => c.followerCount >= 10000 && c.views30d >= 100000 && c.violations === 0;

// viewsByCountry: { NG: 52000, US: 8000, ... }
function calcCreatorReward(viewsByCountry, creator) {
  if (!isEligible(creator)) return 0;
  let total = 0;
  for (const [country, views] of Object.entries(viewsByCountry)) {
    const rpm = RPM_BY_TIER[TIER[country] || 'tier3'];
    total += (views / 1000) * rpm;
  }
  return Math.floor(total);
}

// A qualified view: watched at least 3 seconds and not from a bot
const isQualifiedView = (event) => event.watchMs >= 3000 && !event.isBot;

module.exports = { calcCreatorReward, isQualifiedView, isEligible, RPM_BY_TIER };
