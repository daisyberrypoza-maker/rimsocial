// The only shape the API returns for a post. Keeps payloads small and stable.
function toPostDTO(post) {
  const p = post.toJSON ? post.toJSON() : post;
  return {
    id: p.id,
    kind: p.kind,
    mediaUrl: p.mediaUrl,
    storyText: p.storyText || null,
    storyBackground: p.storyBackground || null,
    voiceUrl: p.voiceUrl || null,
    musicUrl: p.musicUrl || null,
    musicTitle: p.musicTitle || null,
    mediaItems: Array.isArray(p.mediaItems) && p.mediaItems.length > 1 ? p.mediaItems.map((m) => ({ url: m.url, kind: m.kind })) : null,
    thumbUrl: p.thumbUrl || null,
    caption: p.caption || '',
    topic: p.topic || null,
    aiLabel: Boolean(p.aiLabel),
    viewCount: Number(p.viewCount) || 0,
    likeCount: Number(p.likeCount) || 0,
    repostCount: Number(p.repostCount) || 0,
    visibility: p.visibility || 'public',
    allowRemix: Boolean(p.allowRemix),
    sourcePostId: p.sourcePostId || null,
    isSponsored: Boolean(p.isSponsored),
    sponsorName: p.sponsorName || null,
    sponsorDescription: p.sponsorDescription || null,
    sponsorCta: p.sponsorCta || null,
    sponsorUrl: p.sponsorUrl || null,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt || null,
    author: p.author
      ? { id: p.author.id, username: p.author.username, displayName: p.author.displayName, avatarUrl: p.author.avatarUrl }
      : null,
  };
}

module.exports = { toPostDTO };
