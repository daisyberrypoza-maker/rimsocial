// Music library: upload a track, list and search tracks. Files are stored like other media (Cloudinary, or local when not configured).
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { Op, AudioTrack, User } = require('../db');
const { requireAuth } = require('../middleware/auth');
const httpError = require('../utils/httpError');
const config = require('../config');
const cloudinary = require('../services/cloudinary');

const AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
  'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
]);

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => cb(null, AUDIO_TYPES.has(file.mimetype)),
});

const toDTO = (track) => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  mediaUrl: track.mediaUrl,
  createdAt: track.createdAt,
});

router.use(requireAuth);

// GET /v1/audio/search?q=... : tracks whose title or artist matches (newest first); no q lists the newest tracks
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const where = q ? { [Op.or]: [{ title: { [Op.like]: `%${q}%` } }, { artist: { [Op.like]: `%${q}%` } }] } : {};
    const rows = await AudioTrack.findAll({ where, order: [['createdAt', 'DESC']], limit: 40 });
    res.json({ items: rows.map(toDTO) });
  } catch (e) { next(e); }
});

// GET /v1/audio/:id
router.get('/:id', async (req, res, next) => {
  try {
    const track = await AudioTrack.findByPk(req.params.id);
    if (!track) throw httpError(404, 'Track not found');
    res.json(toDTO(track));
  } catch (e) { next(e); }
});

// POST /v1/audio  multipart: media (audio file), title, artist (optional; defaults to your name)
router.post('/', audioUpload.single('media'), async (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, 'Choose an MP3, M4A, AAC, WAV or OGG audio file');
    const title = String(req.body.title || '').trim();
    if (!title || title.length > 80) throw httpError(400, 'Title must be 1 to 80 characters');
    let artist = String(req.body.artist || '').trim();
    if (artist.length > 80) throw httpError(400, 'Artist must be 80 characters or fewer');
    if (!artist) {
      const user = await User.findByPk(req.user.id, { attributes: ['displayName', 'username'] });
      artist = user?.displayName || user?.username || 'Unknown artist';
    }
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/audio');
    const track = await AudioTrack.create({ uploadedById: req.user.id, title, artist, mediaUrl: asset.url });
    res.status(201).json(toDTO(track));
  } catch (e) { next(e); }
});

module.exports = router;
