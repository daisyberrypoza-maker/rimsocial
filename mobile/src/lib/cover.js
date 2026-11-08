// A default cover for each person: a green colour chosen from their username, so every profile
// gets its own shade and it stays the same each time it is shown. Returns hex colours.
function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const value = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function defaultCover(seed = '') {
  let hash = 2166136261;
  for (const ch of String(seed)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;
  const hue = 105 + (hash % 70);              // green to teal
  const sat = 42 + ((hash >> 8) % 18);        // 42 to 59 percent
  const light = 22 + ((hash >> 16) % 8);      // a little lighter or darker per person
  const top = hslToHex(hue, sat, light);
  const bottom = hslToHex(hue + 10, sat + 6, light + 16);
  const mid = hslToHex(hue + 5, sat + 3, light + 8); // solid colour for places without gradients
  return { top, bottom, mid, css: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)` };
}
