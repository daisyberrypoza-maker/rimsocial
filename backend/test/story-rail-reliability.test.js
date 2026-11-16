const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const users = read('../src/routes/users.js');
const storiesRoute = read('../src/routes/stories.js');
const storyService = read('../src/services/stories.js');
const viewer = read('../../frontend/src/components/StoryViewer.jsx');
const storiesPage = read('../../frontend/src/pages/Stories.jsx');
const styles = read('../../frontend/src/styles.css');

test('follow and unfollow invalidate the viewer story rail cache', () => {
  assert.match(users, /addFolloweeToTray\(req\.user\.id, followeeId\)[\s\S]{0,220}redis\.del\(\`stories:rail:\$\{req\.user\.id\}\`\)/);
  assert.match(users, /router\.delete\('\/:id\/follow'[\s\S]{0,650}redis\.del\(\`stories:rail:\$\{req\.user\.id\}\`\)/);
});

test('block and unblock invalidate both affected story rails', () => {
  const invalidations = users.match(/\[req\.user\.id, req\.params\.id\]\.map\(\(id\) => redis\.del\(\`stories:rail:\$\{id\}\`/g) || [];
  assert.equal(invalidations.length, 2);
});

test('new follows and story sequences retain the newest active stories in chronological playback order', () => {
  assert.match(storyService, /order: \[\['createdAt', 'DESC'\]\], limit: TRAY_LIMIT/);
  assert.match(storyService, /order: \[\['createdAt', 'DESC'\]\],[\s\S]{0,80}limit: 100,[\s\S]{0,80}stories\.reverse\(\)/);
});

test('story rail cache corruption or Redis failure falls back to database data', () => {
  assert.match(storyService, /redis\.get\(key\)\.catch\(\(\) => null\)/);
  assert.match(storyService, /catch \{ \/\* Discard malformed cache and rebuild/);
  assert.match(storyService, /redis\.set\(key, JSON\.stringify\(out\), 'EX', config\.storyRailCacheSeconds\)\.catch/);
});

test('reposted stories are fanned out and deleted stories invalidate follower rails', () => {
  assert.match(storiesRoute, /router\.post\('\/:id\/repost'[\s\S]{0,1500}stories\.fanOutStory\(story\)/);
  assert.match(storiesRoute, /router\.delete\('\/:id'[\s\S]{0,1300}stories\.invalidateRailsFor\(req\.user\.id\)/);
});

test('temporary story fetch failures show retry instead of being treated as an empty creator', () => {
  assert.match(viewer, /setLoadError\(true\)/);
  assert.match(viewer, /Couldn't load this story\.[\s\S]{0,250}Retry/);
  assert.match(viewer, /const groupStories = storiesOwnerId === group\.user\?\.id \? stories : null/);
});

test('story viewed state is committed locally only after the server confirms it', () => {
  assert.match(viewer, /api\(\`\/v1\/stories\/\$\{current\.id\}\/view\`[\s\S]{0,180}\.then\(\(\) => updateCurrent\(current\.id, \{ viewed: true \}\)\)/);
  assert.match(viewer, /groupStories\.every\(\(s\) => s\.viewed\)/);
});

test('expired cached story rails are hidden and network failures expose retry', () => {
  assert.match(storiesPage, /function activeCachedRail\(items\)/);
  assert.match(storiesPage, /expiresAt > now/);
  assert.match(storiesPage, /Stories couldn't load[\s\S]{0,220}onClick=\{loadRail\}/);
});

test('photo and video tone presets and compact Stories typography are defined', () => {
  assert.match(styles, /sv-grade-noir > \.sv-image/);
  assert.match(styles, /sv-grade-noir > video\.sv-media/);
  assert.match(styles, /\.st-page \.st-friends-heading[\s\S]{0,280}font-weight: 500/);
  assert.match(styles, /\.st-page \.st-handle[\s\S]{0,250}font-weight: 400/);
});

test('previous creator navigation opens that creator’s latest retained story', () => {
  assert.match(viewer, /const previousCount = Math\.min\(100, Math\.max\(1, Number\(previousGroup\?\.storyCount\) \|\| 1\)\)/);
  assert.match(viewer, /firstStoryRef\.current = previousCount - 1/);
});
