const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = fs.readFileSync(path.join(__dirname, '../src/routes/activity.js'), 'utf8');
const frontend = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/Activity.jsx'), 'utf8');

test('activity includes exact @username mentions from public live posts', () => {
  assert.match(backend, /const mentionPattern = viewer\?\.username/);
  assert.match(backend, /isStory: false[\s\S]*visibility: 'public'[\s\S]*caption: \{ \[Op\.like\]/);
  assert.match(backend, /mentionPattern\.test\(post\.caption \|\| ''\)/);
  assert.match(backend, /push\('mention', post\.authorId, post\.createdAt, post\.id\)/);
});

test('mention activity respects blocks and has a dedicated UI filter', () => {
  assert.match(backend, /!blockedIds\.has\(String\(post\.authorId\)\)/);
  assert.match(frontend, /item\.type === 'mention'/);
  assert.match(frontend, /\['mention','Mentions'\]/);
});
