const router = require('express').Router();
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, User, BusinessProfile, BusinessOpportunity, BusinessOffer, BusinessWorkUpdate } = require('../db');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');
const httpError = require('../utils/httpError');

const LANES = ['find', 'flip', 'fix'];
const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR'];

function clean(value, max, field, required = false) {
  const result = String(value ?? '').trim().slice(0, max);
  if (required && !result) throw httpError(400, field + ' is required');
  return result || null;
}
function money(value, field, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw httpError(400, field + ' is required');
    return null;
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw httpError(400, field + ' must be a non-negative integer in minor currency units');
  return n;
}
function httpsUrl(value, field) {
  const url = clean(value, 1024, field);
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { throw httpError(400, field + ' must be a valid HTTPS URL'); }
  if (parsed.protocol !== 'https:') throw httpError(400, field + ' must use HTTPS');
  return parsed.toString();
}
function requireOperator(req, res, next) {
  const supplied = String(req.headers['x-admin-api-key'] || '');
  const expected = String(config.adminApiKey || '');
  if (expected.length < 32 || /replace|change-this|paste-output/i.test(expected) ||
      supplied.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Operator authorization required' });
  }
  next();
}
function profileDTO(profile) {
  if (!profile) return null;
  const p = profile.toJSON();
  return { id: p.id, ownerId: p.ownerId, name: p.name, category: p.category, description: p.description,
    country: p.country, city: p.city, website: p.website || null, verificationStatus: p.verificationStatus, createdAt: p.createdAt };
}
function opportunityDTO(item, profile = null, owner = null, viewerId = null) {
  const o = item.toJSON ? item.toJSON() : item;
  const { reviewedBy, reviewNote, ...safe } = o; // Operator-only review notes are never exposed in public DTOs.
  return { ...safe, reviewNote: viewerId === o.ownerId ? (o.reviewNote || null) : null, askingPriceMinor: o.askingPriceMinor == null ? null : Number(o.askingPriceMinor),
    estimatedCostMinor: o.estimatedCostMinor == null ? null : Number(o.estimatedCostMinor),
    targetPriceMinor: o.targetPriceMinor == null ? null : Number(o.targetPriceMinor),
    budgetMinor: o.budgetMinor == null ? null : Number(o.budgetMinor),
    business: profile ? profileDTO(profile) : null,
    owner: owner ? { id: owner.id, username: owner.username, displayName: owner.displayName, avatarUrl: owner.avatarUrl } : null };
}
async function enrich(items, viewerId = null) {
  if (!items.length) return [];
  const profileIds = [...new Set(items.map((item) => item.businessId).filter(Boolean))];
  const ownerIds = [...new Set(items.map((item) => item.ownerId))];
  const [profiles, owners] = await Promise.all([
    profileIds.length ? BusinessProfile.findAll({ where: { id: profileIds } }) : [],
    User.findAll({ where: { id: ownerIds }, attributes: ['id', 'username', 'displayName', 'avatarUrl'] }),
  ]);
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const ownerMap = new Map(owners.map((u) => [u.id, u]));
  return items.map((item) => opportunityDTO(item, profileMap.get(item.businessId), ownerMap.get(item.ownerId), viewerId));
}

