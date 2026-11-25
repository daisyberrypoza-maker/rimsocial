const test = require('node:test');
const assert = require('node:assert/strict');
const { AD_FORMATS, normalizeAdFormat, defaultAdFormat } = require('../src/lib/adFormat');

test('the five ad formats are video, photo, text, music and product', () => {
  assert.deepEqual(AD_FORMATS, ['video', 'photo', 'text', 'music', 'product']);
});

test('known formats are accepted regardless of case and spaces', () => {
  assert.equal(normalizeAdFormat('Music'), 'music');
  assert.equal(normalizeAdFormat('  product '), 'product');
  assert.equal(normalizeAdFormat('video'), 'video');
});

test('unknown or empty formats are refused as null', () => {
  assert.equal(normalizeAdFormat('script'), null);
  assert.equal(normalizeAdFormat('<script>'), null);
  assert.equal(normalizeAdFormat(''), null);
  assert.equal(normalizeAdFormat(undefined), null);
  assert.equal(normalizeAdFormat(['video']), null);
});

test('the default format follows the post kind, and falls back to product', () => {
  assert.equal(defaultAdFormat('video'), 'video');
  assert.equal(defaultAdFormat('photo'), 'photo');
  assert.equal(defaultAdFormat('text'), 'text');
  assert.equal(defaultAdFormat('anything-else'), 'product');
  assert.equal(defaultAdFormat(null), 'product');
});
