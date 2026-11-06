const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const blocks = read('../src/lib/blocks.js');
const routes = read('../src/routes/stories.js');
const service = read('../src/services/stories.js');

test('block helper checks both directions of a block', () => {
  assert.match(blocks, /blockerId: viewerId, blockedUserId: otherId/);
  assert.match(blocks, /blockerId: otherId, blockedUserId: viewerId/);
  assert.match(blocks, /r\.blockerId === userId \? r\.blockedUserId : r\.blockerId/);
});

test('story routes hide blocked creators', () => {
  assert.match(routes, /assertNotBlocked\(req\.user\.id, req\.params\.userId, 'User not found'\)/);
  assert.match(routes, /assertNotBlocked\(req\.user\.id, original\.authorId, 'Story not found or expired'\)/);
  assert.match(routes, /assertNotBlocked\(req\.user\.id, story\.authorId, 'Story not found or expired'\)/);
});

test('story rail excludes blocked creators, including from the cached rail', () => {
  assert.match(service, /blockedUserIds\(viewerId\)/);
  assert.match(service, /filter\(\(item\) => !blocked\.has\(item\.user\?\.id\)\)/);
  assert.match(service, /filter\(\(id\) => !blocked\.has\(id\)\)/);
});
