// Music library: upload a track, list and search tracks. Files are stored like other media (Cloudinary, or local when not configured).
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { Op, AudioTrack, User, Post, Follow } = require('../db');
const { fn, col } = require('sequelize');
const { musicTrackScore } = require('../services/formulas');
const { requireAuth } = require('../middleware/auth');
const httpError = require('../utils/httpError');
const config = require('../config');
const cloudinary = require('../services/cloudinary');
const { isAudioFile, fileSha256 } = require('../utils/audioFile');
const fs = require('fs');
const audius = require('../services/audius');

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => cb(null, isAudioFile(file)),
});

const toDTO = (track) => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  mediaUrl: track.mediaUrl,
  createdAt: track.createdAt,
});

router.use(requireAuth);

// GET /v1/audio/search?q=&offset=&limit=&seed=&original=1
// For You (no q, not original): the newest tracks are split into this listener's country and everywhere else.
// Each group is shuffled with a seed (stable while paging), then the two are interleaved 50/50.
// Other modes rank by story use and age. Every mode pages with offset/limit and returns hasMore.
const hashKey = (id, seed) => crypto.createHash('sha1').update(`${seed}:${id}`).digest('hex');

function interleave(first, second) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < first.length || j < second.length) {
    if (i < first.length) out.push(first[i++]);
    if (j < second.length) out.push(second[j++]);
  }
  return out;
}

router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const original = req.query.original === '1';
    const mixed = !q && !original;
    const offset = Math.min(10000, Math.max(0, parseInt(req.query.offset, 10) || 0));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const seed = String(req.query.seed || 'default').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'default';
    const where = { ...(q ? { [Op.or]: [{ title: { [Op.like]: `%${q}%` } }, { artist: { [Op.like]: `%${q}%` } }] } : {}), ...(original ? { uploadedById: req.user.id } : {}) };
    const rows = await AudioTrack.findAll({ where, order: [['createdAt', 'DESC']], limit: mixed ? 5000 : 200 });

    let ordered;
    if (mixed) {
      const uploaderIds = [...new Set(rows.map((row) => String(row.uploadedById)))];
      const uploaders = uploaderIds.length ? await User.findAll({ where: { id: uploaderIds }, attributes: ['id', 'country'], raw: true }) : [];
      const countryOf = new Map(uploaders.map((u) => [String(u.id), u.country]));
      const me = await User.findByPk(req.user.id, { attributes: ['country'], raw: true });
      const myCountry = me?.country || 'NG';
      const keyed = (list) => list.map((row) => ({ row, key: hashKey(row.id, seed) })).sort((a, b) => (a.key < b.key ? -1 : 1)).map((item) => item.row);
      const local = keyed(rows.filter((row) => countryOf.get(String(row.uploadedById)) === myCountry));
      const elsewhere = keyed(rows.filter((row) => countryOf.get(String(row.uploadedById)) !== myCountry));
      ordered = interleave(local, elsewhere);
    } else {
      // Music_Track_Score: uses in the last 24 hours (story music URLs), then age since release.
      // Completion, genre affinity and featured flags are not tracked yet, so they count as 0.
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const urls = rows.map((row) => row.mediaUrl);
      const useRows = urls.length ? await Post.findAll({
        attributes: ['musicUrl', [fn('COUNT', col('id')), 'n']],
        where: { isStory: true, musicUrl: urls, createdAt: { [Op.gt]: since } },
        group: ['musicUrl'], raw: true,
      }) : [];
      const uses = new Map(useRows.map((row) => [row.musicUrl, Number(row.n)]));
      const now = Date.now();
      ordered = rows.map((row) => ({
        row,
        score: musicTrackScore({
          uses24h: uses.get(row.mediaUrl) || 0,
          daysSinceRelease: (now - new Date(row.createdAt).getTime()) / (24 * 3600 * 1000),
        }),
      })).sort((a, b) => b.score - a.score || new Date(b.row.createdAt) - new Date(a.row.createdAt)).map((item) => item.row);
    }
    const page = ordered.slice(offset, offset + limit);
    res.json({ items: page.map((row) => toDTO(row)), hasMore: offset + limit < ordered.length, nextOffset: offset + limit });
  } catch (e) { next(e); }
});

