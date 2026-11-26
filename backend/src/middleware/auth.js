const jwt = require('jsonwebtoken');
const config = require('../config');
const redis = require('../redis');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Log in first' });
  try {
    req.user = jwt.verify(token, config.jwtSecret); // { id, country }
  } catch {
    return res.status(401).json({ error: 'Session expired, log in again' });
  }
  // A deleted account's old tokens stop working at once (see DELETE /v1/users/me)
  redis.get('acct-deleted:' + req.user.id).then((deleted) => {
    if (deleted) return res.status(401).json({ error: 'This account was deleted' });
    // Presence for the online dot: a key that expires after 5 minutes without a request. Never blocks a request.
    redis.set('presence:' + req.user.id, '1', 'EX', 300).catch(() => {});
    next();
  }).catch(() => {
    redis.set('presence:' + req.user.id, '1', 'EX', 300).catch(() => {});
    next();
  });
}

module.exports = { requireAuth };
