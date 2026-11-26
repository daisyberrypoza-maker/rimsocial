// First-publish Terms gate: accounts that have not accepted the current Terms cannot create posts or stories.
// The database is replaced by a small in-memory User so the middleware runs without MySQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbPath = require.resolve('../src/db');
const users = new Map();
const FakeUser = {
  findByPk: async (id, options) => {
    const row = users.get(id);
    if (!row) return null;
    return { id: row.id, termsAcceptedAt: row.termsAcceptedAt };
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { User: FakeUser } };
const { requireTerms } = require(path.join(__dirname, '../src/middleware/requireTerms.js'));

function run(userId) {
  return new Promise((resolve) => {
    requireTerms({ user: { id: userId } }, {}, (error) => resolve(error || null));
  });
}

test('a legacy account without termsAcceptedAt is blocked with 428 and a clear code', async () => {
  users.set('legacy', { id: 'legacy', termsAcceptedAt: null });
  const error = await run('legacy');
  assert.ok(error, 'publishing must be refused');
  assert.equal(error.status, 428);
  assert.equal(error.code, 'TERMS_ACCEPTANCE_REQUIRED');
});

test('the same account can publish once it accepts the Terms', async () => {
  users.set('legacy', { id: 'legacy', termsAcceptedAt: null });
  assert.ok(await run('legacy'));
  users.set('legacy', { id: 'legacy', termsAcceptedAt: new Date() });
  assert.equal(await run('legacy'), null);
});

test('a missing account is refused before any post is created', async () => {
  const error = await run('ghost');
  assert.ok(error);
  assert.equal(error.status, 401);
});
