// Audius mapping against the real trending sample (3 tracks), plus stubbed network paths.
const test = require('node:test');
const assert = require('node:assert/strict');
const audius = require('../src/services/audius');

const SAMPLE = [
  { id: 'V66vyPP', title: 'Xsetra - Fragments', genre: 'Drum & Bass', duration: 212, license: null,
    is_downloadable: false, is_streamable: true, access: { stream: true, download: true },
    user: { id: 'M33MVx', name: 'Xsetra', handle: 'Xsetra' },
    artwork: { '150x150': 'a150', '480x480': 'a480' }, stream: { url: 'https://x/s1?signature=1' } },
  { id: '6kPrmyl', title: 'Overkill', genre: 'Techno', duration: 291, license: null,
    is_downloadable: true, is_streamable: true, access: { stream: true, download: false },
    user: { id: 'QNmw6yw', name: 'Rubberband$', handle: 'rubberbands' },
    artwork: { '150x150': 'b150' }, stream: { url: 'https://x/s2' } },
  { id: 'myP1vZv', title: 'OBSESSION - THORNHILL (MORTALA. REMIX)', genre: 'Dubstep', duration: 168, license: null,
    is_downloadable: false, is_streamable: true, access: { stream: true, download: true },
    user: { id: 'vYEXGpY', name: 'Mortala.', handle: 'Mortala.' }, artwork: null, stream: { url: 'https://x/s3' } },
];

test('maps Audius tracks to app shape', () => {
  const [a, b, c] = SAMPLE.map(audius.toTrack);
  assert.equal(a.id, 'V66vyPP');
  assert.equal(a.artist, 'Xsetra');
  assert.equal(a.duration, 212);
  assert.equal(a.artwork, 'a480');
  assert.equal(a.streamable, true);
  assert.equal(b.artwork, 'b150');
  assert.equal(c.artwork, null);
  assert.equal(c.title, 'OBSESSION - THORNHILL (MORTALA. REMIX)');
});

test('only downloadable and licensed tracks can be mixed', () => {
  // All three sample tracks have license null, so none can be mixed
  for (const raw of SAMPLE) assert.equal(audius.toTrack(raw).canMix, false);
  const licensed = audius.toTrack({ ...SAMPLE[1], license: 'CC-BY' });
  assert.equal(licensed.canMix, false, 'access.download false blocks mixing');
  const ok = audius.toTrack({ ...SAMPLE[0], license: 'CC-BY', is_downloadable: true });
  assert.equal(ok.canMix, true);
});

test('trending and search call the API with app_name and filter unstreamable tracks', async () => {
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    const unstreamable = { ...SAMPLE[0], id: 'nope', is_streamable: false, access: { stream: false, download: false } };
    return { ok: true, json: async () => ({ data: [...SAMPLE, unstreamable] }) };
  };
  try {
    const trending = await audius.trending(3);
    assert.equal(trending.length, 3);
    assert.ok(calls[0].startsWith(`${audius.API_BASE}/tracks/trending?`));
    assert.ok(calls[0].includes('app_name=RimSocial'));
    const found = await audius.search('overkill', 5);
    assert.equal(found.length, 3);
    assert.ok(calls[1].includes('/tracks/search?'));
    assert.ok(calls[1].includes('query=overkill'));
  } finally {
    global.fetch = realFetch;
  }
});

test('stream link is fetched fresh for one track', async () => {
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    assert.ok(String(url).endsWith('/tracks/V66vyPP?app_name=RimSocial'));
    return { ok: true, json: async () => ({ data: SAMPLE[0] }) };
  };
  try {
    assert.equal(await audius.streamLink('V66vyPP'), 'https://x/s1?signature=1');
  } finally {
    global.fetch = realFetch;
  }
});
