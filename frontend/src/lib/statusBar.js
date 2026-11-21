// Sets the status bar colour on the web (theme-color) and in the Android app.
// The Android bridge takes a hex colour and chooses dark or light icons from its brightness.

export function isLightColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

export function setPageStatusColor(hex) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = hex;
  const bridge = window.RimStatus;
  if (!bridge) return;
  if (typeof bridge.setStatusColor === 'function') bridge.setStatusColor(hex);
  else if (typeof bridge.setLightBackground === 'function') bridge.setLightBackground(isLightColor(hex));
}

// Average colour of the top of a cover photo, or null when the image can't be read (for example cross-origin without CORS).
export function averageTopColor(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const rows = Math.max(1, Math.round(size * 0.12));
        const data = ctx.getImageData(0, 0, size, rows).data;
        let r = 0; let g = 0; let b = 0; let count = 0;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1; }
        const hex = (v) => Math.round(v / count).toString(16).padStart(2, '0');
        resolve(`#${hex(r)}${hex(g)}${hex(b)}`);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
