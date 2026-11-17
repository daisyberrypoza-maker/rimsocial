// Text layers placed on a photo in the upload editor. Shared by the preview and the
// published photo so both use the same font, colour, background and position.
export const TEXT_COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de', '#ff2d55'];
export const TEXT_FONTS = {
  sans: { label: 'Sans', family: 'system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif', weight: 700 },
  serif: { label: 'Serif', family: 'Georgia, "Times New Roman", serif', weight: 700 },
  mono: { label: 'Mono', family: '"Courier New", ui-monospace, Menlo, monospace', weight: 700 },
};
export const TEXT_ALIGNS = ['left', 'center', 'right'];

// Font size is a fraction of the photo width, so the preview and the published photo match.
export const TEXT_SIZE = 0.075;

// Draws one layer on a canvas of width w and height h. Layers wrap on their own lines.
export function drawTextLayer(ctx, layer, w, h) {
  const size = Math.round(w * TEXT_SIZE);
  const font = TEXT_FONTS[layer.font] || TEXT_FONTS.sans;
  ctx.save();
  ctx.font = `${font.weight} ${size}px ${font.family}`;
  ctx.textBaseline = 'middle';
  const lines = String(layer.text || '').split('\n');
  const lineH = Math.round(size * 1.2);
  const pad = Math.round(size * 0.35);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
  const boxW = widest + pad * 2;
  const x = Math.round(w * (layer.x ?? 0.5));
  const y = Math.round(h * (layer.y ?? 0.5));
  const align = layer.align || 'center';
  const left = align === 'left' ? x : align === 'right' ? x - boxW : x - boxW / 2;
  const top = y - (lines.length * lineH) / 2;
  if (layer.bg === 'box') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, left, top - pad / 2, boxW, lines.length * lineH + pad, Math.round(size * 0.25));
    ctx.fill();
  }
  ctx.fillStyle = layer.color || '#ffffff';
  ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  const tx = align === 'left' ? left + pad : align === 'right' ? left + boxW - pad : left + boxW / 2;
  if (layer.bg !== 'box') {
    ctx.lineWidth = Math.max(2, Math.round(size * 0.08));
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    lines.forEach((line, i) => { const ly = top + i * lineH + lineH / 2; ctx.strokeText(line, tx, ly); });
  }
  lines.forEach((line, i) => ctx.fillText(line, tx, top + i * lineH + lineH / 2));
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
