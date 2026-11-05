const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');
const { sequelize, seedGifts } = require('./db');

const app = express();
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.disable('x-powered-by');

// Webhook first: it needs the raw body
app.use('/v1/webhooks', require('./routes/webhooks'));

app.use(compression());
app.use(cors({ origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)) }));
app.use(express.json({ limit: '64kb' }));

// Upload file names are random UUIDs, so they can be cached for a long time.
// Express serves byte ranges, so video starts playing before the full file loads.
app.use('/uploads', express.static(path.resolve(config.uploadDir), { maxAge: '7d', immutable: true }));
app.use(express.static(frontendDist));

app.use('/v1/auth', require('./routes/auth'));
app.use('/v1/posts', require('./routes/posts'));
app.use('/v1/feed', require('./routes/feed'));
app.use('/v1/stories', require('./routes/stories'));
app.use('/v1/users', require('./routes/users'));
app.use('/v1/search', require('./routes/search'));
app.use('/v1', require('./routes/gifts'));
app.use('/v1/creator', require('./routes/creator'));
app.use('/v1/admin', require('./routes/admin'));

app.use('/v1', (req, res) => res.status(404).json({ error: 'Not found' }));

// React Router routes return the app shell on reload
app.get(/^\/(?!v1\/|uploads\/).*/, (req, res, next) => {
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => err && next());
});

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
  await ensureDatabaseExists();
  await sequelize.authenticate();
  await sequelize.sync(); // creates missing tables automatically
  // Small additive upgrade for databases created by an earlier ClipVerse build.
  const qi = sequelize.getQueryInterface();
  const payoutColumns = await qi.describeTable('payouts');
  if (!payoutColumns.providerTransferCode) {
    await qi.addColumn('payouts', 'providerTransferCode', { type: require('sequelize').DataTypes.STRING(128), allowNull: true });
  }
  await seedGifts();
  app.listen(config.port, () => console.log(`Clipverse API on http://localhost:${config.port}`));
}

start().catch((e) => { console.error('Startup failed:', e); process.exit(1); });
