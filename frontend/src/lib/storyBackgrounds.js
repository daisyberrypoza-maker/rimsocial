// Backgrounds for text stories. The key is saved with the story, so every viewer draws the same colours.
export const STORY_BACKGROUNDS = [
  { key: 'sunset', label: 'Sunset', css: 'linear-gradient(160deg, #f9ce34 0%, #ee2a7b 55%, #6228d7 100%)' },
  { key: 'ocean', label: 'Ocean', css: 'linear-gradient(160deg, #2bd3ff 0%, #0064e0 100%)' },
  { key: 'mint', label: 'Mint', css: 'linear-gradient(160deg, #1fd17b 0%, #0a9f8a 100%)' },
  { key: 'ember', label: 'Ember', css: 'linear-gradient(160deg, #ff8a00 0%, #ff3040 100%)' },
  { key: 'night', label: 'Night', css: 'linear-gradient(160deg, #1f2a44 0%, #000000 100%)' },
  { key: 'plain', label: 'Plain', css: '#111111' },
];

export function backgroundCss(key) {
  return (STORY_BACKGROUNDS.find((b) => b.key === key) || STORY_BACKGROUNDS[0]).css;
}
