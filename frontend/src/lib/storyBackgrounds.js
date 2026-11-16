// Stable, bright Story backgrounds. A Story ID selects the same palette on every device/refresh.
export const STORY_BACKGROUNDS = [
  { key: 'sunset', label: 'Sunset', css: 'linear-gradient(160deg, #ffcf70 0%, #ff9b9b 48%, #a78bfa 100%)' },
  { key: 'ocean', label: 'Ocean', css: 'linear-gradient(180deg, #a5e8ff 0%, #73c8e8 48%, #477fae 100%)' },
  { key: 'mint', label: 'Mint', css: 'linear-gradient(180deg, #baf4d2 0%, #75d9ba 52%, #3c9d91 100%)' },
  { key: 'ember', label: 'Peach', css: 'linear-gradient(180deg, #ffd0a8 0%, #ff9c86 52%, #d96d79 100%)' },
  { key: 'night', label: 'Lavender', css: 'linear-gradient(180deg, #d8d7ff 0%, #aaa9ed 50%, #7775b5 100%)' },
  { key: 'plain', label: 'Lemon', css: 'linear-gradient(180deg, #fff4a8 0%, #e8dc68 52%, #a7a64c 100%)' },
  { key: 'rose', label: 'Rose', css: 'linear-gradient(180deg, #ffd5e3 0%, #f5a8c6 52%, #c77eaa 100%)' },
  { key: 'sky', label: 'Sky', css: 'linear-gradient(180deg, #d7f1ff 0%, #a6d7f4 52%, #78a9d0 100%)' },
  { key: 'lime', label: 'Lime', css: 'linear-gradient(180deg, #e8f6a8 0%, #c4dc69 52%, #7e9b4c 100%)' },
  { key: 'lilac', label: 'Lilac', css: 'linear-gradient(180deg, #eadcff 0%, #c4a9f2 52%, #9279c6 100%)' },
];

function stableIndex(seed, length) {
  const value = String(seed || 'rimsocial');
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export function backgroundCss(key, seed) {
  const chosen = STORY_BACKGROUNDS.find((background) => background.key === key);
  if (chosen) return chosen.css;
  return STORY_BACKGROUNDS[stableIndex(seed, STORY_BACKGROUNDS.length)].css;
}
