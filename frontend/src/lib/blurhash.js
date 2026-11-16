// BlurHash (https://github.com/woltapp/blurhash): a short string that stands for a blurred image.
// Encoding runs on the sender's device; the receiver decodes it to a small picture while the photo loads.
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

const srgbToLinear = (value) => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (value) => {
  const v = Math.max(0, Math.min(1, value));
  const out = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, out)) * 255);
};
const signPow = (value, exp) => Math.sign(value) * Math.pow(Math.abs(value), exp);

function encode83(value, length) {
  let out = '';
  for (let i = 1; i <= length; i += 1) {
    const digit = Math.floor(value / Math.pow(83, length - i)) % 83;
    out += CHARS[digit];
  }
  return out;
}
function decode83(text) {
  let value = 0;
  for (const ch of text) {
    const digit = CHARS.indexOf(ch);
    if (digit < 0) return NaN;
    value = value * 83 + digit;
  }
  return value;
}

// Encode a canvas (the image is scaled to 32 x 32 first, so this stays fast). Components 4 x 3 is the default.
export function encodeBlurhash(canvas, xComponents = 4, yComponents = 3) {
  const small = document.createElement('canvas');
  small.width = 32;
  small.height = 32;
  const sctx = small.getContext('2d');
  sctx.drawImage(canvas, 0, 0, 32, 32);
  const { data } = sctx.getImageData(0, 0, 32, 32);
  const w = 32;
  const h = 32;
  const factors = [];
  for (let y = 0; y < yComponents; y += 1) {
    for (let x = 0; x < xComponents; x += 1) {
      const norm = x === 0 && y === 0 ? 1 : 2;
      let r = 0; let g = 0; let b = 0;
      for (let py = 0; py < h; py += 1) {
        for (let px = 0; px < w; px += 1) {
          const basis = Math.cos((Math.PI * x * px) / w) * Math.cos((Math.PI * y * py) / h);
          const i = (py * w + px) * 4;
          r += basis * srgbToLinear(data[i]);
          g += basis * srgbToLinear(data[i + 1]);
          b += basis * srgbToLinear(data[i + 2]);
        }
      }
      const scale = norm / (w * h);
      factors.push([r * scale, g * scale, b * scale]);
    }
  }
  const dc = factors[0];
  const ac = factors.slice(1);
  let hash = encode83((xComponents - 1) + (yComponents - 1) * 9, 1);
  const actualMax = ac.length ? Math.max(...ac.flat().map((v) => Math.abs(v))) : 0;
  const quantisedMax = Math.max(0, Math.min(82, Math.floor(actualMax * 166 - 0.5)));
  hash += encode83(ac.length ? quantisedMax : 0, 1);
  const maxValue = ac.length ? (quantisedMax + 1) / 166 : 1;
  const dcValue = (linearToSrgb(dc[0]) << 16) + (linearToSrgb(dc[1]) << 8) + linearToSrgb(dc[2]);
  hash += encode83(dcValue, 4);
  for (const [r, g, b] of ac) {
    const q = (v) => Math.max(0, Math.min(18, Math.floor(signPow(v / maxValue, 0.5) * 9 + 9.5)));
    hash += encode83(q(r) * 19 * 19 + q(g) * 19 + q(b), 2);
  }
  return hash;
}

// Decode to a data URL of a small picture (32 x 32 by default). Returns null for an invalid hash.
export function decodeBlurhash(hash, width = 32, height = 32) {
  if (typeof hash !== 'string' || hash.length < 6) return null;
  const sizeFlag = decode83(hash[0]);
  if (Number.isNaN(sizeFlag)) return null;
  const xComponents = (sizeFlag % 9) + 1;
  const yComponents = Math.floor(sizeFlag / 9) + 1;
  if (hash.length !== 4 + 2 * xComponents * yComponents) return null;
  const quantisedMax = decode83(hash[1]);
  const maxValue = ((quantisedMax + 1) / 166);
  const colors = [];
  const dc = decode83(hash.slice(2, 6));
  colors.push([srgbToLinear(dc >> 16), srgbToLinear((dc >> 8) & 255), srgbToLinear(dc & 255)]);
  for (let i = 1; i < xComponents * yComponents; i += 1) {
    const value = decode83(hash.slice(4 + i * 2, 6 + i * 2));
    const q = (part) => (Math.floor(value / part) % 19 - 9) / 9;
    const sq = (v) => signPow(v, 2) * maxValue;
    colors.push([sq(q(19 * 19)), sq(q(19)), sq(q(1))]);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0; let g = 0; let b = 0;
      for (let j = 0; j < yComponents; j += 1) {
        for (let i = 0; i < xComponents; i += 1) {
          const basis = Math.cos((Math.PI * i * x) / width) * Math.cos((Math.PI * j * y) / height);
          const c = colors[i + j * xComponents];
          r += c[0] * basis; g += c[1] * basis; b += c[2] * basis;
        }
      }
      const o = (y * width + x) * 4;
      image.data[o] = linearToSrgb(r);
      image.data[o + 1] = linearToSrgb(g);
      image.data[o + 2] = linearToSrgb(b);
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

// Hash for a photo file, computed from a small copy so it is quick on a phone. Null if the file cannot be read.
export async function blurhashOfFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 64 / bitmap.width, 64 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return encodeBlurhash(canvas);
  } catch {
    return null;
  }
}

// Placeholder pictures are decoded once per hash
const placeholders = new Map();
export function placeholderFor(hash) {
  if (!hash) return null;
  if (!placeholders.has(hash)) placeholders.set(hash, decodeBlurhash(hash));
  return placeholders.get(hash);
}
