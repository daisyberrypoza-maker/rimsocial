const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Rimlight Discover uses the TikTok-style ranking and Explore keeps the Spotlight engine', () => {
  const feed = read('src/services/feed.js');
  assert.match(feed, /async function getDiscoverPage[\s\S]*?return withAds\(await getRimlightPage\(/);
  assert.match(feed, /async function getRimlightPage[\s\S]*?avgWatchRatio \* 4\.0/);
  assert.match(feed, /async function getRimlightPage[\s\S]*?rewatchRate \* 5\.0/);
  assert.match(feed, /async function getRimlightPage[\s\S]*?fastSkipRate \* 5\.5/);
  assert.doesNotMatch(feed.slice(feed.indexOf('async function getRimlightPage'), feed.indexOf('// Following: a Redis')), /followers|creatorScore/);
  assert.match(feed, /async function getExplorePage[\s\S]*?return withAds\(await getSpotlightPage\([\s\S]*?cachePrefix: 'feed:explore'/);
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
  const card = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend/src/components/PostCard.jsx'), 'utf8');
  assert.match(card, /event: 'rewatch'/);
  assert.match(card, /event: 'completed'/);
  assert.match(card, /event: 'saved'/);
});

test('successful post shares influence both Rimlight and Explore recommendations', () => {
  const messages = read('src/routes/messages.js');
  assert.match(messages, /post:shares:/);
  assert.match(messages, /previous \+ 6/);
  assert.match(messages, /feed:discover:ranked/);
  assert.match(messages, /feed:explore:ranked/);
});


test('Discover ranking learns topic affinity, local relevance and topic diversity', () => {
  const feed = read('src/services/feed.js');
  const feedback = read('src/routes/feed.js');
  assert.match(feed, /feed:topic-preferences/);
  assert.match(feed, /topicBoost/);
  assert.match(feed, /localBoost/);
  assert.match(feed, /topicCount >= 5/);
  assert.match(feedback, /feed:topic-preferences/);
  assert.match(feedback, /topicDelta/);
});

test('reporting content applies a bounded negative preference and invalidates recommendation caches', () => {
  const posts = read('src/routes/posts.js');
  assert.match(posts, /previous - 18/);
  assert.match(posts, /topicPrevious - 8/);
  assert.match(posts, /feed:discover:ranked/);
  assert.match(posts, /feed:explore:ranked/);
});
