// Audius catalogue access with discovery-node failover. Signed stream URLs are short-lived;
// resolve a fresh ordered set for each playback session and never persist them.
const DEFAULT_NODES = [
  'https://api.audius.co/v1',
  'https://discoveryprovider.audius.co/v1',
  'https://discoveryprovider2.audius.co/v1',
];
const API_NODES = [...new Set([
  ...(process.env.AUDIUS_API_NODES || '').split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean),
  ...(process.env.AUDIUS_API_BASE ? [process.env.AUDIUS_API_BASE.replace(/\/$/, '')] : []),
  ...DEFAULT_NODES,
])];
const APP_NAME = process.env.AUDIUS_APP_NAME || 'RimSocial';
const TIMEOUT_MS = 8000;

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
    canMix: downloadable && Boolean(license),
  };
}

function bounded(value, fallback, max) {
  return Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));
}

async function audiusGet(path, params = {}) {
  let lastError;
  for (const base of API_NODES) {
    const url = new URL(`${base}${path}`);
    url.searchParams.set('app_name', APP_NAME);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Audius node returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw Object.assign(new Error(lastError?.message || 'All Audius discovery nodes are unavailable'), { status: 502 });
}

async function trending(limit = 30, offset = 0) {
  const body = await audiusGet('/tracks/trending', {
    limit: bounded(limit, 30, 50),
    offset: Math.max(0, Number.parseInt(offset, 10) || 0),
  });
  return (body.data || []).map(toTrack).filter((track) => track.streamable);
}

async function search(query, limit = 30, offset = 0) {
  const body = await audiusGet('/tracks/search', {
    query: String(query || '').slice(0, 80),
    limit: bounded(limit, 30, 50),
    offset: Math.max(0, Number.parseInt(offset, 10) || 0),
  });
  return (body.data || []).map(toTrack).filter((track) => track.streamable);
}

// Ask each healthy discovery node for its redirected CDN URL. A one-byte range request
// validates the redirect without downloading the track; clients retry the returned URLs in order.
async function streamLinks(id) {
  const urls = [];
  for (const base of API_NODES) {
    const url = new URL(`${base}/tracks/${encodeURIComponent(id)}/stream`);
    url.searchParams.set('app_name', APP_NAME);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'audio/*,*/*;q=0.8', Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const finalUrl = response.url;
      if (response.ok && finalUrl && finalUrl !== url.href && !urls.includes(finalUrl)) urls.push(finalUrl);
      await response.body?.cancel().catch(() => {});
    } catch {
      // Continue to the next Audius node; one unavailable node must not block playback.
    }
  }
  if (!urls.length) throw Object.assign(new Error('Track is not available from Audius nodes'), { status: 502 });
  return urls;
}

async function streamLink(id) {
  return (await streamLinks(id))[0];
}

async function trackInfo(id) {
  const body = await audiusGet(`/tracks/${encodeURIComponent(id)}`);
  if (!body.data) throw Object.assign(new Error('Track is not available'), { status: 404 });
  return toTrack(body.data);
}

module.exports = { toTrack, trending, search, streamLink, streamLinks, trackInfo, API_NODES, APP_NAME };
