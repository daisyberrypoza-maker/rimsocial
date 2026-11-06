// Opaque cursor for keyset pagination: { t: ms timestamp, id: row id }
function encodeCursor(t, id) {
  return Buffer.from(JSON.stringify({ t, id })).toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const o = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (typeof o.t !== 'number' || typeof o.id !== 'string') return null;
    return o;
  } catch {
    return null;
  }
}

// Discover pages by rank position, cursor looks like "rank:20". Anything else starts at 0.
function parseRankCursor(value) {
  const match = /^rank:(\d+)$/.exec(String(value || ''));
  const offset = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(offset) ? offset : 0;
}

module.exports = { encodeCursor, decodeCursor, parseRankCursor };
