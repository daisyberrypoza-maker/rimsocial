const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { parseRankCursor } = require('../src/lib/cursor');
const { signatureMatches } = require('../src/lib/signature');

test('Discover rank cursors advance safely', () => {
  assert.equal(parseRankCursor('rank:10'), 10);
  assert.equal(parseRankCursor('rank:0'), 0);
  assert.equal(parseRankCursor('rank:250'), 250);
});

test('invalid or unsafe Discover cursors reset to the first page', () => {
  for (const value of [undefined, null, '', 'rank:', 'rank:-1', 'rank:1.5', 'rank:abc', 'rank:99999999999999999999', 'other:10']) {
    assert.equal(parseRankCursor(value), 0, String(value));
  }
});

test('Paystack signature comparison accepts exact bytes only', () => {
  const expected = crypto.createHmac('sha512', 'test-secret').update('payload').digest('hex');
  assert.equal(signatureMatches(expected, expected), true);
  assert.equal(signatureMatches(expected.slice(0, -1) + (expected.endsWith('0') ? '1' : '0'), expected), false);
  assert.equal(signatureMatches('', expected), false);
  assert.equal(signatureMatches(expected, ''), false);
});

test('malformed multibyte signature headers never make timingSafeEqual throw', () => {
  const expected = crypto.createHmac('sha512', 'test-secret').update('payload').digest('hex');
  const hostile = 'é'.repeat(expected.length);
  assert.equal(hostile.length, expected.length);
  assert.doesNotThrow(() => signatureMatches(hostile, expected));
  assert.equal(signatureMatches(hostile, expected), false);
});
