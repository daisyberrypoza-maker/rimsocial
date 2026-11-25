// Places paid ads into a page of feed items. One ad after every `every` organic items, never more ads
// than there are slots, and never the same ad twice on one page. Ads are shuffled so the same one is not always first.
function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function interleaveAds(items, ads, every = 6, random = Math.random) {
  if (!Array.isArray(items) || !items.length || !Array.isArray(ads) || !ads.length || every < 1) return items;
  const onPage = new Set(items.map((item) => item.id));
  const pool = shuffle(ads.filter((ad) => ad && !onPage.has(ad.id)), random);
  const slots = Math.min(Math.floor(items.length / every), pool.length);
  if (slots < 1) return items;
  const chosen = pool.slice(0, slots);
  const out = [];
  let next = 0;
  items.forEach((item, index) => {
    out.push(item);
    if ((index + 1) % every === 0 && next < chosen.length) out.push(chosen[next++]);
  });
  return out;
}

module.exports = { interleaveAds };
