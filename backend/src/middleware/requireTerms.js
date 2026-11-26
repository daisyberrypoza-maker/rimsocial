const { User } = require('../db');
const httpError = require('../utils/httpError');

// Legacy accounts must accept the current Terms before creating posts or stories.
async function requireTerms(req, res, next) {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'termsAcceptedAt'] });
    if (!user) throw httpError(401, 'Account not found');
    if (!user.termsAcceptedAt) throw httpError(428, 'Accept the Terms of Service before publishing', { code: 'TERMS_ACCEPTANCE_REQUIRED' });
    next();
  } catch (error) { next(error); }
}
module.exports = { requireTerms };
