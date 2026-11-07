const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/users.js'), 'utf8');

test('direct profile and profile-post routes reject either direction of a block', () => {
  assert.match(source, /async function assertNotBlocked\(viewerId, targetId\)/);
  assert.match(source, /blockerId: viewerId, blockedUserId: targetId/);
  assert.match(source, /blockerId: targetId, blockedUserId: viewerId/);
  assert.equal((source.match(/await assertNotBlocked\(req\.user\.id, user\.id\)/g) || []).length, 3);
  assert.match(source, /if \(relation\) throw httpError\(404, 'User not found'\)/);
});
