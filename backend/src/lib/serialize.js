// The only shape the API returns for a post. Keeps payloads small and stable.
function toPostDTO(post) {
  const p = post.toJSON ? post.toJSON() : post;
  return {
    id: p.id,
    kind: p.kind,
    mediaUrl: p.mediaUrl,
    thumbUrl: p.thumbUrl || null,
    caption: p.caption || '',
    viewCount: Number(p.viewCount) || 0,
    likeCount: Number(p.likeCount) || 0,
    repostCount: Number(p.repostCount) || 0,
    visibility: p.visibility || 'public',
    createdAt: p.createdAt,
    expiresAt: p.expiresAt || null,
    author: p.author
      ? { id: p.author.id, username: p.author.username, displayName: p.author.displayName, avatarUrl: p.author.avatarUrl }
      : null,
  };
}

module.exports = { toPostDTO };
