const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Log in first' });
  try {
    req.user = jwt.verify(token, config.jwtSecret); // { id, country }
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, log in again' });
  }
}

module.exports = { requireAuth };
