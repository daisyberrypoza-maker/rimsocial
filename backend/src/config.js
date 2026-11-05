require('dotenv').config();

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
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,https://localhost,capacitor://localhost')
    .split(',').map((o) => o.trim()).filter(Boolean),

  // Paging: small pages keep mobile data use low
  feedPageSize: 10,
  feedMaxPage: 30,

  // Stories
  storyTtlHours: 24,
  storyRailCacheSeconds: 30,

  // Uploads
  maxUploadBytes: 100 * 1024 * 1024,

  // Money: all amounts are minor units (kobo / cents)
  coinPriceMinor: 100, // 1 coin costs NGN 1.00
  coinValueMinor: 100, // 1 coin represents NGN 1.00 before the creator/platform split
  creatorGiftShare: 0.5,
  payoutHoldDays: 7,
  minPayoutMinor: 500000, // NGN 5,000 when currency is NGN
};
