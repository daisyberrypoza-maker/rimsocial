const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSuggestionRelationshipSets } = require('../src/services/suggestionRelations');

test('follow-back users are excluded from suggestions without disappearing from follow-back', () => {
  const result = buildSuggestionRelationshipSets({
    viewerId: 'viewer',
    followingIds: ['mutual', 'outgoing'],
    followerIds: ['mutual', 'inbound-only', 'blocked-follower', 'viewer'],
    blockedIds: ['blocked-follower', 'blocked-non-follower'],
  });

  assert.deepEqual(new Set(result.suggestedExcludedIds), new Set([
    'viewer',
    'mutual',
    'outgoing',
    'inbound-only',
    'blocked-follower',
    'blocked-non-follower',
  ]));
  assert.deepEqual(result.followBackIds, ['inbound-only']);
  assert.equal(result.suggestedExcludedIds.includes('inbound-only'), true);
  assert.equal(result.followBackIds.includes('inbound-only'), true);
});

test('every follow-back account is excluded from suggested candidates', () => {
  const result = buildSuggestionRelationshipSets({
    viewerId: 'viewer',
    followingIds: ['mutual', 'outgoing'],
    followerIds: ['mutual', 'inbound-only'],
    blockedIds: ['blocked'],
  });

  const excluded = new Set(result.suggestedExcludedIds);
  for (const id of result.followBackIds) {
    assert.ok(excluded.has(id), 'follow-back accounts must be excluded from suggestions');
  }
  assert.deepEqual(result.followBackIds, ['inbound-only']);
});

test('relationship set construction handles empty and duplicate input safely', () => {
  assert.deepEqual(
    buildSuggestionRelationshipSets({ viewerId: 'viewer' }),
    { suggestedExcludedIds: ['viewer'], followBackIds: [] },
  );

  const result = buildSuggestionRelationshipSets({
    viewerId: 'viewer',
    followingIds: ['same', 'same'],
    followerIds: ['same', 'same', 'new'],
  });
  assert.deepEqual(result.followBackIds, ['new']);
  assert.equal(result.suggestedExcludedIds.filter((id) => id === 'same').length, 1);
});
