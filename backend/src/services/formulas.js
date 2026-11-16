// Ranking formulas from the architecture blueprint. Each takes the signals RimSocial measures;
// a signal that is not tracked yet is passed as 0 by the caller.

const DAY = 86400000;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

// Time_Decay(hours, gravity) = 1 / ((1 + hours) ^ gravity)
function timeDecay(hours, gravity) {
  return 1 / Math.pow(1 + Math.max(0, hours), gravity);
}

// Consecutive days with activity, counting back from today (or yesterday when today has none).
// dayKeys is a Set of 'YYYY-MM-DD' strings in UTC.
function streakDays(dayKeys, now = Date.now()) {
  const key = (t) => new Date(t).toISOString().slice(0, 10);
  let t = now;
  if (!dayKeys.has(key(t))) t -= DAY;
  let days = 0;
  while (dayKeys.has(key(t))) { days += 1; t -= DAY; }
  return days;
}

// Friend_Story_Score = (Direct_Snaps_Sent*3 + Chat_Msgs_7d*2 + Streak_Days*0.5 + Completion_Rate*5) * Time_Decay(hours, 1.2)
// Friends story score: (Chat_Score + Story_Affinity) * exp(-0.08 * hours). Story replies are not tracked yet (0).
function friendStoryScore({ snapsSent7d = 0, chats7d = 0, streak = 0, storyReplies30d = 0, completionRate = 0, hoursPosted = 0 }) {
  const chatScore = snapsSent7d * 2 + chats7d * 1.5 + streak * 0.5;
  const storyAffinity = storyReplies30d * 5 + completionRate * 3;
  return (chatScore + storyAffinity) * Math.exp(-0.08 * Math.max(0, hoursPosted));
}

// Best_Friend_Score = Snaps_Sent_30d*2.5 + Snaps_Recv_30d*2.5 + Chats_30d*1.0 + Streak_Days*1.5
function bestFriendScore({ snapsSent30d = 0, snapsRecv30d = 0, chats30d = 0, streak = 0 }) {
  return snapsSent30d * 2.5 + snapsRecv30d * 2.5 + chats30d * 1.0 + streak * 1.5;
}

// Discover_Score = (P_Full_Watch*10 + P_Subscribe*15 + P_Share*12 + P_Rewatch*8 - P_Skip*6 - P_Exit*10) * Interest_Boost * Time_Decay(hours, 1.1)
function discoverScore({ fullWatch = 0, subscribe = 0, share = 0, rewatch = 0, skip = 0, exit = 0, interestBoost = 1, hoursPosted = 0 }) {
  return (fullWatch * 10 + subscribe * 15 + share * 12 + rewatch * 8 - skip * 6 - exit * 10) * interestBoost * timeDecay(hoursPosted, 1.1);
}

// Follow_Rank_Score = (Is_Mutual*50 + Profile_Visits*15 + Story_Replies*20 + Is_Verified*10) - Days_Followed*0.2
function followRankScore({ mutual = 0, profileVisits = 0, storyReplies = 0, verified = 0, daysFollowed = 0 }) {
  return (mutual * 50 + profileVisits * 15 + storyReplies * 20 + verified * 10) - daysFollowed * 0.2;
}

// Share_Target_Score = (Direct_Shares_14d*8 + Recent_Chat_Score*5 + Is_Best_Friend*25 + Is_Active_Group*15) - Hours_Since_Last*0.25
function shareTargetScore({ shares14d = 0, recentChat = 0, isBestFriend = 0, isActiveGroup = 0, hoursSince = 0 }) {
  return (shares14d * 8 + recentChat * 5 + isBestFriend * 25 + isActiveGroup * 15) - hoursSince * 0.25;
}

// Chat_List_Score = (Has_Unread_Snap*10000 + Has_Unread_Chat*5000 + Is_Pinned*2000 + Streak_Days*2 + Msgs_7d*10) - Minutes_Since_Last*1.5
function chatListScore({ unreadSnap = 0, unreadChat = 0, pinned = 0, streak = 0, msgs7d = 0, minutesSince = 0 }) {
  return unreadSnap * 10000 + unreadChat * 5000 + pinned * 2000 + streak * 2 + msgs7d * 10 - minutesSince * 1.5;
}

// Spotlight_Score = ((Avg_Watch_Pct*25 + Loop_Rate*15 + Share_Rate*20 + Like_Rate*10 + Trending_Sound_Boost*8) - Skip_Under_2s*30) * Creator_Score * Time_Decay(hours, 1.05)
// Creator_Score = clamp(1 + log10(1 + followers) * Engagement_Rate, 1, 3): follower reach scaled by how many viewers like the post
function creatorScore({ followers = 0, engagementRate = 0 }) {
  return clamp(1 + Math.log10(1 + Math.max(0, followers)) * clamp(engagementRate, 0, 1), 1, 3);
}

function spotlightScore({ avgWatchPct = 0, loopRate = 0, shareRate = 0, likeRate = 0, trendingSound = 0, skipUnder2s = 0, creatorScore = 1, hoursPosted = 0 }) {
  return ((avgWatchPct * 25) + (loopRate * 15) + (shareRate * 20) + (likeRate * 10) + (trendingSound * 8) - (skipUnder2s * 30)) * creatorScore * timeDecay(hoursPosted, 1.05);
}

// Snap_Next_Page: a swipe past 25% of the screen height, or faster than 600px/s, moves one video on.
// Target_Video_Index = Snap_Next_Page ? Current + SIGN(-Delta_Y) : Current
function snapTarget(current, deltaY, velocityY, screenHeight) {
  const next = Math.abs(deltaY) > screenHeight * 0.25 || Math.abs(velocityY) > 600;
  return next ? current + Math.sign(-deltaY) : current;
}

