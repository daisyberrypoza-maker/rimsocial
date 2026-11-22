// Audio uploads: browser types and file extensions both count, other files do not
const test = require('node:test');
const assert = require('node:assert/strict');
const { isAudioFile } = require('../src/utils/audioFile');

test('standard audio MIME types are accepted', () => {
  assert.equal(isAudioFile({ mimetype: 'audio/mpeg', originalname: 'a.mp3' }), true);
  assert.equal(isAudioFile({ mimetype: 'audio/x-m4a', originalname: 'a.m4a' }), true);
});

test('MP3 and M4A sent as a generic type are accepted by extension', () => {
  assert.equal(isAudioFile({ mimetype: 'application/octet-stream', originalname: 'Song.MP3' }), true);
  assert.equal(isAudioFile({ mimetype: '', originalname: 'voice.m4a' }), true);
});

test('other files are rejected', () => {
  assert.equal(isAudioFile({ mimetype: 'image/png', originalname: 'a.mp3' }), false);
  assert.equal(isAudioFile({ mimetype: 'application/octet-stream', originalname: 'notes.txt' }), false);
  assert.equal(isAudioFile({ mimetype: '', originalname: '' }), false);
});
