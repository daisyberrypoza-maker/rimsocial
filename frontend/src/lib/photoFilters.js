// Photo filter presets for upload. "Pleasant" follows the look described for the
// Snapchat Pleasant lens at intensity 0.75: punchy contrast/saturation, a soft
// bloom, and a warm rose tint. Other presets are simple CSS grades.
export const FILTERS = [
  { key: 'original', label: 'Original', css: 'none' },
  { key: 'pleasant', label: 'Pleasant', css: 'contrast(116.5%) saturate(126%) brightness(104.5%)', pleasant: true },
  { key: 'warm', label: 'Warm', css: 'sepia(.18) saturate(1.25) contrast(1.05) brightness(1.04)' },
  { key: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.25) brightness(.95)' },
  { key: 'soft', label: 'Soft', css: 'contrast(.95) saturate(1.1) brightness(1.06)' },
];

export function cssFilterFor(key) {
  const f = FILTERS.find((x) => x.key === key);
  return f && f.css !== 'none' ? f.css : undefined;
}

// Re-encodes a photo with the chosen filter. Videos and "original" pass through unchanged.
// Browsers without canvas filter support fall back to the unfiltered photo.
export async function bakeFilter(file, key) {
  const filter = FILTERS.find((x) => x.key === key);
  if (!filter || filter.key === 'original' || !String(file.type).startsWith('image/')) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.filter = filter.css;
    ctx.drawImage(img, 0, 0);
    if (filter.pleasant) {
      ctx.save();
      ctx.globalAlpha = 0.25 * 0.75;
      ctx.filter = 'blur(8px) brightness(115%)';
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.14 * 0.75;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = '#ff7b89';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return file;
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