// Promote_To_Next_Tier = views >= 200 AND (watches over 75% + likes + shares) / views >= 0.18
// Watches over 75% are not tracked yet, so they count as 0.
function promotedToNextTier({ views = 0, likes = 0, shares = 0, watches75 = 0 }) {
  return views >= 200 && (watches75 + likes + shares) / Math.max(1, views) >= 0.18;
}

// Interest_Boost: 1.5 when the story's topic matches one the viewer has liked, otherwise 1
function interestBoostFor(topic, likedTopics) {
  return topic && likedTopics.has(topic) ? 1.5 : 1;
}


// Shared interpolation and production-ranking helpers from the RimSocial architecture blueprint.
function lerp(start, end, t) { return start + (end - start) * clamp(t, 0, 1); }
function normalize(value, min, max) {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}
function cameraZoom(dragDelta, maxHardwareZoom = 1) {
  return clamp(1 + Math.max(0, dragDelta) / 150, 1, Math.max(1, maxHardwareZoom));
}
function galleryProgress(deltaY, screenHeight) {
  return screenHeight > 0 ? clamp(-deltaY / (screenHeight * 0.7), 0, 1) : 0;
}
function heroDragState(deltaX, deltaY, swipeVelocity = 0) {
  const distance = Math.hypot(deltaX, deltaY);
  const progress = 1 - Math.pow(1 - clamp(distance / 250, 0, 1), 1.5);
  return {
    distance,
    progress,
    scale: lerp(1, 0.75, progress),
    radius: lerp(0, 24, progress),
    backdropAlpha: lerp(0.85, 0, progress),
    audioVolume: lerp(1, 0, progress),
    dismiss: distance > 90 || Math.abs(swipeVelocity) > 800,
  };
}
function musicTrackScore({ uses24h = 0, completion = 0, genreAffinity = 0, featured = 0, daysSinceRelease = 0 }) {
  return (uses24h * 4 + completion * 20 + genreAffinity * 15 + featured * 25) * timeDecay(daysSinceRelease, 0.8);
}
function adaptiveBitrate({ throughputBps = 0, packetLossPct = 0 }) {
  const bandwidth = Math.max(0, throughputBps) * 0.8;
  const penalty = packetLossPct > 0.02 ? Math.max(0, 1 - packetLossPct * 4) : 1;
  return clamp(bandwidth * penalty, 150000, 6000000);
}
function liveStreamScore({ viewers = 0, giftsPerMinute = 0, chatsPerMinute = 0, followed = 0, minutesLive = 0 }) {
  return (viewers * 1.5 + giftsPerMinute * 10 + chatsPerMinute * 3 + followed * 500) * timeDecay(minutesLive, 0.4);
}
function adRankScore({ bid = 0, predictedActionRate = 0, creativeQuality = 0 }) {
  return Math.max(0, bid) * clamp(predictedActionRate, 0, 1) * clamp(creativeQuality, 0, 1);
}
function canShowAd({ secondsSinceLastAd = Infinity, adsShown = 0, maxSessionAds = 0 }) {
  return secondsSinceLastAd >= 90 && adsShown < maxSessionAds;
}
function profileCollapse(scrollY) {
  const t = clamp(scrollY / 140, 0, 1);
  return {
    progress: t,
    avatarScale: lerp(1, 0.45, t),
    avatarY: lerp(0, -45, t),
    stickyHeaderAlpha: clamp((t - 0.6) * 2.5, 0, 1),
  };
}
function botRiskScore({ friendRequests1h = 0, failedLogins24h = 0, accountsPerDevice = 0, links1h = 0 }) {
  return friendRequests1h * 2 + failedLogins24h * 10 + accountsPerDevice * 15 + links1h * 5;
}
function shouldChallengeBot(signals) { return botRiskScore(signals) >= 50; }
// Quick_Add_Score: mutual friends, phone contacts, shared groups, profile searches, same location, minus dismissals
// Suggest_Score: 2 per mutual friend (closeness 1), 50 per two-way phone contact, 5 same location; dismissed people are removed
function quickAddScore({ mutual = 0, contacts = 0, sameLocation = 0, dismissCount = 0 }) {
  return mutual * 2 + contacts * 50 + sameLocation * 5 - dismissCount * 100;
}

// Discover_Score = P_Click * P_Complete * Sub_Boost * Geo_Boost * Skip_Penalty * Freshness
// P_Click and P_Complete need a trained model, so they default to 1 until one exists.
function discoverFeedScore({ pClick = 1, pComplete = 1, subscribed = false, sameCountry = false, skipRate = 0, hoursPosted = 0 }) {
  const subBoost = subscribed ? 1.5 : 1;
  const geoBoost = sameCountry ? 1.35 : 1;
  const skipPenalty = skipRate > 0.5 ? 0.4 : 1;
  const freshness = 1 / (1 + 0.15 * Math.max(0, hoursPosted));
  return pClick * pComplete * subBoost * geoBoost * skipPenalty * freshness;
}

module.exports = { creatorScore, quickAddScore, discoverFeedScore, lerp, clamp, normalize, cameraZoom, galleryProgress, heroDragState, musicTrackScore, adaptiveBitrate, liveStreamScore, adRankScore, canShowAd, profileCollapse, botRiskScore, shouldChallengeBot, DAY, timeDecay, streakDays, friendStoryScore, bestFriendScore, discoverScore, followRankScore, shareTargetScore, chatListScore, spotlightScore, snapTarget, promotedToNextTier, interestBoostFor };
