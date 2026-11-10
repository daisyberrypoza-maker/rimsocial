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
  coverUrl: DataTypes.STRING(512),
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
  mediaPublicId: { type: DataTypes.STRING(255), allowNull: true },
  allowRemix: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sourcePostId: { type: DataTypes.UUID, allowNull: true },
  thumbUrl: DataTypes.STRING(512),
  caption: { type: DataTypes.STRING(500), defaultValue: '' },
  topic: { type: DataTypes.STRING(60), allowNull: true },
  aiLabel: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  status: { type: DataTypes.ENUM('live', 'removed'), defaultValue: 'live' },
  isStory: { type: DataTypes.BOOLEAN, defaultValue: false },
  expiresAt: DataTypes.DATE,
  viewCount: { type: DataTypes.BIGINT, defaultValue: 0 },
  likeCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  repostCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  visibility: { type: DataTypes.ENUM('public', 'private'), allowNull: false, defaultValue: 'public' },
  isSponsored: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sponsorName: { type: DataTypes.STRING(100), allowNull: true },
  sponsorDescription: { type: DataTypes.STRING(200), allowNull: true },
  sponsorCta: { type: DataTypes.STRING(30), allowNull: true },
  sponsorUrl: { type: DataTypes.STRING(1024), allowNull: true },
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
  // notifyPosts column is added by migrations/025 — the model field is enabled once it is applied (see routes/users.js)
}, { tableName: 'follows', indexes: [{ fields: ['followeeId'] }] });

// Music library: uploaded audio tracks (migrations/029)
const AudioTrack = sequelize.define('AudioTrack', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  uploadedById: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING(80), allowNull: false },
  artist: { type: DataTypes.STRING(80), allowNull: false },
  mediaUrl: { type: DataTypes.STRING(512), allowNull: false },
}, { tableName: 'audio_tracks' });

// One row per viewer per story, so story view counts are not inflated
const StoryView = sequelize.define('StoryView', {
  storyId: { type: DataTypes.UUID, primaryKey: true },
  viewerId: { type: DataTypes.UUID, primaryKey: true },
}, { tableName: 'story_views' });

// One row per viewer who liked a story (migrations/026)
const StoryLike = sequelize.define('StoryLike', {
  postId: { type: DataTypes.UUID, primaryKey: true },
  userId: { type: DataTypes.UUID, primaryKey: true },
}, { tableName: 'story_likes', indexes: [{ fields: ['userId'] }] });

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
  liveMatchId: { type: DataTypes.UUID, allowNull: true },
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
  // Monetary entries use minor currency units; coin movements use deltaCoins.
  deltaMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  deltaCoins: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
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

const LiveBroadcast = sequelize.define('LiveBroadcast', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  hostId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING(120), allowNull: false },
  status: { type: DataTypes.ENUM('live', 'ended'), allowNull: false, defaultValue: 'live' },
  viewerCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  startedAt: { type: DataTypes.DATE, allowNull: false },
  endedAt: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'live_broadcasts', timestamps: true, indexes: [{ fields: ['status', 'startedAt'] }, { fields: ['hostId', 'status'] }] });

const LiveBroadcastMessage = sequelize.define('LiveBroadcastMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  broadcastId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: false },
  body: { type: DataTypes.STRING(500), allowNull: false },
}, { tableName: 'live_broadcast_messages', indexes: [{ fields: ['broadcastId', 'createdAt'] }, { fields: ['userId', 'createdAt'] }] });

const UserBlock = sequelize.define('UserBlock', {
  blockerId: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
  blockedUserId: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
}, { tableName: 'user_blocks', indexes: [{ fields: ['blockedUserId'] }] });

const PostReport = sequelize.define('PostReport', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  postId: { type: DataTypes.UUID, allowNull: false },
  reporterId: { type: DataTypes.UUID, allowNull: false },
  reason: { type: DataTypes.STRING(500), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'reviewed', 'dismissed'), defaultValue: 'pending' },
}, { tableName: 'post_reports', indexes: [{ fields: ['postId', 'createdAt'] }, { fields: ['reporterId', 'createdAt'] }] });

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

