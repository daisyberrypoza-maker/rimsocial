// Chunked uploads: the client sends a file in 1 MB parts, the server stores each part on disk,
// then assembles them into the same kind of file multer writes, so post and story routes can
// hand it to Cloudinary (or the local folder) exactly as they do for a normal upload.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const httpError = require('../utils/httpError');
const { ALLOWED } = require('../middleware/upload');
const { detectMedia } = require('../utils/fileSignature');
const redis = require('../redis');

// Each person can start this many chunked uploads in a day. This bounds the disk a single account can fill.
const MAX_STARTS_PER_DAY = 60;

// Per-session lock, so two completes for the same upload cannot assemble the file at the same time
const locks = new Map();
function withLock(id, task) {
  const previous = locks.get(id) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  const settled = run.catch(() => {});
  locks.set(id, settled);
  settled.then(() => { if (locks.get(id) === settled) locks.delete(id); });
  return run;
}

const CHUNK_BYTES = 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const uploadRoot = () => path.resolve(config.uploadDir);
const sessionsRoot = () => path.join(uploadRoot(), '.chunks');
const dirFor = (id) => path.join(sessionsRoot(), id);
const metaPath = (id) => path.join(dirFor(id), 'meta.json');
const partPath = (id, index) => path.join(dirFor(id), String(index));

async function readMeta(id, userId) {
  if (!ID_PATTERN.test(String(id))) throw httpError(404, 'Upload not found');
  let meta;
  try { meta = JSON.parse(await fs.promises.readFile(metaPath(id), 'utf8')); }
  catch { throw httpError(404, 'Upload not found'); }
  if (meta.userId !== userId) throw httpError(404, 'Upload not found');
  return meta;
}

