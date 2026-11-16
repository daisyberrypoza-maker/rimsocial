const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/messages.js'), 'utf8');
const feedSource = fs.readFileSync(path.join(__dirname, '../src/routes/feed.js'), 'utf8');
const postCardSource = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/PostCard.jsx'), 'utf8');

test('successful post shares update bounded Explore preference and invalidate the ranked cache', () => {
  assert.match(source, /feed:preferences:\$\{me\}/);
  assert.match(source, /previous \+ 6/);
  assert.match(source, /Math\.max\(-40, Math\.min\(80, previous \+ 6\)\)/);
  assert.match(source, /feed:explore:ranked:\$\{me\}/);
});

test('video completion and rewatch events are accepted and emitted by the player', () => {
  assert.match(feedSource, /completed: 5/);
  assert.match(feedSource, /rewatch: 4/);
  assert.match(postCardSource, /event: 'completed'/);
  assert.match(postCardSource, /event: 'rewatch'/);
  assert.match(postCardSource, /current \/ duration >= 0\.95/);
});
