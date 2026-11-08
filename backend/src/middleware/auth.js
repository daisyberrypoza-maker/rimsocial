const jwt = require('jsonwebtoken');
const config = require('../config');
const redis = require('../redis');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Log in first' });
  try {
    req.user = jwt.verify(token, config.jwtSecret); // { id, country }
    // Presence for the online dot: a key that expires after 5 minutes without a request. Never blocks a request.
    redis.set('presence:' + req.user.id, '1', 'EX', 300).catch(() => {});
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, log in again' });
  }
}

module.exports = { requireAuth };
