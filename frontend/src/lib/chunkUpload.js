import { api, ApiError } from '../api.js';

// Files above this size go up in 1 MB parts, so a dropped connection only costs one part.
export const CHUNKED_THRESHOLD = 8 * 1024 * 1024;

// Sessions are remembered per file for this browser tab, so retrying after a failure resumes instead of restarting.
const sessions = new Map();
// Identifies a file by name, size, type and a SHA-256 of its first and last 64 KB. The timestamp is left out on purpose:
// photos are re-encoded before upload, which gives a new timestamp on every retry.
async function keyOf(file) {
  const edge = 64 * 1024;
  const head = new Uint8Array(await file.slice(0, edge).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - edge)).arrayBuffer());
  const joined = new Uint8Array(head.length + tail.length);
  joined.set(head, 0);
  joined.set(tail, head.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', joined));
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [file.name, file.size, file.type, hash].join('|');
}

export const needsChunks = (list) => list.some((file) => file.size > CHUNKED_THRESHOLD);

const RETRYABLE = new Set([0, 408, 429]);
const shouldRetry = (error) => error instanceof ApiError && (RETRYABLE.has(error.status) || error.status >= 500);

async function sendPart(uploadId, index, blob) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api(`/v1/uploads/${uploadId}/parts/${index}`, {
        method: 'PUT', body: blob, headers: { 'Content-Type': 'application/octet-stream' },
      });
    } catch (error) {
      if (attempt >= 3 || !shouldRetry(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
    }
  }
}

async function uploadOnce(file, key) {
  let session = sessions.get(key);
  if (!session) {
    const init = await api('/v1/uploads/init', {
      method: 'POST', body: { size: file.size, mimetype: file.type, originalname: file.name },
    });
    session = { uploadId: init.uploadId, chunkBytes: init.chunkBytes, totalChunks: init.totalChunks };
    sessions.set(key, session);
  }
  const status = await api(`/v1/uploads/${session.uploadId}`);
  if (status.status === 'consumed') {
    sessions.delete(key);
    throw new ApiError('This upload was already used. Start it again.', 409);
  }
  if (status.status === 'ready') return session.uploadId;
  const have = new Set(status.received || []);
  for (let index = 0; index < session.totalChunks; index += 1) {
    if (have.has(index)) continue;
    const start = index * session.chunkBytes;
    await sendPart(session.uploadId, index, file.slice(start, Math.min(file.size, start + session.chunkBytes)));
  }
  await api(`/v1/uploads/${session.uploadId}/complete`, { method: 'POST' });
  return session.uploadId;
}

// Uploads one file in parts and resolves to its upload id. A session that the server no longer knows is restarted once.
export async function uploadInChunks(file) {
  const key = await keyOf(file);
  try {
    return await uploadOnce(file, key);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      sessions.delete(key);
      return uploadOnce(file, key);
    }
    throw error;
  }
}

// Forget a file's session once its post or story is saved
export async function forgetUpload(file) {
  sessions.delete(await keyOf(file));
}
