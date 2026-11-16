const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/messages.js'), 'utf8');

test('successful post shares update bounded Explore preference and invalidate the ranked cache', () => {
  assert.match(source, /feed:preferences:\$\{me\}/);
  assert.match(source, /previous \+ 6/);
  assert.match(source, /Math\.max\(-40, Math\.min\(80, previous \+ 6\)\)/);
  assert.match(source, /feed:explore:ranked:\$\{me\}/);
});
