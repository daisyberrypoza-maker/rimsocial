import { api, ApiError } from '../api.js';

// Files above this size go up in 1 MB parts, so a dropped connection only costs one part.
export const CHUNKED_THRESHOLD = 8 * 1024 * 1024;

// Sessions are remembered per file for this browser tab, so retrying after a failure resumes instead of restarting.
const sessions = new Map();
const keyOf = (file) => [file.name, file.size, file.lastModified, file.type].join('|');

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

async function uploadOnce(file) {
  const key = keyOf(file);
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
  try {
    return await uploadOnce(file);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      sessions.delete(keyOf(file));
      return uploadOnce(file);
    }
    throw error;
  }
}

// Forget a file's session once its post or story is saved
export function forgetUpload(file) {
  sessions.delete(keyOf(file));
}
