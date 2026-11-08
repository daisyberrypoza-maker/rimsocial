/**
 * Keep the two discovery sections mutually exclusive.
 *
 * Suggested excludes every account already connected to the viewer in either
 * direction, plus blocked accounts. Follow-back contains only inbound-only
 * relationships (they follow the viewer; the viewer does not follow them).
 */
function buildSuggestionRelationshipSets({
  viewerId,
  followingIds = [],
  followerIds = [],
  blockedIds = [],
}) {
  const following = new Set(followingIds);
  const blocked = new Set(blockedIds);
  const followers = new Set(followerIds);

  const suggestedExcludedIds = [...new Set([
    viewerId,
    ...following,
    ...followers,
    ...blocked,
  ])];

  const followBackIds = [...followers].filter((id) => (
    id !== viewerId && !following.has(id) && !blocked.has(id)
  ));

  return { suggestedExcludedIds, followBackIds };
}

module.exports = { buildSuggestionRelationshipSets };
