const test = require('node:test');
const assert = require('node:assert/strict');
const { interleaveAds } = require('../src/lib/adSlots');

const organic = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
const ads = (n) => Array.from({ length: n }, (_, i) => ({ id: `ad${i}`, isSponsored: true }));
const noRandom = () => 0.5;

test('one ad after every 6 organic posts, with a page of 12 items getting two ads', () => {
  const out = interleaveAds(organic(12), ads(5), 6, noRandom);
  assert.equal(out.length, 14);
  assert.equal(out[6].isSponsored, true);
  assert.equal(out[13].isSponsored, true);
});

test('no ads when the page is shorter than one slot', () => {
  const page = organic(5);
  assert.equal(interleaveAds(page, ads(3), 6, noRandom), page);
});

test('never more ads than available, and never the same ad twice on one page', () => {
  const out = interleaveAds(organic(30), ads(2), 6, noRandom);
  const adIds = out.filter((item) => item.isSponsored).map((item) => item.id);
  assert.equal(adIds.length, 2);
  assert.equal(new Set(adIds).size, 2);
});

test('an ad already on the page is not inserted again', () => {
  const page = [...organic(6), { id: 'ad0', isSponsored: true }];
  const out = interleaveAds(page, ads(2), 6, noRandom);
  assert.equal(out.filter((item) => item.id === 'ad0').length, 1);
});

test('organic order is kept', () => {
  const out = interleaveAds(organic(12), ads(2), 6, noRandom).filter((item) => !item.isSponsored).map((item) => item.id);
  assert.deepEqual(out, organic(12).map((item) => item.id));
});
