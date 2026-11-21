const test = require('node:test');
const assert = require('node:assert/strict');
const { cosineSimilarity, scoreCandidate, rerankExploreFeed } = require('../src/services/explore-rerank');

test('cosine similarity matches the expected values', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test('scoring rewards likes and penalises not-interested and decays with age', () => {
  const fresh = scoreCandidate({ like: 1 }, 0);
  const old = scoreCandidate({ like: 1 }, 100);
  const negative = scoreCandidate({ not_interested: 1 }, 0);
  assert.ok(fresh > old);
  assert.ok(negative < 0);
});

test('re-ranking spreads similar posts and repeated authors apart', () => {
  const item = (id, authorId, embedding, like) => ({ id, authorId, embedding, probs: { like }, ageHours: 0 });
  const ranked = rerankExploreFeed([
    item('a', 'x', [1, 0], 1.0),
    item('b', 'x', [1, 0], 0.9),
    item('c', 'y', [0, 1], 0.6),
  ], { topK: 3 });
  assert.equal(ranked[0].id, 'a');
  assert.equal(ranked[1].id, 'c');
  assert.equal(ranked[2].id, 'b');
});