// Find, Flip & Fix: additive marketplace/workflow tables. Existing social and wallet data is untouched.
const BusinessProfile = sequelize.define('BusinessProfile', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  category: { type: DataTypes.STRING(80), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  country: { type: DataTypes.CHAR(2), allowNull: false, defaultValue: 'NG' },
  city: { type: DataTypes.STRING(100), allowNull: false },
  website: { type: DataTypes.STRING(512), allowNull: true },
  verificationStatus: { type: DataTypes.ENUM('pending', 'verified', 'rejected'), allowNull: false, defaultValue: 'pending' },
}, { tableName: 'business_profiles', indexes: [{ fields: ['ownerId', 'createdAt'] }, { fields: ['country', 'city', 'category'] }, { fields: ['verificationStatus'] }] });

const BusinessOpportunity = sequelize.define('BusinessOpportunity', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerId: { type: DataTypes.UUID, allowNull: false },
  businessId: { type: DataTypes.UUID, allowNull: true },
  lane: { type: DataTypes.ENUM('find', 'flip', 'fix'), allowNull: false },
  title: { type: DataTypes.STRING(140), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  category: { type: DataTypes.STRING(80), allowNull: false },
  country: { type: DataTypes.CHAR(2), allowNull: false, defaultValue: 'NG' },
  city: { type: DataTypes.STRING(100), allowNull: false },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'NGN' },
  askingPriceMinor: { type: DataTypes.BIGINT, allowNull: true },
  estimatedCostMinor: { type: DataTypes.BIGINT, allowNull: true },
  targetPriceMinor: { type: DataTypes.BIGINT, allowNull: true },
  budgetMinor: { type: DataTypes.BIGINT, allowNull: true },
  actualSalePriceMinor: { type: DataTypes.BIGINT, allowNull: true },
  actualCostMinor: { type: DataTypes.BIGINT, allowNull: true },
  realizedProfitMinor: { type: DataTypes.BIGINT, allowNull: true },
  financialsUpdatedAt: { type: DataTypes.DATE, allowNull: true },
  evidenceUrl: { type: DataTypes.STRING(1024), allowNull: true },
  status: { type: DataTypes.ENUM('draft', 'published', 'paused', 'in_progress', 'review', 'completed', 'closed', 'rejected'), allowNull: false, defaultValue: 'published' },
  reviewStatus: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
  assignedUserId: { type: DataTypes.UUID, allowNull: true },
  reviewedBy: { type: DataTypes.STRING(190), allowNull: true },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  reviewNote: { type: DataTypes.STRING(500), allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'business_opportunities', indexes: [{ fields: ['lane', 'reviewStatus', 'status', 'createdAt'] }, { fields: ['ownerId', 'status'] }, { fields: ['country', 'city', 'category'] }, { fields: ['assignedUserId', 'status'] }] });

const BusinessOffer = sequelize.define('BusinessOffer', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  opportunityId: { type: DataTypes.UUID, allowNull: false },
  senderId: { type: DataTypes.UUID, allowNull: false },
  recipientId: { type: DataTypes.UUID, allowNull: false },
  amountMinor: { type: DataTypes.BIGINT, allowNull: false },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'NGN' },
  message: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' },
  status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'withdrawn', 'completed', 'disputed'), allowNull: false, defaultValue: 'pending' },
  idempotencyKey: { type: DataTypes.STRING(100), allowNull: true, unique: true },
  senderCompletedAt: { type: DataTypes.DATE, allowNull: true },
  recipientCompletedAt: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'business_offers', indexes: [{ fields: ['opportunityId', 'status', 'createdAt'] }, { fields: ['senderId', 'status'] }, { fields: ['recipientId', 'status'] }] });

const BusinessWorkUpdate = sequelize.define('BusinessWorkUpdate', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  opportunityId: { type: DataTypes.UUID, allowNull: false },
  authorId: { type: DataTypes.UUID, allowNull: false },
  kind: { type: DataTypes.ENUM('progress', 'blocker', 'completion'), allowNull: false, defaultValue: 'progress' },
  body: { type: DataTypes.STRING(2000), allowNull: false },
  evidenceUrl: { type: DataTypes.STRING(1024), allowNull: true },
}, { tableName: 'business_work_updates', indexes: [{ fields: ['opportunityId', 'createdAt'] }, { fields: ['authorId', 'createdAt'] }] });

