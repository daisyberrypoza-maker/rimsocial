// Music library: upload a track, list and search tracks. Files are stored like other media (Cloudinary, or local when not configured).
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { Op, AudioTrack, User, Post } = require('../db');
const { fn, col } = require('sequelize');
const { musicTrackScore } = require('../services/formulas');
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
    const rows = await AudioTrack.findAll({ where, order: [['createdAt', 'DESC']], limit: 200 });
    // Music_Track_Score: uses in the last 24 hours (story music URLs), then age since release.
    // Completion, genre affinity and featured flags are not tracked yet, so they count as 0.
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const urls = rows.map((row) => row.mediaUrl);
    const useRows = urls.length ? await Post.findAll({
      attributes: ['musicUrl', [fn('COUNT', col('id')), 'n']],
      where: { isStory: false, status: 'live', visibility: 'public', musicUrl: urls, createdAt: { [Op.gt]: since } },
      group: ['musicUrl'], raw: true,
    }) : [];
    const uses = new Map(useRows.map((row) => [row.musicUrl, Number(row.n)]));
    const now = Date.now();
    const ranked = rows.map((row) => ({
      row,
      score: musicTrackScore({
        uses24h: uses.get(row.mediaUrl) || 0,
        daysSinceRelease: (now - new Date(row.createdAt).getTime()) / (24 * 3600 * 1000),
      }),
    })).sort((a, b) => b.score - a.score || new Date(b.row.createdAt) - new Date(a.row.createdAt));
    res.json({ items: ranked.slice(0, 40).map((item) => toDTO(item.row)) });
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
    // Tracks are kept to 60 seconds: Cloudinary keeps only the first 60 seconds of the file
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/audio', { maxSeconds: 60 });
    const track = await AudioTrack.create({ uploadedById: req.user.id, title, artist, mediaUrl: asset.url });
    res.status(201).json(toDTO(track));
  } catch (e) { next(e); }
});

module.exports = router;
