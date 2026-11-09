const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

function credentials() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
    error.status = 503;
    error.expose = true;
    throw error;
  }
  return { cloudName, apiKey, apiSecret };
}
function signature(params, secret) {
  const canonical = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return crypto.createHash('sha1').update(canonical + secret).digest('hex');
}
function request(url, body, contentType) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': contentType, 'Content-Length': body.length } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let payload;
        try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reject(new Error('Cloudinary returned an invalid response')); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(payload.error?.message || 'Cloudinary request failed');
          error.status = 502;
          error.expose = true;
          return reject(error);
        }
        resolve(payload);
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}
function multipart(fields, file) {
  const boundary = '----RimSocial' + crypto.randomBytes(16).toString('hex');
  const chunks = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    const filename = path.basename(file.originalname || 'upload').replace(/"/g, '');
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${file.mimetype || 'application/octet-stream'}\r\n\r\n`));
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
function isConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}
// Until Cloudinary credentials exist, keep the file in the local upload folder and serve it from /uploads.
// Once the CLOUDINARY_* variables are set, new uploads go to Cloudinary automatically.
async function storeLocally(file) {
  const resourceType = String(file.mimetype || '').startsWith('video/') ? 'video' : 'image';
  let filename = file.filename;
  if (!filename || !file.path) {
    const config = require('../config');
    fs.mkdirSync(config.uploadDir, { recursive: true });
    filename = crypto.randomUUID() + path.extname(file.originalname || '').toLowerCase();
    await fs.promises.writeFile(path.join(config.uploadDir, filename), file.buffer);
  }
  return { url: `/uploads/${filename}`, publicId: null, resourceType };
}
async function uploadFile(file, folder = 'rimsocial', options = {}) {
  if (!file) throw new Error('Missing uploaded file');
  if (!isConfigured()) return storeLocally(file);
  try {
    const { cloudName, apiKey, apiSecret } = credentials();
    // Audio is stored as a Cloudinary 'video' resource, which is how Cloudinary handles sound files
    const resourceType = /^(video|audio)\//.test(String(file.mimetype || '')) ? 'video' : 'image';
    const params = { folder, timestamp: String(Math.floor(Date.now() / 1000)) };
    // Cloudinary keeps only the first N seconds of a video (server-side safety net for the browser trim).
    if (resourceType === 'video' && options.maxSeconds) params.transformation = `du_${Math.floor(options.maxSeconds)}`;
    const fields = { ...params, api_key: apiKey, signature: signature(params, apiSecret) };
    const buffer = file.buffer || await fs.promises.readFile(file.path);
    const form = multipart(fields, { ...file, buffer });
    const result = await request(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, form.body, form.contentType);
    return { url: result.secure_url, publicId: result.public_id, resourceType: result.resource_type };
  } finally {
    if (file.path) await fs.promises.unlink(file.path).catch(() => {});
  }
}
async function deleteAsset(publicId, resourceType = 'image') {
  if (!publicId) return;
  const { cloudName, apiKey, apiSecret } = credentials();
  const params = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const form = multipart({ ...params, api_key: apiKey, signature: signature(params, apiSecret) });
  const result = await request(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType || 'image'}/destroy`, form.body, form.contentType);
  return result.result;
}
function publicIdFromUrl(url) {
  if (!url || !/res\.cloudinary\.com\//.test(url)) return null;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex < 0) return null;
    const publicId = parts.slice(uploadIndex + 1).filter((p) => !/^v\d+$/.test(p)).join('/').replace(/\.[^.]+$/, '');
    return publicId || null;
  } catch { return null; }
}
module.exports = { uploadFile, deleteAsset, publicIdFromUrl, isConfigured };