const BusinessFinancialRecord = sequelize.define('BusinessFinancialRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  opportunityId: { type: DataTypes.UUID, allowNull: false },
  authorId: { type: DataTypes.UUID, allowNull: false },
  purchasePriceMinor: { type: DataTypes.BIGINT, allowNull: false },
  actualSalePriceMinor: { type: DataTypes.BIGINT, allowNull: false },
  actualCostMinor: { type: DataTypes.BIGINT, allowNull: false },
  realizedProfitMinor: { type: DataTypes.BIGINT, allowNull: false },
  note: { type: DataTypes.STRING(1000), allowNull: true },
}, { tableName: 'business_financial_records', indexes: [{ fields: ['opportunityId', 'createdAt'] }, { fields: ['authorId', 'createdAt'] }] });

const MediaCleanupJob = sequelize.define('MediaCleanupJob', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  publicId: { type: DataTypes.STRING(255), allowNull: false },
  resourceType: { type: DataTypes.ENUM('image', 'video', 'raw'), allowNull: false, defaultValue: 'image' },
  reason: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'cleanup' },
  status: { type: DataTypes.ENUM('pending', 'completed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lastError: { type: DataTypes.STRING(1000), allowNull: true },
}, { tableName: 'media_cleanup_jobs', indexes: [{ unique: true, fields: ['publicId', 'resourceType'] }, { fields: ['status', 'nextAttemptAt'] }] });

// Direct messages between two accounts. Read state is stored per message (readAt).
const GroupConversation = sequelize.define('GroupConversation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(80), allowNull: false },
  createdById: { type: DataTypes.UUID, allowNull: false },
}, { tableName: 'group_conversations', indexes: [{ fields: ['createdById', 'createdAt'] }] });

const GroupMember = sequelize.define('GroupMember', {
  groupId: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
  userId: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
  isAdmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'group_members', indexes: [{ fields: ['userId', 'createdAt'] }] });

const GroupMessage = sequelize.define('GroupMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  groupId: { type: DataTypes.UUID, allowNull: false },
  senderId: { type: DataTypes.UUID, allowNull: false },
  body: { type: DataTypes.STRING(2000), allowNull: false },
}, { tableName: 'group_messages', indexes: [{ fields: ['groupId', 'createdAt'] }, { fields: ['senderId', 'createdAt'] }] });

const DirectMessage = sequelize.define('DirectMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  senderId: { type: DataTypes.UUID, allowNull: false },
  recipientId: { type: DataTypes.UUID, allowNull: false },
  body: { type: DataTypes.STRING(2000), allowNull: false, defaultValue: '' },
  // Photo or video sent in the chat (Cloudinary or local upload URL)
  mediaUrl: { type: DataTypes.STRING(512), allowNull: true },
  mediaKind: { type: DataTypes.STRING(12), allowNull: true },
  mediaName: { type: DataTypes.STRING(255), allowNull: true },
  // RimSocial post the message links to, shown as a preview card
  postId: { type: DataTypes.UUID, allowNull: true },
  // Status: delivered when the recipient's app fetches it, read when they open the chat
  deliveredAt: DataTypes.DATE,
  readAt: DataTypes.DATE,
  editedAt: DataTypes.DATE,
  deletedForEveryone: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // JSON array of user ids who deleted this message just for themselves
  hiddenFor: DataTypes.TEXT,
  replyToId: DataTypes.UUID,
  forwarded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'direct_messages', indexes: [{ fields: ['recipientId', 'readAt'] }, { fields: ['senderId', 'recipientId', 'createdAt'] }] });

module.exports = {
  AudioTrack,
  DirectMessage,
  MediaCleanupJob,
  BusinessFinancialRecord,
  sequelize, Op, User, Post, PostLike, PostComment, Repost, Follow, StoryView, StoryLike, Wallet, EarningsWallet,
  Gift, GiftTransaction, LedgerEntry, Payout, PayoutProfile, LiveMatch, LiveSignal, LiveBroadcast, LiveBroadcastMessage, ContentEarning, UserBlock, PostReport,
  BusinessProfile, BusinessOpportunity, BusinessOffer, BusinessWorkUpdate, seedGifts,
};
