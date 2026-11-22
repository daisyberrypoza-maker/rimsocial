// Decides whether an uploaded file is audio. Phones and some browsers send MP3 and M4A
// as application/octet-stream or with no type, so the extension is checked as well.
const AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
  'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
]);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.mp4', '.aac', '.wav', '.ogg', '.oga', '.webm']);
const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

function isAudioFile({ mimetype = '', originalname = '' } = {}) {
  const type = String(mimetype).toLowerCase();
  if (AUDIO_TYPES.has(type)) return true;
  if (!GENERIC_TYPES.has(type)) return false;
  const ext = require('path').extname(String(originalname)).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

// SHA-256 of a file on disk, streamed so large uploads are not held in memory
function fileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = require('crypto').createHash('sha256');
    require('fs').createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

module.exports = { isAudioFile, AUDIO_TYPES, fileSha256 };
