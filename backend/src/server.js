const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');
const { sequelize, seedGifts, Post, StoryView } = require('./db');
const { Op } = require('sequelize');
const cloudinary = require('./services/cloudinary');

const app = express();
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    const allowed = config.corsOrigins.some((entry) => {
      if (entry === normalized) return true;
      const star = entry.indexOf('*');
      if (star < 0 || entry.indexOf('*', star + 1) >= 0) return false;
      const prefix = entry.slice(0, star);
      const suffix = entry.slice(star + 1);
      if (!normalized.startsWith(prefix) || !normalized.endsWith(suffix)) return false;
      const middle = normalized.slice(prefix.length, normalized.length - suffix.length);
      return Boolean(middle) && !middle.includes('/');
    });
    callback(null, allowed);
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Api-Key', 'X-Requested-With'],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// Webhook first: it needs the raw body
app.use('/v1/webhooks', require('./routes/webhooks'));

app.use(compression());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (req, res) => res.status(200).json({ ok: true, service: 'rimsocial-api', timestamp: new Date().toISOString() }));
app.get('/ready', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({ ok: true, service: 'rimsocial-api', database: 'connected' });
  } catch (error) {
    res.status(503).json({ ok: false, service: 'rimsocial-api', database: 'unavailable' });
  }
});

// Upload file names are random UUIDs, so they can be cached for a long time.
// Express serves byte ranges, so video starts playing before the full file loads.
app.use('/uploads', express.static(path.resolve(config.uploadDir), { maxAge: '7d', immutable: true }));
if (config.serveFrontend) app.use(express.static(frontendDist));

app.use('/v1/auth', require('./routes/auth'));
app.use('/v1/posts', require('./routes/posts'));
app.use('/v1/feed', require('./routes/feed'));
app.use('/v1/stories', require('./routes/stories'));
app.use('/v1/users', require('./routes/users'));
app.use('/v1/search', require('./routes/search'));
app.use('/v1', require('./routes/gifts'));
app.use('/v1/creator', require('./routes/creator'));
app.use('/v1/business', require('./routes/business'));
app.use('/v1/live', require('./routes/live'));
app.use('/v1/admin', require('./routes/admin'));

app.use('/v1', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the SPA only in combined deployments. API-only deployments run independently.
if (config.serveFrontend) {
  app.get(/^\/(?!v1\/|uploads\/|health$|ready$).*/, (req, res, next) => {
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => err && next());
  });
}

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    err = Object.assign(new Error('File too large (max 100 MB)'), { status: 413, expose: true });
  }
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Server error' });
});

async function ensureDatabaseExists() {
  // MySQL cannot create the selected database via Sequelize if it does not exist.
  // Use the configured DB account and quote the database identifier safely.
  const connection = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.pass });
  try {
    const safeName = `\`${String(config.db.name).replace(/`/g, '``')}\``;
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${safeName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally { await connection.end(); }
}

async function start() {
  if (!config.jwtSecret || config.jwtSecret.length < 32 || /replace|change-this|paste-output/i.test(config.jwtSecret)) {
    throw new Error('JWT_SECRET must be set to a random secret of at least 32 characters. Copy backend/.env.example and set it before starting.');
  }
  if (config.nodeEnv === 'production') {
    const origins = config.corsOrigins;
    if (!process.env.CORS_ORIGINS || !origins.some((origin) => /^https:\/\//.test(origin))) {
      throw new Error('Production requires CORS_ORIGINS with at least one HTTPS frontend origin.');
    }
    if (config.createDatabase) throw new Error('AUTO_CREATE_DATABASE must be false in production.');
    if (config.syncDatabase) throw new Error('DB_SYNC must be false in production; apply schema migrations before deployment.');
  }
  if (config.createDatabase) await ensureDatabaseExists();
  await sequelize.authenticate();
  if (config.syncDatabase) await sequelize.sync();
  // Small additive upgrade for databases created by an earlier ClipVerse build.
  const qi = sequelize.getQueryInterface();
  const payoutColumns = await qi.describeTable('payouts');
  if (!payoutColumns.providerTransferCode) {
    await qi.addColumn('payouts', 'providerTransferCode', { type: require('sequelize').DataTypes.STRING(128), allowNull: true });
  }
  // Additive social-feature upgrade for existing installations. Never drop user content.
  const postColumns = await qi.describeTable('posts');
  if (!postColumns.repostCount) {
    await qi.addColumn('posts', 'repostCount', { type: require('sequelize').DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
  }
  if (!postColumns.visibility) {
    await qi.addColumn('posts', 'visibility', { type: require('sequelize').DataTypes.ENUM('public', 'private'), allowNull: false, defaultValue: 'public' });
  }
  // Additive paid-partnership fields for existing posts tables.
  const currentPostColumns = await qi.describeTable('posts');
  const DataTypes = require('sequelize').DataTypes;
  if (!currentPostColumns.mediaPublicId) await qi.addColumn('posts', 'mediaPublicId', { type: DataTypes.STRING(255), allowNull: true });
  if (!currentPostColumns.allowRemix) await qi.addColumn('posts', 'allowRemix', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  if (!currentPostColumns.sourcePostId) await qi.addColumn('posts', 'sourcePostId', { type: DataTypes.UUID, allowNull: true });
  if (!currentPostColumns.isSponsored) await qi.addColumn('posts', 'isSponsored', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  if (!currentPostColumns.sponsorName) await qi.addColumn('posts', 'sponsorName', { type: DataTypes.STRING(100), allowNull: true });
  if (!currentPostColumns.sponsorDescription) await qi.addColumn('posts', 'sponsorDescription', { type: DataTypes.STRING(200), allowNull: true });
  if (!currentPostColumns.sponsorCta) await qi.addColumn('posts', 'sponsorCta', { type: DataTypes.STRING(30), allowNull: true });
  if (!currentPostColumns.sponsorUrl) await qi.addColumn('posts', 'sponsorUrl', { type: DataTypes.STRING(1024), allowNull: true });
  await seedGifts();
  const purgeExpiredStories = async () => {
    const expired = await Post.findAll({ where: { isStory: true, expiresAt: { [Op.lt]: new Date() } }, attributes: ['id', 'mediaUrl', 'mediaPublicId', 'kind'], limit: 500 });
    if (!expired.length) return;
    const ids = expired.map((story) => story.id);
    await StoryView.destroy({ where: { storyId: ids } });
    await Post.destroy({ where: { id: ids } });
    for (const story of expired) {
      const publicId = story.mediaPublicId || cloudinary.publicIdFromUrl(story.mediaUrl);
      if (publicId) {
        const where = story.mediaPublicId ? { mediaPublicId: publicId, status: 'live' } : { mediaUrl: story.mediaUrl, status: 'live' };
        if (!(await Post.count({ where }))) {
          try { await cloudinary.deleteAsset(publicId, story.kind === 'video' ? 'video' : 'image'); }
          catch (error) { console.error('Expired story media cleanup failed:', publicId, error.message); }
        }
      }
    }
  };
  app.listen(config.port, () => console.log(`Clipverse API on http://localhost:${config.port}`));
  Promise.resolve().then(purgeExpiredStories).catch((e) => console.error('Initial story cleanup failed:', e.message));
  setInterval(() => purgeExpiredStories().catch((e) => console.error('Story cleanup failed:', e.message)), 10 * 60 * 1000).unref();
}

start().catch((e) => { console.error('Startup failed:', e); process.exit(1); });
