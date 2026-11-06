const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('Discover and Following feeds exclude users blocked in either direction', () => {
  const feed = fs.readFileSync(path.join(root, 'src/services/feed.js'), 'utf8');
  assert.match(feed, /blockerId: userId[\s\S]*blockedUserId: userId/);
  assert.match(feed, /row\.blockerId === userId \? row\.blockedUserId : row\.blockerId/);
  assert.match(feed, /const visibleRows = rows\.filter\(\(post\) => !blockedIds\.has\(post\.authorId\)\)/);
});

test('Global search excludes users and posts involved in a block relationship', () => {
  const search = fs.readFileSync(path.join(root, 'src/routes/search.js'), 'utf8');
  assert.match(search, /UserBlock\.findAll/);
  assert.match(search, /blockerId: req\.user\.id[\s\S]*blockedUserId: req\.user\.id/);
  assert.match(search, /const visiblePeople = people\.filter/);
  assert.match(search, /const visiblePosts = posts\.filter/);
});
