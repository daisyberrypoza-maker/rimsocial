const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const broadcasts = read('../src/routes/broadcasts.js');
const wallet = read('../src/services/wallet.js');

test('LIVE broadcast list hides blocked hosts', () => {
  assert.match(broadcasts, /blockedUserIds\(req\.user\.id\)/);
  assert.match(broadcasts, /filter\(\(item\) => !blocked\.has\(item\.hostId\)\)/);
});

test('LIVE token, chat read and chat post enforce block privacy against the host', () => {
  assert.equal((broadcasts.match(/await assertNotBlocked\(req\.user\.id, item\.hostId,/g) || []).length, 3);
});

test('LIVE chat read hides messages from blocked users', () => {
  assert.match(broadcasts, /filter\(\(message\) => !blocked\.has\(message\.userId\)\)/);
});

test('gifting is refused when either account has blocked the other', () => {
  assert.match(wallet, /await assertNotBlocked\(senderId, post\.authorId, 'Public post not found'\)/);
});
