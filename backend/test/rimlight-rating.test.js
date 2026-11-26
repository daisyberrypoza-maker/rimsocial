// Rimlight rating: the stored rating is a nullable number in every post and story payload (grids and stories read it).
const test = require('node:test');
const assert = require('node:assert/strict');
const { toPostDTO } = require('../src/lib/serialize');

test('stories and grid posts carry the rating as a number', () => {
  assert.equal(toPostDTO({ id: 'a', rating: '4.00' }).rating, 4);
  assert.equal(toPostDTO({ id: 'b', rating: '3.75' }).rating, 3.75);
});

test('an unrated post keeps rating null (no badge), not 0', () => {
  assert.equal(toPostDTO({ id: 'c', rating: null }).rating, null);
  assert.equal(toPostDTO({ id: 'd' }).rating, null);
});
