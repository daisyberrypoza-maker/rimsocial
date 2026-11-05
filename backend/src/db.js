const { Sequelize, DataTypes, Op } = require('sequelize');
const config = require('./config');

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.pass, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'mysql',
  logging: false,
  dialectOptions: { supportBigNumbers: true, bigNumberStrings: false },
  pool: { max: 20, min: 2, acquire: 30000, idle: 10000 },
});

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  username: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  displayName: { type: DataTypes.STRING(64), allowNull: false },
  avatarUrl: DataTypes.STRING(512),
  country: { type: DataTypes.CHAR(2), allowNull: false },
  isCreator: { type: DataTypes.BOOLEAN, defaultValue: false },
  followerCount: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'users' });

// Regular posts and stories share one table. Stories have isStory = true and expire.
const Post = sequelize.define('Post', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  authorId: { type: DataTypes.UUID, allowNull: false },
  kind: { type: DataTypes.ENUM('video', 'photo'), allowNull: false },
  mediaUrl: { type: DataTypes.STRING(512), allowNull: false },
  thumbUrl: DataTypes.STRING(512),
  caption: { type: DataTypes.STRING(500), defaultValue: '' },
  status: { type: DataTypes.ENUM('live', 'removed'), defaultValue: 'live' },
  isStory: { type: DataTypes.BOOLEAN, defaultValue: false },
  expiresAt: DataTypes.DATE,
  viewCount: { type: DataTypes.BIGINT, defaultValue: 0 },
  likeCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  repostCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  visibility: { type: DataTypes.ENUM('public', 'private'), allowNull: false, defaultValue: 'public' },
  giftCoins: { type: DataTypes.BIGINT, defaultValue: 0 },
}, {
  tableName: 'posts',
  indexes: [
    { fields: ['authorId', 'createdAt'] },
    { fields: ['status', 'isStory', 'createdAt', 'id'] },   // feed and explore paging
    { fields: ['isStory', 'expiresAt'] },                   // story rail and expiry purge
  ],
});

const PostLike = sequelize.define('PostLike', {
  postId: { type: DataTypes.UUID, primaryKey: true },
  userId: { type: DataTypes.UUID, primaryKey: true },
}, { tableName: 'post_likes', indexes: [{ fields: ['userId'] }] });

const PostComment = sequelize.define('PostComment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  postId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: false },
  body: { type: DataTypes.STRING(1000), allowNull: false },
}, { tableName: 'post_comments', indexes: [{ fields: ['postId', 'createdAt'] }, { fields: ['userId', 'createdAt'] }] });

const Repost = sequelize.define('Repost', {
  postId: { type: DataTypes.UUID, primaryKey: true },
  userId: { type: DataTypes.UUID, primaryKey: true },
}, { tableName: 'reposts', indexes: [{ fields: ['userId', 'createdAt'] }] });

const Follow = sequelize.define('Follow', {
  followerId: { type: DataTypes.UUID, primaryKey: true },
  followeeId: { type: DataTypes.UUID, primaryKey: true },
}, { tableName: 'follows', indexes: [{ fields: ['followeeId'] }] });

// One row per viewer per story, so story view counts are not inflated
const StoryView = sequelize.define('StoryView', {
  storyId: { type: DataTypes.UUID, primaryKey: true },
  viewerId: { type: DataTypes.UUID, primaryKey: true },
}, { tableName: 'story_views' });

const Wallet = sequelize.define('Wallet', {
  userId: { type: DataTypes.UUID, primaryKey: true },
  coinBalance: { type: DataTypes.BIGINT, defaultValue: 0 },
}, { tableName: 'wallets' });

const EarningsWallet = sequelize.define('EarningsWallet', {
  userId: { type: DataTypes.UUID, primaryKey: true },
  balanceMinor: { type: DataTypes.BIGINT, defaultValue: 0 },
  heldMinor: { type: DataTypes.BIGINT, defaultValue: 0 },
}, { tableName: 'earnings_wallets' });

const Gift = sequelize.define('Gift', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(64), allowNull: false },
  coinPrice: { type: DataTypes.INTEGER, allowNull: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'gifts' });

