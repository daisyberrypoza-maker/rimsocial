const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/creator.js'), 'utf8');

test('accepting a LIVE match invite re-checks blocks in both directions and cancels the match', () => {
  const respond = source.slice(source.indexOf("'/matches/:id/respond'"), source.indexOf("'/matches/:id/score'"));
  assert.match(respond, /blockerId: match\.hostId, blockedUserId: match\.opponentId/);
  assert.match(respond, /blockerId: match\.opponentId, blockedUserId: match\.hostId/);
  assert.match(respond, /match\.update\(\{ status: 'cancelled' \}\);\s*throw httpError\(409, 'This invitation is no longer available'\)/);
});
