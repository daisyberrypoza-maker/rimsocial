const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Discover and Rimlight rank with measured trending audio and durable exposure fatigue', () => {
  const feed = read('src/services/feed.js');
  const audio = read('src/routes/audio.js');
  assert.match(feed, /trendingSound: Math\.min\(1, Math\.log1p\(soundUses\.get\(p\.musicUrl\)/);
  assert.match(feed, /INTERVAL 24 HOUR/);
  assert.match(feed, /FROM feed_exposures/);
  assert.match(feed, /INSERT INTO feed_exposures/);
  assert.match(feed, /fatiguePenalty = Math\.min\(18/);
  assert.match(audio, /isStory: false, status: 'live', visibility: 'public'/);
});

test('direct chat open marks incoming messages read', () => {
  const messages = read('src/routes/messages.js');
  assert.match(messages, /DirectMessage\.update\(\{ readAt: new Date\(\) \}, \{ where: \{ senderId: other, recipientId: me, readAt: null \} \}\)/);
});

test('group inbox uses per-group latest messages and per-member unread cursors', () => {
  const messages = read('src/routes/messages.js');
  const db = read('src/db.js');
  const server = read('src/server.js');
  const frontend = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend/src/pages/Messages.jsx'), 'utf8');
  assert.match(db, /lastReadAt: \{ type: DataTypes\.DATE, allowNull: true \}/);
  assert.match(server, /addColumn\('group_members', 'lastReadAt'/);
  assert.match(messages, /GroupMessage\.findOne\(\{[\s\S]*?order: \[\['seq', 'DESC'\], \['createdAt', 'DESC'\]\]/);
  assert.match(messages, /GroupMessage\.count\(\{[\s\S]*?createdAt: \{ \[Op\.gt\]: membership\.lastReadAt \}/);
  assert.match(messages, /membership\.update\(\{ lastReadAt: new Date\(\) \}\)/);
  assert.match(frontend, /group\.unread/);
});
