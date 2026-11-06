const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/users.js'), 'utf8');

test('blocking an account removes follows in both directions and adjusts counts', () => {
  assert.match(source, /Blocking ends any existing follow relationship in either direction/);
  assert.match(source, /const removedOutgoing = await Follow\.destroy/);
  assert.match(source, /const removedIncoming = await Follow\.destroy/);
  assert.match(source, /User\.decrement\('followerCount'/);
});

test('follow endpoint rejects accounts involved in a block relationship', () => {
  assert.match(source, /You cannot follow an account involved in a block relationship/);
  assert.match(source, /blockerId: req\.user\.id, blockedUserId: followeeId/);
  assert.match(source, /blockerId: followeeId, blockedUserId: req\.user\.id/);
});

test('suggested accounts exclude blocked users', () => {
  assert.match(source, /const blockedIds = blockRows\.map/);
  assert.match(source, /\.\.\.blockedIds/);
});
