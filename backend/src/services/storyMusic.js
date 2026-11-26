// Resolves the music attached to a story from the request, and the fields it stores.
// Audius tracks are checked against Audius when posted; the stored title, artist and artwork come from that check.
const httpError = require('../utils/httpError');
const audius = require('./audius');

const AUDIUS_ID = /^[A-Za-z0-9]{1,20}$/;

function clamp(value, low, high, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback;
}

// body: { musicId } for the app library, or { audiusTrackId } for Audius. Returns null for no music.
async function resolveMusic(body, { AudioTrack, audiusService = audius } = {}) {
  if (body.audiusTrackId) {
    const id = String(body.audiusTrackId);
    if (!AUDIUS_ID.test(id)) throw httpError(400, 'Choose a valid sound');
    let info;
    try { info = await audiusService.trackInfo(id); } catch { throw httpError(404, 'This sound is not available'); }
    if (!info.streamable) throw httpError(400, 'This sound cannot be played');
    return { source: 'audius', id: info.id, title: info.title, artist: info.artist, artwork: info.artwork, canMix: info.canMix };
  }
  if (body.musicId) {
    const track = await AudioTrack.findByPk(String(body.musicId));
    if (!track) throw httpError(404, 'Music track not found');
    return { source: 'local', id: track.id, title: track.title, artist: track.artist, mediaUrl: track.mediaUrl };
  }
  return null;
}

// Columns stored on the story. Volumes and offset are clamped to safe ranges.
function storyMusicFields(music, body = {}) {
  if (!music) {
    return { musicUrl: null, musicTitle: null, musicSource: null, audiusTrackId: null, artistName: null, artworkUrl: null, musicMixable: false };
  }
  const mix = {
    musicOffsetSec: clamp(body.musicOffsetSec, 0, 3600, 0),
    origVolume: clamp(body.origVolume, 0, 1, 0.3),
    musicVolume: clamp(body.musicVolume, 0, 1, 0.8),
  };
  if (music.source === 'audius') {
    return {
      musicUrl: null,
      musicTitle: String(music.title).slice(0, 120),
      musicSource: 'audius',
      audiusTrackId: music.id,
      artistName: String(music.artist).slice(0, 80),
      // Only https artwork is stored; anything else is dropped
      artworkUrl: /^https:\/\//i.test(String(music.artwork || '')) ? String(music.artwork).slice(0, 512) : null,
      musicMixable: Boolean(music.canMix),
      ...mix,
    };
  }
  return {
    musicUrl: music.mediaUrl,
    musicTitle: `${music.title} · ${music.artist}`.slice(0, 120),
    musicSource: 'local',
    audiusTrackId: null,
    artistName: null,
    artworkUrl: null,
    musicMixable: false,
    ...mix,
  };
}

module.exports = { resolveMusic, storyMusicFields, clamp };
