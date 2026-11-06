const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { parseRankCursor } = require('../src/lib/cursor');
const { signatureMatches } = require('../src/lib/signature');

test('Discover rank cursor advances past the first page', () => {
  assert.equal(parseRankCursor('rank:10'), 10);
  assert.equal(parseRankCursor('rank:0'), 0);
  assert.equal(parseRankCursor('rank:250'), 250);
});

test('Discover rank cursor falls back to the first page for anything else', () => {
  for (const bad of [undefined, null, '', 'rank:', 'rank:-1', 'rank:1.5', 'rank:abc', 'rank:\\d', 'other:10', 'rank:99999999999999999999']) {
    assert.equal(parseRankCursor(bad), 0, String(bad));
  }
});

test('webhook signature check accepts only the exact signature', () => {
  const expected = crypto.createHmac('sha512', 'secret').update('body').digest('hex');
  assert.equal(signatureMatches(expected, expected), true);
  assert.equal(signatureMatches(expected.replace(/.$/, (c) => (c === '0' ? '1' : '0')), expected), false);
  assert.equal(signatureMatches('', expected), false);
  assert.equal(signatureMatches(undefined, expected), false);
  assert.equal(signatureMatches('', ''), false);
});

test('webhook signature check never throws on multi-byte headers of matching string length', () => {
  const expected = crypto.createHmac('sha512', 'secret').update('body').digest('hex');
  const hostile = 'é'.repeat(expected.length); // same string length, twice the bytes
  assert.equal(hostile.length, expected.length);
  assert.doesNotThrow(() => signatureMatches(hostile, expected));
  assert.equal(signatureMatches(hostile, expected), false);
});