// Operator moderation is deliberately separate from normal user authorization.
router.get('/admin/opportunities', requireOperator, async (req, res, next) => {
  try {
    const items = await BusinessOpportunity.findAll({ where: { reviewStatus: req.query.status === 'rejected' ? 'rejected' : 'pending' }, order: [['createdAt', 'ASC']], limit: 100 });
    res.json({ items: await enrich(items, req.user.id) });
  } catch (e) { next(e); }
});
router.patch('/admin/opportunities/:id/review', requireOperator, async (req, res, next) => {
  try {
    const item = await BusinessOpportunity.findByPk(req.params.id);
    if (!item) throw httpError(404, 'Opportunity not found');
    const decision = String(req.body.decision || '');
    if (!['approve', 'reject'].includes(decision)) throw httpError(400, 'Decision must be approve or reject');
    if (item.reviewStatus !== 'pending') throw httpError(409, 'This opportunity has already been reviewed');
    await item.update({ reviewStatus: decision === 'approve' ? 'approved' : 'rejected',
      status: decision === 'approve' ? 'published' : 'rejected',
      reviewedBy: String(req.headers['x-operator-id'] || 'operator').slice(0, 190),
      reviewedAt: new Date(), reviewNote: clean(req.body.note, 500, 'Review note') });
    res.json({ opportunity: opportunityDTO(item) });
  } catch (e) { next(e); }
});
router.get('/admin/profiles', requireOperator, async (req, res, next) => {
  try {
    const status = ['pending', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const items = await BusinessProfile.findAll({ where: { verificationStatus: status }, order: [['createdAt', 'ASC']], limit: 100 });
    res.json({ items: items.map(profileDTO) });
  } catch (e) { next(e); }
});
router.patch('/admin/profiles/:id/review', requireOperator, async (req, res, next) => {
  try {
    const profile = await BusinessProfile.findByPk(req.params.id);
    if (!profile) throw httpError(404, 'Business profile not found');
    const decision = String(req.body.decision || '');
    if (!['approve', 'reject'].includes(decision)) throw httpError(400, 'Decision must be approve or reject');
    if (profile.verificationStatus !== 'pending') throw httpError(409, 'This business profile has already been reviewed');
    await profile.update({ verificationStatus: decision === 'approve' ? 'verified' : 'rejected' });
    res.json({ profile: profileDTO(profile) });
  } catch (e) { next(e); }
});

router.use(requireAuth);

// Business profiles
router.get('/profiles/me', async (req, res, next) => {
  try {
    const items = await BusinessProfile.findAll({ where: { ownerId: req.user.id }, order: [['createdAt', 'DESC']], limit: 20 });
    res.json({ items: items.map(profileDTO) });
  } catch (e) { next(e); }
});
router.post('/profiles', async (req, res, next) => {
  try {
    const name = clean(req.body.name, 120, 'Business name', true);
    const category = clean(req.body.category, 80, 'Category', true);
    const description = clean(req.body.description, 4000, 'Description', true);
    const country = String(req.body.country || req.user.country || 'NG').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw httpError(400, 'Country must be a two-letter ISO code');
    const city = clean(req.body.city, 100, 'City', true);
    const website = httpsUrl(req.body.website, 'Website');
    const profile = await BusinessProfile.create({ ownerId: req.user.id, name, category, description, country, city, website });
    res.status(201).json({ profile: profileDTO(profile), message: 'Business profile submitted for verification.' });
  } catch (e) { next(e); }
});
router.patch('/profiles/:id', async (req, res, next) => {
  try {
    const profile = await BusinessProfile.findOne({ where: { id: req.params.id, ownerId: req.user.id } });
    if (!profile) throw httpError(404, 'Business profile not found');
    const patch = {};
    if (req.body.name !== undefined) patch.name = clean(req.body.name, 120, 'Business name', true);
    if (req.body.category !== undefined) patch.category = clean(req.body.category, 80, 'Category', true);
    if (req.body.description !== undefined) patch.description = clean(req.body.description, 4000, 'Description', true);
    if (req.body.city !== undefined) patch.city = clean(req.body.city, 100, 'City', true);
    if (req.body.country !== undefined) {
      const country = String(req.body.country).trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) throw httpError(400, 'Country must be a two-letter ISO code');
      patch.country = country;
    }
    if (req.body.website !== undefined) patch.website = httpsUrl(req.body.website, 'Website');
    if (Object.keys(patch).length) {
      patch.verificationStatus = 'pending';
      await profile.update(patch);
    }
    res.json({ profile: profileDTO(profile), message: 'Changes saved; verification returned to pending.' });
  } catch (e) { next(e); }
});

