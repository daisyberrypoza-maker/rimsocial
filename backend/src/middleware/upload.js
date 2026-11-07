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
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED[file.mimetype])),
});

const kindFor = (mimetype) => ALLOWED[mimetype];
const mediaPath = (filename) => `/uploads/${filename}`;

module.exports = { upload, kindFor, mediaPath };
