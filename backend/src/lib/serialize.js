// The only shape the API returns for a post. Keeps payloads small and stable.
function toPostDTO(post) {
  const p = post.toJSON ? post.toJSON() : post;
  return {
    id: p.id,
    kind: p.kind,
    mediaUrl: p.mediaUrl,
    storyText: p.storyText || null,
    dominantColor: p.dominantColor || null,
    storyBackground: p.storyBackground || null,
    voiceUrl: p.voiceUrl || null,
    musicUrl: p.musicUrl || null,
    musicTitle: p.musicTitle || null,
    musicSource: p.musicSource || null,
    audiusTrackId: p.audiusTrackId || null,
    artistName: p.artistName || null,
    artworkUrl: p.artworkUrl || null,
    musicOffsetSec: Number(p.musicOffsetSec) || 0,
    origVolume: p.origVolume == null ? 0.3 : Number(p.origVolume),
    musicVolume: p.musicVolume == null ? 0.8 : Number(p.musicVolume),
    musicMixable: Boolean(p.musicMixable),
    mediaItems: Array.isArray(p.mediaItems) && p.mediaItems.length > 1 ? p.mediaItems.map((m) => ({ url: m.url, kind: m.kind })) : null,
    thumbUrl: p.thumbUrl || null,
    caption: p.caption || '',
    topic: p.topic || null,
    loopVideo: p.loopVideo !== false,
    aiLabel: Boolean(p.aiLabel),
    viewCount: Number(p.viewCount) || 0,
    likeCount: Number(p.likeCount) || 0,
    repostCount: Number(p.repostCount) || 0,
    visibility: p.visibility || 'public',
    allowRemix: Boolean(p.allowRemix),
    sourcePostId: p.sourcePostId || null,
    // A boosted post stops showing as an ad when its paid days run out
    isSponsored: Boolean(p.isSponsored) && (!p.promotedUntil || new Date(p.promotedUntil) > new Date()),
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