async function writeMeta(meta) {
  const target = metaPath(meta.id);
  const tmp = `${target}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(meta));
  await fs.promises.rename(tmp, target);
}

async function receivedParts(id) {
  const names = await fs.promises.readdir(dirFor(id)).catch(() => []);
  return names.filter((name) => /^\d+$/.test(name)).map(Number).sort((a, b) => a - b);
}

async function startSession(userId, { size, mimetype, originalname }) {
  // If Redis is slow or down, do not block uploads: the daily cap simply does not apply for that request
  const key = `uploads:starts:${userId}`;
  const starts = await Promise.race([
    redis.incr(key).then(async (count) => { if (count === 1) await redis.expire(key, 24 * 3600).catch(() => {}); return count; }).catch(() => 0),
    new Promise((resolve) => setTimeout(() => resolve(0), 500).unref()),
  ]);
  if (starts > MAX_STARTS_PER_DAY) throw httpError(429, 'You are uploading too many files. Please try again later.');
  if (typeof mimetype !== 'string' || !Object.prototype.hasOwnProperty.call(ALLOWED, mimetype)) {
    throw httpError(400, 'Upload an mp4, webm, jpg, png, webp or gif file');
  }
  const total = Number(size);
  if (!Number.isSafeInteger(total) || total <= 0) throw httpError(400, 'Invalid file size');
  if (total > config.maxUploadBytes) throw httpError(413, 'This file is too large. Please choose a smaller file.');
  const ext = path.extname(String(originalname || '')).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
  const id = crypto.randomUUID();
  const meta = {
    id, userId, size: total, mimetype, ext,
    chunkBytes: CHUNK_BYTES, totalChunks: Math.ceil(total / CHUNK_BYTES),
    status: 'uploading', createdAt: Date.now(),
  };
  await fs.promises.mkdir(dirFor(id), { recursive: true });
  await writeMeta(meta);
  return { uploadId: id, chunkBytes: CHUNK_BYTES, totalChunks: meta.totalChunks };
}

async function sessionStatus(id, userId) {
  const meta = await readMeta(id, userId);
  return { uploadId: id, status: meta.status, totalChunks: meta.totalChunks, received: meta.status === 'uploading' ? await receivedParts(id) : [] };
}

async function storePart(id, userId, index, buffer) {
  const meta = await readMeta(id, userId);
  if (meta.status !== 'uploading') throw httpError(409, 'This upload is already complete');
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= meta.totalChunks) throw httpError(400, 'Invalid part number');
  const expected = i === meta.totalChunks - 1 ? meta.size - CHUNK_BYTES * (meta.totalChunks - 1) : CHUNK_BYTES;
  if (buffer.length !== expected) throw httpError(400, 'Part has the wrong size');
  const target = partPath(id, i);
  const tmp = `${target}.${crypto.randomUUID()}.part`;
  await fs.promises.writeFile(tmp, buffer);
  await fs.promises.rename(tmp, target);
  return { index: i };
}

async function completeSession(id, userId) {
  return withLock(id, () => assemble(id, userId));
}

async function assemble(id, userId) {
  const meta = await readMeta(id, userId);
  if (meta.status === 'ready') return { uploadId: id, size: meta.size };
  if (meta.status !== 'uploading') throw httpError(409, 'This upload was already used');
  const parts = await receivedParts(id);
  if (parts.length !== meta.totalChunks) throw httpError(409, 'Some parts are still missing. Resume the upload.');

  const filename = crypto.randomUUID() + meta.ext;
  const finalPath = path.join(uploadRoot(), filename);
  const tmp = `${finalPath}.${crypto.randomUUID()}.assembling`;
  const handle = await fs.promises.open(tmp, 'w');
  try {
    for (let i = 0; i < meta.totalChunks; i += 1) {
      await handle.write(await fs.promises.readFile(partPath(id, i)));
    }
  } finally {
    await handle.close();
  }
  const { size } = await fs.promises.stat(tmp);
  if (size !== meta.size) {
    await fs.promises.unlink(tmp).catch(() => {});
    throw httpError(409, 'The file did not assemble correctly. Start the upload again.');
  }
  await fs.promises.rename(tmp, finalPath);
  for (let i = 0; i < meta.totalChunks; i += 1) await fs.promises.unlink(partPath(id, i)).catch(() => {});
  await writeMeta({ ...meta, status: 'ready', filename });
  return { uploadId: id, size };
}

// Hands a finished upload to a post or story route as a multer-shaped file object.
// The route calls release() once the post is saved; a failed request leaves it for the sweeper.
async function consumeSession(id, userId) {
  const meta = await readMeta(id, userId);
  if (meta.status !== 'ready') throw httpError(409, 'Finish uploading the file first');
  const assembled = path.join(uploadRoot(), meta.filename);
  // Check the assembled bytes, not the name or type the client sent
  const info = await detectMedia(assembled).catch(() => null);
  if (!info || (info.kind !== 'photo' && info.kind !== 'video')) {
    await fs.promises.unlink(assembled).catch(() => {});
    await releaseSession(id);
    throw httpError(415, 'That file is not a supported photo or video');
  }
  const name = crypto.randomUUID() + info.ext;
  await fs.promises.rename(assembled, path.join(uploadRoot(), name));
  await writeMeta({ ...meta, status: 'consumed', filename: name, mimetype: info.mime });
  return {
    path: path.join(uploadRoot(), name),
    filename: name,
    mimetype: info.mime,
    originalname: `upload${info.ext}`,
    size: meta.size,
  };
}

async function releaseSession(id) {
  if (!ID_PATTERN.test(String(id))) return;
  await withLock(id, () => fs.promises.rm(dirFor(id), { recursive: true, force: true })).catch(() => {});
}

// Removes sessions older than a day, along with any assembled file that was never used.
async function sweepSessions() {
  const names = await fs.promises.readdir(sessionsRoot()).catch(() => []);
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const id of names) {
    if (!ID_PATTERN.test(id)) continue;
    let meta = null;
    try { meta = JSON.parse(await fs.promises.readFile(metaPath(id), 'utf8')); } catch { /* no meta: drop it */ }
    if (meta && meta.createdAt > cutoff) continue;
    if (meta?.filename) await fs.promises.unlink(path.join(uploadRoot(), meta.filename)).catch(() => {});
    await releaseSession(id);
  }
}

if (process.env.NODE_ENV !== 'test') {
  const timer = setInterval(() => sweepSessions().catch((error) => console.error('Upload sweep failed:', error.message)), 60 * 60 * 1000);
  timer.unref();
}

module.exports = { CHUNK_BYTES, startSession, sessionStatus, storePart, completeSession, consumeSession, releaseSession, sweepSessions };
