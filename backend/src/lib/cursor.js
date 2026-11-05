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

module.exports = { encodeCursor, decodeCursor };