const GiftTransaction = sequelize.define('GiftTransaction', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  senderId: { type: DataTypes.UUID, allowNull: false },
  creatorId: { type: DataTypes.UUID, allowNull: false },
  postId: { type: DataTypes.UUID, allowNull: false },
  giftId: { type: DataTypes.INTEGER, allowNull: false },
  coins: { type: DataTypes.INTEGER, allowNull: false },
  creatorMinor: { type: DataTypes.BIGINT, allowNull: false },
  idempotencyKey: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  released: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'gift_transactions' });

const LedgerEntry = sequelize.define('LedgerEntry', {
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  kind: { type: DataTypes.STRING(32), allowNull: false },
  deltaMinor: { type: DataTypes.BIGINT, allowNull: false },
  refId: { type: DataTypes.STRING(64), allowNull: true },
}, { tableName: 'ledger_entries', indexes: [{ unique: true, fields: ['kind', 'refId'] }] });

const Payout = sequelize.define('Payout', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  amountMinor: { type: DataTypes.BIGINT, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'paid', 'failed'), defaultValue: 'pending' },
  providerRef: DataTypes.STRING(128),
  providerTransferCode: DataTypes.STRING(128),
}, { tableName: 'payouts' });


// Auditable creator payout requests. Transfers remain pending until an operator
// verifies the creator's payout destination and marks the transfer paid.
const PayoutProfile = sequelize.define('PayoutProfile', {
  userId: { type: DataTypes.UUID, primaryKey: true },
  country: { type: DataTypes.CHAR(2), allowNull: false, defaultValue: 'NG' },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'NGN' },
  provider: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'paystack' },
  recipientCode: { type: DataTypes.STRING(128), allowNull: true },
  verified: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'payout_profiles' });

const LiveMatch = sequelize.define('LiveMatch', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hostId: { type: DataTypes.UUID, allowNull: false },
  opponentId: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'active', 'ended', 'cancelled'), defaultValue: 'pending' },
  hostScore: { type: DataTypes.INTEGER, defaultValue: 0 },
  opponentScore: { type: DataTypes.INTEGER, defaultValue: 0 },
  startsAt: DataTypes.DATE,
  endsAt: DataTypes.DATE,
}, { tableName: 'live_matches', indexes: [{ fields: ['status', 'createdAt'] }, { fields: ['hostId', 'status'] }, { fields: ['opponentId', 'status'] }] });

const LiveSignal = sequelize.define('LiveSignal', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  matchId: { type: DataTypes.UUID, allowNull: false },
  senderId: { type: DataTypes.UUID, allowNull: false },
  kind: { type: DataTypes.ENUM('offer', 'answer', 'candidate'), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
}, { tableName: 'live_signals', indexes: [{ fields: ['matchId', 'createdAt'] }, { fields: ['senderId', 'createdAt'] }] });

const ContentEarning = sequelize.define('ContentEarning', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  creatorId: { type: DataTypes.UUID, allowNull: false },
  postId: { type: DataTypes.UUID, allowNull: true },
  source: { type: DataTypes.ENUM('gift', 'ad_share', 'promotion', 'premium'), allowNull: false },
  amountMinor: { type: DataTypes.BIGINT, allowNull: false },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'NGN' },
  status: { type: DataTypes.ENUM('pending', 'released', 'reversed'), defaultValue: 'pending' },
  reference: { type: DataTypes.STRING(128), allowNull: false, unique: true },
}, { tableName: 'content_earnings', indexes: [{ fields: ['creatorId', 'createdAt'] }] });

User.hasMany(Post, { foreignKey: 'authorId' });
Post.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
PostComment.belongsTo(User, { as: 'author', foreignKey: 'userId' });
Post.hasMany(PostComment, { as: 'comments', foreignKey: 'postId' });

async function seedGifts() {
  if (await Gift.count()) return;
  await Gift.bulkCreate([
    { name: 'Rose', coinPrice: 10 },
    { name: 'Star', coinPrice: 100 },
    { name: 'Rocket', coinPrice: 1000 },
  ]);
}

module.exports = {
  sequelize, Op, User, Post, PostLike, PostComment, Repost, Follow, StoryView, Wallet, EarningsWallet,
  Gift, GiftTransaction, LedgerEntry, Payout, PayoutProfile, LiveMatch, LiveSignal, ContentEarning, seedGifts,
};
