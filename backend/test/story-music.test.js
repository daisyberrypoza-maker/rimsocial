// Story music: Audius tracks are verified on post, library tracks keep their URL, volumes and offset are clamped.
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveMusic, storyMusicFields, clamp } = require('../src/services/storyMusic');

const AUDIUS_TRACK = { id: 'V66vyPP', title: 'Xsetra - Fragments', artist: 'Xsetra', artwork: 'https://a/480.jpg', canMix: false, streamable: true };
const audiusService = {
  trackInfo: async (id) => {
    if (id !== 'V66vyPP') throw new Error('not found');
    return AUDIUS_TRACK;
  },
};
const AudioTrack = { findByPk: async (id) => (id === 'lib1' ? { id, title: 'Local', artist: 'Me', mediaUrl: 'https://c/local.mp3' } : null) };

test('an Audius track is resolved from Audius metadata, not client input', async () => {
  const music = await resolveMusic({ audiusTrackId: 'V66vyPP', musicTitle: 'spoofed' }, { AudioTrack, audiusService });
  assert.equal(music.source, 'audius');
  assert.equal(music.title, 'Xsetra - Fragments');
  const fields = storyMusicFields(music, { musicOffsetSec: 12 });
  assert.equal(fields.musicSource, 'audius');
  assert.equal(fields.audiusTrackId, 'V66vyPP');
  assert.equal(fields.musicUrl, null, 'no signed link is stored');
  assert.equal(fields.musicTitle, 'Xsetra - Fragments');
  assert.equal(fields.artistName, 'Xsetra');
  assert.equal(fields.artworkUrl, 'https://a/480.jpg');
  assert.equal(fields.musicOffsetSec, 12);
  assert.equal(fields.musicMixable, false);
});

test('an unknown or unplayable Audius track is rejected', async () => {
  await assert.rejects(resolveMusic({ audiusTrackId: 'nope' }, { AudioTrack, audiusService }), (e) => e.status === 404);
  await assert.rejects(resolveMusic({ audiusTrackId: 'bad id!' }, { AudioTrack, audiusService }), (e) => e.status === 400);
  const notStreamable = { trackInfo: async () => ({ ...AUDIUS_TRACK, streamable: false }) };
  await assert.rejects(resolveMusic({ audiusTrackId: 'V66vyPP' }, { AudioTrack, audiusService: notStreamable }), (e) => e.status === 400);
});

test('a library track keeps its file URL and marks the source as local', async () => {
  const music = await resolveMusic({ musicId: 'lib1' }, { AudioTrack, audiusService });
  const fields = storyMusicFields(music, {});
  assert.equal(fields.musicSource, 'local');
  assert.equal(fields.musicUrl, 'https://c/local.mp3');
  assert.equal(fields.musicTitle, 'Local · Me');
  assert.equal(fields.audiusTrackId, null);
  assert.equal(fields.musicMixable, false);
});

test('no music gives empty music fields', async () => {
  assert.equal(await resolveMusic({}, { AudioTrack, audiusService }), null);
  const fields = storyMusicFields(null, {});
  assert.equal(fields.musicSource, null);
  assert.equal(fields.musicUrl, null);
});

test('volumes and offset are clamped to safe ranges', () => {
  const music = { source: 'local', id: 'x', title: 't', artist: 'a', mediaUrl: 'u' };
  const fields = storyMusicFields(music, { musicOffsetSec: -5, origVolume: 9, musicVolume: 'loud' });
  assert.equal(fields.musicOffsetSec, 0);
  assert.equal(fields.origVolume, 1);
  assert.equal(fields.musicVolume, 0.8);
  assert.equal(clamp(0.25, 0, 1, 0.3), 0.25);
  assert.equal(clamp(undefined, 0, 1, 0.3), 0.3);
});
