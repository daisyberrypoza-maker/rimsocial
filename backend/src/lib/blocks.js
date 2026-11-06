const { Op, UserBlock } = require('../db');
const httpError = require('../utils/httpError');

// Both directions of a block hide each account from the other.
async function blockedUserIds(userId) {
  const rows = await UserBlock.findAll({
    where: { [Op.or]: [{ blockerId: userId }, { blockedUserId: userId }] },
    attributes: ['blockerId', 'blockedUserId'],
    raw: true,
  });
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedUserId : r.blockerId)));
}

async function isBlockedEitherWay(viewerId, otherId) {
  if (!viewerId || !otherId || viewerId === otherId) return false;
  const relation = await UserBlock.findOne({
    where: { [Op.or]: [
      { blockerId: viewerId, blockedUserId: otherId },
      { blockerId: otherId, blockedUserId: viewerId },
    ] },
    attributes: ['blockerId'],
  });
  return Boolean(relation);
}

async function assertNotBlocked(viewerId, otherId, message) {
  if (await isBlockedEitherWay(viewerId, otherId)) throw httpError(404, message);
}

module.exports = { blockedUserIds, isBlockedEitherWay, assertNotBlocked };
