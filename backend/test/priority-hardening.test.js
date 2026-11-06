const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { parseRankCursor } = require('../src/lib/cursor');
const { signatureMatches } = require('../src/lib/signature');

test('Discover rank cursor advances and rejects malformed offsets', () => {
  assert.equal(parseRankCursor('rank:10'), 10);
  assert.equal(parseRankCursor('rank:0'), 0);
  for (const bad of [undefined, null, '', 'rank:', 'rank:-1', 'rank:1.5', 'rank:abc', 'rank:99999999999999999999']) {
    assert.equal(parseRankCursor(bad), 0);
  }
});

test('webhook signature comparison is exact and never throws on hostile UTF-8 headers', () => {
  const expected = crypto.createHmac('sha512', 'secret').update('body').digest('hex');
  assert.equal(signatureMatches(expected, expected), true);
  assert.equal(signatureMatches(expected.slice(0, -1) + (expected.endsWith('0') ? '1' : '0'), expected), false);
  assert.equal(signatureMatches('é'.repeat(expected.length), expected), false);
  assert.equal(signatureMatches('', expected), false);
});
