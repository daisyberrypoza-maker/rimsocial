const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Rimlight Discover and Explore use the shared Spotlight ranking engine', () => {
  const feed = read('src/services/feed.js');
  assert.match(feed, /async function getDiscoverPage[\s\S]*?return getSpotlightPage\([\s\S]*?cachePrefix: 'feed:discover'/);
  assert.match(feed, /async function getExplorePage[\s\S]*?return getSpotlightPage\([\s\S]*?cachePrefix: 'feed:explore'/);
  assert.match(feed, /loopRate,/);
  assert.match(feed, /watches75: spot\.completions/);
  assert.match(feed, /SEED_EVERY = 4/);
});

test('authenticated feedback aggregates completion, rewatch and fast-skip signals', () => {
  const route = read('src/routes/feed.js');
  assert.match(route, /saved: 6/);
  assert.match(route, /hincrbyfloat\(spotKey, 'watchPct'/);
  assert.match(route, /hincrby\(spotKey, 'completions'/);
  assert.match(route, /hincrby\(spotKey, 'rewatches'/);
  assert.match(route, /hincrby\(spotKey, 'skips'/);
  assert.match(route, /feed:discover:ranked/);
  assert.match(route, /feed:explore:ranked/);
});

test('Rimlight player reports natural replay and saved-post preference', () => {
  const card = read('../../frontend/src/components/PostCard.jsx');
  assert.match(card, /event: 'rewatch'/);
  assert.match(card, /event: 'saved'/);
});

test('successful post shares influence both Rimlight and Explore recommendations', () => {
  const messages = read('src/routes/messages.js');
  assert.match(messages, /post:shares:/);
  assert.match(messages, /previous \+ 6/);
  assert.match(messages, /feed:discover:ranked/);
  assert.match(messages, /feed:explore:ranked/);
});
