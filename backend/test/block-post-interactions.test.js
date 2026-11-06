const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/posts.js'), 'utf8');

test('direct post interaction routes enforce bidirectional block privacy', () => {
  assert.match(source, /async function assertPostAuthorNotBlocked\(viewerId, authorId\)/);
  assert.match(source, /blockerId: viewerId, blockedUserId: authorId/);
  assert.match(source, /blockerId: authorId, blockedUserId: viewerId/);
  assert.equal((source.match(/await assertPostAuthorNotBlocked\(req\.user\.id, post\.authorId\)/g) || []).length, 7);
});
