// Checks what each uploaded file really is, after multer has saved it. Anything that is not
// one of the allowed kinds (photo, video, audio) is deleted and the request is refused.
// The stored name and Content-Type come from the detected type, never from the uploaded name.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const httpError = require('../utils/httpError');
const { detectMedia } = require('../utils/fileSignature');

function allFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return [];
}

function removeFiles(files) {
  for (const f of files) if (f && f.path) fs.promises.unlink(f.path).catch(() => {});
}

// kinds: an array (every file must be one of these) or an object keyed by form field name
function verifyUploads(kinds) {
  const allowedFor = (file) => (Array.isArray(kinds) ? kinds : (kinds[file.fieldname] || []));
  return async (req, res, next) => {
    const files = allFiles(req);
    if (!files.length) return next();
    try {
      const detected = [];
      for (const file of files) {
        const info = await detectMedia(file.path);
        if (!info || !allowedFor(file).includes(info.kind)) {
          throw httpError(415, 'That file is not a supported photo, video or audio file');
        }
        detected.push(info);
      }
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const info = detected[i];
        const name = crypto.randomUUID() + info.ext;
        const target = path.join(path.dirname(file.path), name);
        await fs.promises.rename(file.path, target);
        file.path = target;
        file.filename = name;
        file.mimetype = info.mime;
        file.detectedKind = info.kind;
      }
      return next();
    } catch (error) {
      removeFiles(files);
      return next(error);
    }
  };
}

module.exports = { verifyUploads };