// GET /v1/audio/network-trending: sounds used most in the last 7 days by the people you follow (stories and posts).
// Library sounds keep their library id; Audius sounds are streamed by id like the Audius catalogue.
router.get('/network-trending', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const follows = await Follow.findAll({ where: { followerId: req.user.id }, attributes: ['followeeId'], raw: true });
    const followeeIds = follows.map((row) => row.followeeId);
    const offset = Math.min(10000, Math.max(0, parseInt(req.query.offset, 10) || 0));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
    if (!followeeIds.length) return res.json({ items: [], hasMore: false, nextOffset: 0 });
    const posts = await Post.findAll({
      attributes: ['musicUrl', 'musicSource', 'audiusTrackId', 'musicTitle', 'artistName', 'artworkUrl'],
      where: {
        authorId: followeeIds,
        createdAt: { [Op.gt]: since },
        [Op.or]: [{ musicUrl: { [Op.ne]: null } }, { audiusTrackId: { [Op.ne]: null } }],
      },
      raw: true,
      limit: 2000,
    });
    const counts = new Map();
    for (const post of posts) {
      const isAudius = post.musicSource === 'audius' && post.audiusTrackId;
      const key = isAudius ? `a:${post.audiusTrackId}` : (post.musicUrl ? `l:${post.musicUrl}` : null);
      if (!key) continue;
      const entry = counts.get(key) || { uses: 0, post };
      entry.uses += 1;
      counts.set(key, entry);
    }
    const ranked = [...counts.values()].sort((a, b) => b.uses - a.uses);
    const top = ranked.slice(offset, offset + limit);
    const localUrls = top.filter((entry) => !(entry.post.musicSource === 'audius' && entry.post.audiusTrackId)).map((entry) => entry.post.musicUrl);
    const tracks = localUrls.length ? await AudioTrack.findAll({ where: { mediaUrl: localUrls } }) : [];
    const byUrl = new Map(tracks.map((track) => [track.mediaUrl, track]));
    const items = [];
    for (const { post } of top) {
      if (post.musicSource === 'audius' && post.audiusTrackId) {
        items.push({ id: post.audiusTrackId, title: post.musicTitle || 'Sound', artist: post.artistName || '', artwork: post.artworkUrl || null, source: 'audius' });
      } else {
        const track = byUrl.get(post.musicUrl);
        if (track) items.push({ ...toDTO(track), source: 'local' });
      }
    }
    res.json({ items, hasMore: offset + limit < ranked.length, nextOffset: offset + limit });
  } catch (e) { next(e); }
});

// Audius catalogue (streamed through the server; stream links are signed and short-lived, so they are never stored)
// GET /v1/audio/audius/trending?limit=20
router.get('/audius/trending', async (req, res, next) => {
  try {
    res.json({ items: await audius.trending(req.query.limit) });
  } catch (e) { next(e); }
});

// GET /v1/audio/audius/search?q=...&limit=20
router.get('/audius/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (!q) return res.json({ items: [] });
    res.json({ items: await audius.search(q, req.query.limit) });
  } catch (e) { next(e); }
});

// GET /v1/audio/audius/:id/stream  -> { url } fresh signed link for playback only
router.get('/audius/:id/stream', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ url: await audius.streamLink(req.params.id) });
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
router.post('/', audioUpload.single('media'), require('../middleware/verifyUpload').verifyUploads(['audio', 'video']), async (req, res, next) => {
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
    // The same file is never stored twice: return the sound that already exists
    const contentHash = await fileSha256(req.file.path);
    const existing = await AudioTrack.findOne({ where: { contentHash } });
    if (existing) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(200).json(toDTO(existing));
    }
    // Tracks are kept to 60 seconds: Cloudinary keeps only the first 60 seconds of the file
    const asset = await cloudinary.uploadFile(req.file, 'rimsocial/audio', { maxSeconds: 60 });
    const track = await AudioTrack.create({ uploadedById: req.user.id, title, artist, mediaUrl: asset.url, contentHash });
    res.status(201).json(toDTO(track));
  } catch (e) { next(e); }
});

module.exports = router;
