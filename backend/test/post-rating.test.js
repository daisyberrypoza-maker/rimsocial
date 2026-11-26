const test = require('node:test');
const assert = require('node:assert/strict');
const { toPostDTO } = require('../src/lib/serialize');

test('post DTO preserves nullable numeric rating', () => {
  const rated = toPostDTO({ id: 'rated', rating: '4.25' });
  assert.equal(rated.rating, 4.25);
  const unrated = toPostDTO({ id: 'unrated', rating: null });
  assert.equal(unrated.rating, null);
});
