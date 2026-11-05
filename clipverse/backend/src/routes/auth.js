const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { sequelize, User, Wallet, EarningsWallet } = require('../db');
const { requireAuth } = require('../middleware/auth');
const httpError = require('../utils/httpError');

const sign = (u) => jwt.sign({ id: u.id, country: u.country }, config.jwtSecret, { expiresIn: '30d' });
const publicUser = (u) => ({
  id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, country: u.country,
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
    const user = await User.findOne({ where: { username: username.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw httpError(401, 'Wrong username or password');
    }
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) throw httpError(404, 'User not found');
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

module.exports = router;
