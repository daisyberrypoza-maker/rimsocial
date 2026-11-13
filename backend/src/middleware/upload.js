const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

fs.mkdirSync(config.uploadDir, { recursive: true });

const ALLOWED = {
  'video/mp4': 'video', 'video/webm': 'video',
  'image/jpeg': 'photo', 'image/png': 'photo', 'image/webp': 'photo', 'image/gif': 'photo',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) =>
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 10 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED[file.mimetype])),
});

const kindFor = (mimetype) => ALLOWED[mimetype];
const mediaPath = (filename) => `/uploads/${filename}`;

// Chat attachments: any file type up to the same size limit (photos, videos, audio, documents, archives).
const anyFileUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) =>
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

// Chat attachment type shown in the conversation: photo, video, audio or file
function chatKindFor(mimetype = '') {
  if (/^image\//.test(mimetype)) return 'photo';
  if (/^video\//.test(mimetype)) return 'video';
  if (/^audio\//.test(mimetype)) return 'audio';
  return 'file';
}

module.exports = { upload, kindFor, mediaPath, anyFileUpload, chatKindFor };
