// A LIVE match invitation that nobody answered must not block creators forever.
function inviteCutoff(now, ttlHours) {
  return new Date(now.getTime() - ttlHours * 3600 * 1000);
}

function isInviteExpired(match, now, ttlHours) {
  return match.status === 'pending' && new Date(match.createdAt).getTime() <= inviteCutoff(now, ttlHours).getTime();
}

module.exports = { inviteCutoff, isInviteExpired };
