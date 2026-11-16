const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/users.js'), 'utf8');

test('follower and following lists exclude accounts blocked in either direction', () => {
  assert.match(source, /async function excludeBlockedPeople\(people, viewerId\)/);
  assert.match(source, /blockerId: viewerId[\s\S]*blockedUserId: viewerId/);
  assert.match(source, /row\.blockerId === viewerId \? row\.blockedUserId : row\.blockerId/);
  assert.match(source, /async function peopleInRelationshipOrder\([\s\S]*?excludeBlockedPeople\(ordered, viewerId\)/);
  assert.match(source, /router\.get\('\/:username\/followers'[\s\S]*?peopleInRelationshipOrder\(/);
  assert.match(source, /router\.get\('\/:username\/following'[\s\S]*?peopleInRelationshipOrder\(/);
});