// Discover only operator-approved listings. Owners can see their own pending/rejected listings via /mine.
router.get('/opportunities/mine', async (req, res, next) => {
  try {
    const items = await BusinessOpportunity.findAll({ where: { ownerId: req.user.id }, order: [['createdAt', 'DESC']], limit: 100 });
    res.json({ items: await enrich(items) });
  } catch (e) { next(e); }
});
router.get('/opportunities', async (req, res, next) => {
  try {
    const where = { reviewStatus: 'approved', status: { [Op.in]: ['published', 'in_progress', 'review'] } };
    if (req.query.lane) {
      if (!LANES.includes(String(req.query.lane))) throw httpError(400, 'Lane must be find, flip or fix');
      where.lane = String(req.query.lane);
    }
    if (req.query.country) where.country = String(req.query.country).trim().toUpperCase().slice(0, 2);
    if (req.query.city) where.city = { [Op.like]: '%' + String(req.query.city).trim().slice(0, 80) + '%' };
    if (req.query.category) where.category = { [Op.like]: '%' + String(req.query.category).trim().slice(0, 80) + '%' };
    if (req.query.q) {
      const q = String(req.query.q).trim().slice(0, 100);
      where[Op.or] = [{ title: { [Op.like]: '%' + q + '%' } }, { description: { [Op.like]: '%' + q + '%' } }];
    }
    const items = await BusinessOpportunity.findAll({ where, order: [['createdAt', 'DESC']], limit: 50 });
    res.json({ items: await enrich(items) });
  } catch (e) { next(e); }
});
router.post('/opportunities', async (req, res, next) => {
  try {
    const lane = String(req.body.lane || '');
    if (!LANES.includes(lane)) throw httpError(400, 'Choose Find, Flip or Fix');
    const title = clean(req.body.title, 140, 'Title', true);
    const description = clean(req.body.description, 10000, 'Description', true);
    const category = clean(req.body.category, 80, 'Category', true);
    const country = String(req.body.country || req.user.country || 'NG').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw httpError(400, 'Country must be a two-letter ISO code');
    const city = clean(req.body.city, 100, 'City', true);
    const currency = String(req.body.currency || 'NGN').trim().toUpperCase();
    if (!CURRENCIES.includes(currency)) throw httpError(400, 'Unsupported currency');
    const businessId = clean(req.body.businessId, 36, 'Business profile ID');
    if (businessId && !(await BusinessProfile.findOne({ where: { id: businessId, ownerId: req.user.id } }))) {
      throw httpError(403, 'Select one of your own business profiles');
    }
    const evidenceUrl = httpsUrl(req.body.evidenceUrl, 'Evidence link');
    const askingPriceMinor = money(req.body.askingPriceMinor, 'Asking price');
    const estimatedCostMinor = money(req.body.estimatedCostMinor, 'Estimated cost');
    const targetPriceMinor = money(req.body.targetPriceMinor, 'Target price');
    const budgetMinor = money(req.body.budgetMinor, 'Budget');
    if (lane === 'flip' && (askingPriceMinor === null || targetPriceMinor === null)) throw httpError(400, 'Flip listings need an asking price and target value');
    if (lane === 'fix' && budgetMinor === null) throw httpError(400, 'Fix requests need a budget (use 0 if it is a volunteer project)');
    const item = await BusinessOpportunity.create({ ownerId: req.user.id, businessId, lane, title, description, category, country, city, currency, askingPriceMinor, estimatedCostMinor, targetPriceMinor, budgetMinor, evidenceUrl, reviewStatus: 'pending', status: 'published' });
    res.status(201).json({ opportunity: opportunityDTO(item), message: 'Submitted for review. It will appear in public discovery only after approval.' });
  } catch (e) { next(e); }
});
router.get('/opportunities/:id', async (req, res, next) => {
  try {
    const item = await BusinessOpportunity.findByPk(req.params.id);
    if (!item || (item.reviewStatus !== 'approved' && item.ownerId !== req.user.id)) throw httpError(404, 'Opportunity not found');
    const [full] = await enrich([item], req.user.id);
    const updates = item.lane === 'fix' ? await BusinessWorkUpdate.findAll({ where: { opportunityId: item.id }, order: [['createdAt', 'ASC']], limit: 100 }) : [];
    const canSeeOffers = item.ownerId === req.user.id;
    const offers = canSeeOffers ? await BusinessOffer.findAll({ where: { opportunityId: item.id }, order: [['createdAt', 'DESC']], limit: 100 }) : [];
    res.json({ opportunity: full, updates, offers });
  } catch (e) { next(e); }
});
router.patch('/opportunities/:id', async (req, res, next) => {
  try {
    const item = await BusinessOpportunity.findOne({ where: { id: req.params.id, ownerId: req.user.id } });
    if (!item) throw httpError(404, 'Opportunity not found');
    if (['in_progress', 'review', 'completed', 'closed'].includes(item.status)) throw httpError(409, 'This opportunity cannot be edited in its current state');
    const patch = {};
    for (const [field, max] of [['title', 140], ['description', 10000], ['category', 80], ['city', 100]]) {
      if (req.body[field] !== undefined) patch[field] = clean(req.body[field], max, field, true);
    }
    if (req.body.country !== undefined) {
      const country = String(req.body.country).trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) throw httpError(400, 'Country must be a two-letter ISO code');
      patch.country = country;
    }
    if (req.body.evidenceUrl !== undefined) patch.evidenceUrl = httpsUrl(req.body.evidenceUrl, 'Evidence link');
    for (const [field, label] of [['askingPriceMinor', 'Asking price'], ['estimatedCostMinor', 'Estimated cost'], ['targetPriceMinor', 'Target price'], ['budgetMinor', 'Budget']]) {
      if (req.body[field] !== undefined) patch[field] = money(req.body[field], label);
    }
    if (Object.keys(patch).length) {
      patch.reviewStatus = 'pending';
      patch.reviewedBy = null;
      patch.reviewedAt = null;
      patch.reviewNote = null;
      if (item.status === 'rejected' || item.status === 'paused') patch.status = 'published';
      await item.update(patch);
    }
    res.json({ opportunity: opportunityDTO(item), message: 'Saved. Any changed listing must be reviewed again before public discovery.' });
  } catch (e) { next(e); }
});
router.post('/opportunities/:id/pause', async (req, res, next) => {
  try {
    const item = await BusinessOpportunity.findOne({ where: { id: req.params.id, ownerId: req.user.id } });
    if (!item) throw httpError(404, 'Opportunity not found');
    if (['in_progress', 'review', 'completed'].includes(item.status)) throw httpError(409, 'An active deal cannot be paused; resolve it first');
    await item.update({ status: item.status === 'paused' ? 'published' : 'paused' });
    res.json({ opportunity: opportunityDTO(item) });
  } catch (e) { next(e); }
});

