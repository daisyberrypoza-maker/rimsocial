const crypto = require('crypto');

// Compare signature bytes safely; timingSafeEqual throws if byte lengths differ.
function signatureMatches(supplied, expected) {
  const a = Buffer.from(String(supplied || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { signatureMatches };
