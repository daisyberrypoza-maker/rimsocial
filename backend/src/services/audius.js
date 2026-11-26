// Audius music catalogue, proxied through our server so the app name and fresh stream links are added here.
// Stream links in Audius responses are signed and expire, so playback asks for a new one each time.
const API_BASES = [...new Set([
  process.env.AUDIUS_API_BASE,
  'https://api.audius.co/v1',
  'https://discoveryprovider.audius.co/v1',
].filter(Boolean))];
const API_BASE = API_BASES[0];
const APP_NAME = process.env.AUDIUS_APP_NAME || 'RimSocial';
const TIMEOUT_MS = 8000;

// Maps one Audius track to the shape the app uses. Only fields the picker needs are kept.
function toTrack(raw) {
  const license = typeof raw.license === 'string' && raw.license.trim() ? raw.license.trim() : null;
  const downloadable = Boolean(raw.access?.download && raw.is_downloadable);
  return {
    id: String(raw.id),
    title: String(raw.title || 'Untitled').slice(0, 80),
    artist: String(raw.user?.name || raw.user?.handle || 'Unknown artist').slice(0, 80),
    duration: Number(raw.duration) || 0,
    artwork: raw.artwork?.['480x480'] || raw.artwork?.['150x150'] || null,
    genre: raw.genre || null,
    streamable: Boolean(raw.access?.stream ?? raw.is_streamable),
    license,
    // Mixing into a video needs a downloadable track with a licence. Anything else is play-only.
    canMix: downloadable && Boolean(license),
  };
}

async function audiusGet(path, params = {}) {
  let lastError;
  for (const base of API_BASES) {
    const url = new URL(`${base}${path}`);
    url.searchParams.set('app_name', APP_NAME);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
      if (!res.ok) {
        lastError = Object.assign(new Error(`Audius node responded ${res.status}`), { status: 502 });
        continue;
      }
      const body = await res.json();
      if (body?.error) throw new Error(String(body.error));
      return body;
    } catch (error) {
      lastError = error;
    }
  }
  throw Object.assign(new Error('Audius is temporarily unavailable on all configured nodes', { cause: lastError }), { status: 502 });
}

async function trending(limit = 20, offset = 0) {
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const pageOffset = Math.min(Math.max(Number(offset) || 0, 0), 10000);
  const body = await audiusGet('/tracks/trending', { limit: pageSize, offset: pageOffset });
  return (body.data || []).map(toTrack).filter((track) => track.streamable);
}

async function search(query, limit = 20) {
  const body = await audiusGet('/tracks/search', { query, limit: Math.min(Math.max(Number(limit) || 20, 1), 50) });
  return (body.data || []).map(toTrack).filter((track) => track.streamable);
}

// Fresh signed stream link for one track (playback only; not stored)
async function streamLink(id) {
  const body = await audiusGet(`/tracks/${encodeURIComponent(id)}`);
  const url = body.data?.stream?.url;
  if (!url) throw Object.assign(new Error('Track is not available'), { status: 404 });
  return url;
}

// Metadata for one track, used when a story is posted so the server stores verified values
async function trackInfo(id) {
  const body = await audiusGet(`/tracks/${encodeURIComponent(id)}`);
  if (!body.data) throw Object.assign(new Error('Track is not available'), { status: 404 });
  return toTrack(body.data);
}

module.exports = { toTrack, trending, search, streamLink, trackInfo, API_BASE, APP_NAME };
