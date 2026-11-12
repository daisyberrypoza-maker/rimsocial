const router = require('express').Router();
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { sequelize, User, Wallet, EarningsWallet } = require('../db');
const { requireAuth } = require('../middleware/auth');
const httpError = require('../utils/httpError');

const sign = (u) => jwt.sign({ id: u.id, country: u.country }, config.jwtSecret, { expiresIn: '30d' });
const publicUser = (u) => ({
  id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, coverUrl: u.coverUrl, country: u.country,
});

router.post('/register', async (req, res, next) => {
  try {
    const { username = '', password = '', displayName, email = '', country = 'US' } = req.body;
    if (!/^[a-z0-9_]{3,32}$/i.test(username)) throw httpError(400, 'Username: 3-32 letters, numbers or _');
    if (username.toLowerCase() === 'me') throw httpError(400, 'That username is reserved');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    if (!email.includes('@')) throw httpError(400, 'A valid email is required');

    const user = await sequelize.transaction(async (t) => {
      const u = await User.create({
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 10),
        displayName: (displayName || username).slice(0, 64),
        country: country.toUpperCase().slice(0, 2),
      }, { transaction: t });
      await Wallet.create({ userId: u.id }, { transaction: t });
      await EarningsWallet.create({ userId: u.id }, { transaction: t });
      return u;
    }).catch((e) => {
      if (e.name === 'SequelizeUniqueConstraintError') throw httpError(409, 'Username or email already taken');
      throw e;
    });

    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username = '', password = '' } = req.body;
    const identifier = String(username).trim().toLowerCase();
    const user = await User.findOne({ where: { [Op.or]: [{ username: identifier }, { email: identifier }] } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw httpError(401, 'Wrong username or password');
    }
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

// Public, read-only check used by the sign-up form to show live username feedback.
router.get('/username-available', async (req, res, next) => {
  try {
    const username = String(req.query.username || '').trim();
    if (!/^[a-z0-9_]{3,32}$/i.test(username)) return res.json({ available: false, reason: 'invalid' });
    if (username.toLowerCase() === 'me') return res.json({ available: false, reason: 'reserved' });
    const taken = await User.findOne({ where: { username: username.toLowerCase() }, attributes: ['id'] });
    res.json({ available: !taken, reason: taken ? 'taken' : null });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) throw httpError(404, 'User not found');
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});


router.post('/google', async (req, res, next) => {
  try {
    if (!config.googleClientId) throw httpError(503, 'Google sign-in is not configured on the server');
    const credential = String(req.body.credential || '');
    if (!credential || credential.length > 10000) throw httpError(400, 'Google credential is missing or invalid');

    const verifyUrl = new URL('https://oauth2.googleapis.com/tokeninfo');
    verifyUrl.searchParams.set('id_token', credential);
    const verifyResponse = await fetch(verifyUrl, { signal: AbortSignal.timeout(8000) });
    if (!verifyResponse.ok) throw httpError(401, 'Google sign-in could not be verified');
    const claims = await verifyResponse.json();
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
        claims.aud !== config.googleClientId || claims.email_verified !== 'true' ||
        !claims.email || !claims.sub || Number(claims.exp) * 1000 <= Date.now()) {
      throw httpError(401, 'Google sign-in token is invalid or expired');
    }

    const email = String(claims.email).trim().toLowerCase();
    const countryInput = String(req.body.country || 'US').trim().toUpperCase();
    const country = /^[A-Z]{2}$/.test(countryInput) ? countryInput : 'US';
    let user = await User.findOne({ where: { email } });
    if (!user) {
      const base = String(claims.name || email.split('@')[0]).toLowerCase()
        .replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'creator';
      let username = base.length >= 3 ? base : 'user_' + base;
      if (await User.findOne({ where: { username } })) {
        username = (base.slice(0, 17) + '_' + Date.now().toString(36)).slice(0, 32);
      }
      user = await sequelize.transaction(async (t) => {
        const created = await User.create({
          username, email,
          passwordHash: await bcrypt.hash(String(claims.sub) + String(Date.now()), 10),
          displayName: String(claims.name || username).slice(0, 64), country,
        }, { transaction: t });
        await Wallet.findOrCreate({ where: { userId: created.id }, defaults: { userId: created.id }, transaction: t });
        await EarningsWallet.findOrCreate({ where: { userId: created.id }, defaults: { userId: created.id }, transaction: t });
        return created;
      });
    } else {
      await Wallet.findOrCreate({ where: { userId: user.id }, defaults: { userId: user.id } });
      await EarningsWallet.findOrCreate({ where: { userId: user.id }, defaults: { userId: user.id } });
    }
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return next(httpError(409, 'This Google account is already being created. Please try again.'));
    next(e);
  }
});

module.exports = router;
