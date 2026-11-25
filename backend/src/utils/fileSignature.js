// Decides what a file really is from its first bytes (its "magic numbers"), not from its name or the
// Content-Type the browser sent. A script renamed to .jpg has no image header, so it is refused.
const fs = require('fs');

const HEAD_BYTES = 64;

function ascii(buf, start, length) {
  return buf.subarray(start, start + length).toString('latin1');
}

function found(kind, mime, ext) {
  return { kind, mime, ext };
}

const VIDEO_BRANDS = new Set(['isom', 'iso2', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', '3gp4', '3gp5', '3gp6', 'dash', 'mmp4', 'qt  ']);
const AUDIO_BRANDS = new Set(['M4A ', 'M4B ']);

// Returns { kind: 'photo' | 'video' | 'audio', mime, ext } or null when the bytes are not a supported media type
function detectFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return found('photo', 'image/jpeg', '.jpg');
  if (buf[0] === 0x89 && ascii(buf, 1, 3) === 'PNG' && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return found('photo', 'image/png', '.png');
  const gif = ascii(buf, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return found('photo', 'image/gif', '.gif');
  if (ascii(buf, 0, 4) === 'RIFF') {
    const form = ascii(buf, 8, 4);
    if (form === 'WEBP') return found('photo', 'image/webp', '.webp');
    if (form === 'WAVE') return found('audio', 'audio/wav', '.wav');
    return null;
  }
  if (ascii(buf, 0, 4) === 'OggS') return found('audio', 'audio/ogg', '.ogg');
  // EBML header: WebM (or Matroska) video or audio
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return found('video', 'video/webm', '.webm');
  if (ascii(buf, 0, 3) === 'ID3') return found('audio', 'audio/mpeg', '.mp3');
  // MPEG audio frame: sync bits, then a valid layer
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && ((buf[1] >> 1) & 3) !== 0) return found('audio', 'audio/mpeg', '.mp3');
  // AAC (ADTS) frame
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return found('audio', 'audio/aac', '.aac');
  if (ascii(buf, 4, 4) === 'ftyp') {
    const brand = ascii(buf, 8, 4);
    if (AUDIO_BRANDS.has(brand)) return found('audio', 'audio/mp4', '.m4a');
    if (VIDEO_BRANDS.has(brand)) return found('video', 'video/mp4', '.mp4');
    return null;
  }
  return null;
}

// Reads the first bytes of a file on disk and detects it
async function detectMedia(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buf, 0, HEAD_BYTES, 0);
    return detectFromBuffer(buf.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

module.exports = { detectMedia, detectFromBuffer };
