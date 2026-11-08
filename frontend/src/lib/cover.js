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
  // Wide spread so people look different: lime and green through teal, from light to deep
  const hue = 85 + (hash % 95);               // 85 to 179 degrees
  const sat = 50 + ((hash >> 8) % 25);        // 50 to 74 percent
  const light = 30 + ((hash >> 16) % 16);     // 30 to 45 percent
  const top = hslToHex(hue, sat, light);
  const bottom = hslToHex(hue + 14, sat + 5, light + 14);
  const mid = hslToHex(hue + 7, sat + 2, light + 7); // solid colour for places without gradients
  return { top, bottom, mid, css: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)` };
}
