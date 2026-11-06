const crypto = require('crypto');

// Constant-time check of a hex signature header. It compares byte lengths, not string
// lengths: a header with multi-byte characters can match in string length but not in bytes,
// and crypto.timingSafeEqual throws when the byte lengths differ.
function signatureMatches(supplied, expected) {
  const a = Buffer.from(String(supplied || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { signatureMatches };
