// Audio focus on mobile: one video or track plays at a time, and leaving a screen releases every player.
// The module is ES module source, so its exports are read and evaluated here without a bundler.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../mobile/src/lib/playback.js'), 'utf8')
  .replace(/^export function /gm, 'function ');
const { registerPlayer, claimPlayback, stopAllPlayback } = new Function(`${source}\nreturn { registerPlayer, claimPlayback, stopAllPlayback };`)();

test('starting one player stops the previously active one', () => {
  const stopped = [];
  registerPlayer('a', () => stopped.push('a'));
  registerPlayer('b', () => stopped.push('b'));
  claimPlayback('a');
  claimPlayback('b');
  assert.deepEqual(stopped, ['a']);
});

test('stopAllPlayback releases every registered player', () => {
  const stopped = [];
  registerPlayer('x', () => stopped.push('x'));
  registerPlayer('y', () => stopped.push('y'));
  stopAllPlayback();
  assert.deepEqual(stopped.sort(), ['x', 'y']);
});

test('an unregistered player is no longer stopped', () => {
  const stopped = [];
  const release = registerPlayer('z', () => stopped.push('z'));
  release();
  stopAllPlayback();
  assert.equal(stopped.includes('z'), false);
});
