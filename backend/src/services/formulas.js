// Ranking formulas from the architecture blueprint. Each takes the signals RimSocial measures;
// a signal that is not tracked yet is passed as 0 by the caller.

const DAY = 86400000;

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
function friendStoryScore({ snapsSent7d = 0, chats7d = 0, streak = 0, completionRate = 0, hoursPosted = 0 }) {
  return (snapsSent7d * 3 + chats7d * 2 + streak * 0.5 + completionRate * 5) * timeDecay(hoursPosted, 1.2);
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

module.exports = { DAY, timeDecay, streakDays, friendStoryScore, bestFriendScore, discoverScore, followRankScore, shareTargetScore, chatListScore };
