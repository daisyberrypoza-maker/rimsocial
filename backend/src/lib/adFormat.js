// Ad formats for promoted (sponsored) posts. The format is what the ad shows: a video, a picture,
// a text card, a sound, or a product. Anything else is refused, so a client cannot store an unknown type.
const AD_FORMATS = ['video', 'photo', 'text', 'music', 'product'];

// Returns the format when it is one of AD_FORMATS, otherwise null
function normalizeAdFormat(value) {
  if (typeof value !== 'string') return null;
  const format = value.trim().toLowerCase();
  return AD_FORMATS.includes(format) ? format : null;
}

// Default format when the advertiser does not choose one: the post's own kind (video, photo or text)
function defaultAdFormat(postKind) {
  const kind = String(postKind || '').toLowerCase();
  if (kind === 'video' || kind === 'photo' || kind === 'text') return kind;
  return 'product';
}

module.exports = { AD_FORMATS, normalizeAdFormat, defaultAdFormat };
