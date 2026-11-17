// Lens filters for upload. Each lens is baked into the photo when it is published,
// so the published photo matches the preview. Pleasant is the live look on Discover,
// Stories, the story viewer and Rimlight (styles.css --pleasant-filter).
//   css:     tone grade (CSS filter syntax, also used for the preview)
//   bloom:   soft glow layer (blur radius, opacity)
//   tint:    colour laid over the photo with soft-light (colour, opacity)
//   vignette: edge darkening (0-1)
export const FILTERS = [
  { key: 'original', label: 'Original', css: 'none' },
  { key: 'glow', label: 'Glow', css: 'contrast(1.08) saturate(1.12) brightness(1.07)', bloom: { blur: 10, alpha: 0.3 }, vignette: 0.12 },
  { key: 'warm', label: 'Warm', css: 'sepia(.18) saturate(1.25) contrast(1.05) brightness(1.04)', tint: { color: '#ffb27a', alpha: 0.14 } },
  { key: 'cool', label: 'Cool', css: 'saturate(1.1) contrast(1.05) brightness(1.04) hue-rotate(-8deg)', tint: { color: '#6ab0ff', alpha: 0.14 } },
  { key: 'vivid', label: 'Vivid', css: 'saturate(1.45) contrast(1.12) brightness(1.04)' },
  { key: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.25) brightness(.95)', vignette: 0.28 },
];

export function cssFilterFor(key) {
  const f = FILTERS.find((x) => x.key === key);
  return f && f.css !== 'none' ? f.css : undefined;
}

// Re-encodes a photo with the chosen lens. Videos and "original" pass through unchanged.
// Browsers without canvas filter support keep the grade off but still apply glow and tint.
export async function bakeFilter(file, key) {
  const lens = FILTERS.find((x) => x.key === key);
  if (!lens || lens.key === 'original' || !String(file.type).startsWith('image/')) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.filter = lens.css;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
    if (lens.bloom) {
      ctx.save();
      ctx.globalAlpha = lens.bloom.alpha;
      ctx.filter = `blur(${lens.bloom.blur}px) brightness(115%)`;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    }
    if (lens.tint) {
      ctx.save();
      ctx.globalAlpha = lens.tint.alpha;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = lens.tint.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (lens.vignette) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${lens.vignette})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return file;
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
