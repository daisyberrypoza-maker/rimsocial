// Lens filters for upload. Each lens is baked into the photo when it is published,
// so the published photo matches the preview. Most lenses are a CSS filter string, which is used for the
// preview and the baked photo alike, so the two always match. Pleasant is the live look on Discover,
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
  { key: 'fade', label: 'Fade', css: 'contrast(.9) brightness(1.08) saturate(.85)' },
  { key: 'crisp', label: 'Crisp', css: 'contrast(1.2) saturate(1.1) brightness(1.02)' },
  { key: 'golden', label: 'Golden', css: 'sepia(.35) saturate(1.5) brightness(1.06) contrast(1.02)' },
  { key: 'dusk', label: 'Dusk', css: 'hue-rotate(-12deg) saturate(1.3) brightness(.96) contrast(1.1)' },
  { key: 'frost', label: 'Frost', css: 'saturate(.7) brightness(1.1) contrast(1.05) hue-rotate(10deg)' },
  { key: 'sunset', label: 'Sunset', css: 'sepia(.25) hue-rotate(-8deg) saturate(1.6) contrast(1.08)' },
  { key: 'rose', label: 'Rose', css: 'sepia(.2) hue-rotate(-20deg) saturate(1.3) brightness(1.05)' },
  { key: 'ocean', label: 'Ocean', css: 'hue-rotate(10deg) saturate(1.35) contrast(1.08) brightness(1.02)' },
  { key: 'retro', label: 'Retro', css: 'sepia(.45) contrast(1.15) saturate(.85) brightness(.98)' },
  { key: 'pop', label: 'Pop', css: 'saturate(1.9) contrast(1.15) brightness(1.06)' },
  { key: 'bright', label: 'Bright', css: 'brightness(1.18) contrast(.96) saturate(1.05)' },
  { key: 'mono', label: 'Mono', css: 'grayscale(1) brightness(1.05) contrast(1.1)' },
  { key: 'ink', label: 'Ink', css: 'grayscale(1) contrast(1.6) brightness(.9)' },
];

export function cssFilterFor(key) {
  const f = FILTERS.find((x) => x.key === key);
  return f && f.css !== 'none' ? f.css : undefined;
}

import { drawTextLayer } from './textLayers.js';

// Re-encodes a photo with the chosen lens and any text layers. Videos and "original" pass through unchanged.
// Browsers without canvas filter support keep the grade off but still apply glow and tint.
// Crop ratios for the upload editor; 'original' keeps the full photo.
export const CROP_RATIOS = { original: null, '1:1': 1, '4:5': 4 / 5, '9:16': 9 / 16 };
// Draw strokes are stored as fractions of the photo (x and y in 0..1) with a width fraction of the photo width.
export const STROKE_WIDTH = 0.012;

export async function bakeFilter(file, key, layers = [], options = {}) {
  const strokes = options.strokes || [];
  const ratio = CROP_RATIOS[options.crop || 'original'] ?? null;
  const lens = FILTERS.find((x) => x.key === key);
  if (!String(file.type).startsWith('image/')) return file;
  const grade = Boolean(lens) && lens.key !== 'original';
  if (!grade && !layers.length && !strokes.length && !ratio) return file;
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
    if (grade) ctx.filter = lens.css;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
    if (grade && lens.bloom) {
      ctx.save();
      ctx.globalAlpha = lens.bloom.alpha;
      ctx.filter = `blur(${lens.bloom.blur}px) brightness(115%)`;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    }
    if (grade && lens.tint) {
      ctx.save();
      ctx.globalAlpha = lens.tint.alpha;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = lens.tint.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (grade && lens.vignette) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${lens.vignette})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    layers.forEach((layer) => drawTextLayer(ctx, layer, w, h));
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return file;
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