router.post('/opportunities/:id/offers', async (req, res, next) => {
  try {
    const item = await BusinessOpportunity.findOne({ where: { id: req.params.id, reviewStatus: 'approved', status: 'published' } });
    if (!item) throw httpError(404, 'Opportunity not available for offers');
    if (item.ownerId === req.user.id) throw httpError(400, 'You cannot make an offer on your own listing');
    const amountMinor = money(req.body.amountMinor, 'Offer amount', true);
    if (amountMinor < 1) throw httpError(400, 'Offer amount must be greater than zero');
    const message = clean(req.body.message, 1000, 'Message') || '';
    const idempotencyKey = clean(req.get('Idempotency-Key') || req.body.idempotencyKey, 100, 'Idempotency key');
    if (idempotencyKey) {
      const existing = await BusinessOffer.findOne({ where: { idempotencyKey } });
      if (existing) {
        if (existing.senderId !== req.user.id || existing.opportunityId !== item.id) throw httpError(409, 'Idempotency key has already been used');
        return res.status(200).json({ offer: existing, replayed: true });
      }
    }
    const offer = await BusinessOffer.create({ opportunityId: item.id, senderId: req.user.id, recipientId: item.ownerId, amountMinor, currency: item.currency, message, idempotencyKey });
    res.status(201).json({ offer, message: 'Offer sent. No payment has been taken.' });
  } catch (e) { next(e); }
});
router.post('/offers/:id/respond', async (req, res, next) => {
  try {
    const decision = String(req.body.decision || '');
    if (!['accept', 'reject'].includes(decision)) throw httpError(400, 'Decision must be accept or reject');
    const result = await sequelize.transaction(async (transaction) => {
      const offer = await BusinessOffer.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!offer) throw httpError(404, 'Offer not found');
      if (offer.recipientId !== req.user.id) throw httpError(403, 'Only the listing owner can respond to this offer');
      if (offer.status !== 'pending') throw httpError(409, 'This offer is no longer pending');
      const item = await BusinessOpportunity.findByPk(offer.opportunityId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!item || item.status !== 'published' || item.reviewStatus !== 'approved') throw httpError(409, 'The opportunity is not open for offers');
      if (decision === 'reject') {
        await offer.update({ status: 'rejected' }, { transaction });
        return { offer, opportunity: item };
      }
      await offer.update({ status: 'accepted' }, { transaction });
      await BusinessOffer.update({ status: 'rejected' }, { where: { opportunityId: item.id, status: 'pending', id: { [Op.ne]: offer.id } }, transaction });
      await item.update({ status: 'in_progress', assignedUserId: offer.senderId }, { transaction });
      return { offer, opportunity: item };
    });
    res.json({ offer: result.offer, opportunity: opportunityDTO(result.opportunity), message: decision === 'accept' ? 'Offer accepted. This is an agreement only; payment is not integrated.' : 'Offer rejected.' });
  } catch (e) { next(e); }
});
router.post('/offers/:id/withdraw', async (req, res, next) => {
  try {
    const offer = await BusinessOffer.findOne({ where: { id: req.params.id, senderId: req.user.id } });
    if (!offer) throw httpError(404, 'Offer not found');
    if (offer.status !== 'pending') throw httpError(409, 'Only pending offers can be withdrawn');
    await offer.update({ status: 'withdrawn' });
    res.json({ offer });
  } catch (e) { next(e); }
});
router.post('/offers/:id/complete', async (req, res, next) => {
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const offer = await BusinessOffer.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!offer) throw httpError(404, 'Offer not found');
      if (![offer.senderId, offer.recipientId].includes(req.user.id)) throw httpError(403, 'Only the two parties can confirm completion');
      if (!['accepted', 'completed'].includes(offer.status)) throw httpError(409, 'Only an accepted offer can be completed');
      const item = await BusinessOpportunity.findByPk(offer.opportunityId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!item) throw httpError(404, 'Opportunity not found');
      if (item.lane === 'fix' && req.user.id === offer.senderId) {
        const evidence = await BusinessWorkUpdate.findOne({ where: { opportunityId: item.id, authorId: offer.senderId, kind: 'completion' }, transaction });
        if (!evidence) throw httpError(409, 'Submit a completion update with evidence before requesting approval');
      }
      const now = new Date();
      const patch = req.user.id === offer.senderId ? { senderCompletedAt: offer.senderCompletedAt || now } : { recipientCompletedAt: offer.recipientCompletedAt || now };
      await offer.update(patch, { transaction });
      if (offer.senderCompletedAt && offer.recipientCompletedAt) {
        await offer.update({ status: 'completed' }, { transaction });
        await item.update({ status: 'completed', completedAt: item.completedAt || now }, { transaction });
      } else if (item.lane === 'fix' && req.user.id === offer.senderId) {
        await item.update({ status: 'review' }, { transaction });
      }
      return { offer, opportunity: item };
    });
    res.json({ offer: result.offer, opportunity: opportunityDTO(result.opportunity), message: result.offer.status === 'completed' ? 'Both parties confirmed completion.' : 'Completion confirmation saved; the other party must confirm too.' });
  } catch (e) { next(e); }
});
router.post('/opportunities/:id/updates', async (req, res, next) => {
  try {
    const item = await BusinessOpportunity.findByPk(req.params.id);
    if (!item || item.reviewStatus !== 'approved') throw httpError(404, 'Opportunity not found');
    if (item.lane !== 'fix' || ![item.ownerId, item.assignedUserId].includes(req.user.id)) throw httpError(403, 'Only the requester and assigned professional can update a Fix job');
    if (!['in_progress', 'review'].includes(item.status)) throw httpError(409, 'This Fix job is not in progress');
    const kind = String(req.body.kind || 'progress');
    if (!['progress', 'blocker', 'completion'].includes(kind)) throw httpError(400, 'Update type must be progress, blocker or completion');
    if (kind === 'completion' && req.user.id !== item.assignedUserId) throw httpError(403, 'Only the assigned professional can submit completion evidence');
    const body = clean(req.body.body, 2000, 'Update', true);
    const evidenceUrl = httpsUrl(req.body.evidenceUrl, 'Evidence link');
    const update = await BusinessWorkUpdate.create({ opportunityId: item.id, authorId: req.user.id, kind, body, evidenceUrl });
    if (kind === 'completion') await item.update({ status: 'review' });
    res.status(201).json({ update, message: kind === 'completion' ? 'Completion submitted for requester approval.' : 'Work update recorded.' });
  } catch (e) { next(e); }
});

module.exports = router;
