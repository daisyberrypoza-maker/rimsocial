require('dotenv').config();
const { parseEconomics } = require('./lib/economics');

const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));

module.exports = {
  port: num(process.env.PORT, 3000),
  jwtSecret: process.env.JWT_SECRET || '',
  db: {
    name: process.env.DB_NAME || 'clipverse',
    user: process.env.DB_USER || 'root',
    pass: process.env.DB_PASS || '',
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
  },
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  paystackSecret: process.env.PAYSTACK_SECRET || '',
  // TURN relay; TURN_SECRET enables short-lived coturn REST credentials.
  turnUrls: (process.env.TURN_URLS || '').split(',').map((url) => url.trim()).filter(Boolean),
  // LiveKit SFU for public creator broadcasts; secrets stay server-side.
  livekitUrl: process.env.LIVEKIT_URL || '',
  livekitApiKey: process.env.LIVEKIT_API_KEY || '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
  turnSecret: process.env.TURN_SECRET || '',
  turnUsername: process.env.TURN_USERNAME || '',
  turnPassword: process.env.TURN_PASSWORD || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,https://localhost,capacitor://localhost,ionic://localhost')
    .split(',').map((o) => { const value = o.trim(); return value.endsWith('/') ? value.slice(0, -1) : value; }).filter(Boolean),
  serveFrontend: !['false', '0', 'no'].includes(String(process.env.SERVE_FRONTEND || 'true').toLowerCase()),
  trustProxy: num(process.env.TRUST_PROXY, 0),
  createDatabase: process.env.AUTO_CREATE_DATABASE === undefined ? process.env.NODE_ENV !== 'production' : process.env.AUTO_CREATE_DATABASE === 'true',
  syncDatabase: process.env.DB_SYNC === undefined ? process.env.NODE_ENV !== 'production' : process.env.DB_SYNC === 'true',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Paging: small pages keep mobile data use low
  feedPageSize: 10,
  feedMaxPage: 30,

  // Stories
  storyTtlHours: 24,
  storyRailCacheSeconds: 30,

  // Uploads
  maxUploadBytes: 100 * 1024 * 1024,

  // Draft NGN web coin packs. Prices are configuration, not a public price commitment.
  // All values use kobo; only NGN is enabled until provider/account eligibility is verified.
  coinPacks: [
    { id: 'ngn-80', coins: 80, amountMinor: 110000, currency: 'NGN', enabled: true },
    { id: 'ngn-400', coins: 400, amountMinor: 530000, currency: 'NGN', enabled: true },
    { id: 'ngn-800', coins: 800, amountMinor: 1040000, currency: 'NGN', enabled: true },
    { id: 'ngn-4000', coins: 4000, amountMinor: 5000000, currency: 'NGN', enabled: true },
  ],
  // Money amounts are minor units (kobo/cents); defaults preserve previous behavior.
  ...parseEconomics(process.env),
  // Unanswered LIVE match invitation expiry (hours).
  matchInviteTtlHours: num(process.env.MATCH_INVITE_TTL_HOURS, 24),
};
