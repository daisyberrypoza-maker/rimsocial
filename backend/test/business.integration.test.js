const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { sequelize, User } = require('../src/db');
const businessRouter = require('../src/routes/business');

const app = express();
app.use(express.json());
app.use('/v1/business', businessRouter);
app.use((error, req, res, next) => {
  res.status(error.status || 500).json({ error: error.expose ? error.message : (error.status ? error.message : 'Server error') });
});

let server;
let baseUrl;
let owner;
let professional;
let outsider;
let tokens;

function tokenFor(user) {
  return jwt.sign({ id: user.id, country: user.country }, config.jwtSecret);
}
async function call(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.as) headers.Authorization = 'Bearer ' + tokens[options.as];
  if (options.admin) headers['X-Admin-Api-Key'] = config.adminApiKey;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + path, {
    method: options.method || 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
}

test.before(async () => {
  if (process.env.RUN_BUSINESS_INTEGRATION !== 'true') return;
  assert.ok(config.jwtSecret.length >= 32, 'test JWT_SECRET must be configured');
  assert.ok(config.adminApiKey.length >= 32, 'test ADMIN_API_KEY must be configured');
  await sequelize.authenticate();
  // This suite only runs against the dedicated ephemeral CI database.
  await sequelize.sync({ force: true });
  const makeUser = (username) => User.create({
    username, email: username + '@example.test', passwordHash: 'not-used-in-this-test',
    displayName: username, country: 'NG',
  });
  [owner, professional, outsider] = await Promise.all([makeUser('business-owner'), makeUser('fix-professional'), makeUser('unrelated-viewer')]);
  tokens = { owner: tokenFor(owner), professional: tokenFor(professional), outsider: tokenFor(outsider) };
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('Find Flip Fix profile review, approved discovery, idempotent offers, private work evidence and two-party completion', { skip: process.env.RUN_BUSINESS_INTEGRATION !== 'true' }, async () => {
  const profileResponse = await call('/v1/business/profiles', {
    method: 'POST', as: 'owner',
    body: { name: 'Test Wholesale', category: 'wholesale', description: 'Test business profile', country: 'NG', city: 'Warri', website: 'https://example.test' },
  });
  assert.equal(profileResponse.status, 201);
  assert.equal(profileResponse.data.profile.verificationStatus, 'pending');
  const profileId = profileResponse.data.profile.id;

  const verified = await call('/v1/business/admin/profiles/' + profileId + '/review', {
    method: 'PATCH', admin: true, body: { decision: 'approve' },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.profile.verificationStatus, 'verified');

  const created = await call('/v1/business/opportunities', {
    method: 'POST', as: 'owner',
    body: {
      lane: 'fix', title: 'Improve stock reconciliation', description: 'Reconcile supplier invoices and stock records.',
      category: 'wholesale operations', country: 'NG', city: 'Warri', currency: 'NGN',
      budgetMinor: 250000, evidenceUrl: 'https://example.test/evidence', businessId: profileId,
    },
  });
  assert.equal(created.status, 201);
  const opportunityId = created.data.opportunity.id;
  assert.equal(created.data.opportunity.reviewStatus, 'pending');
  assert.equal((await call('/v1/business/opportunities?lane=fix', { as: 'outsider' })).data.items.length, 0);

  const queue = await call('/v1/business/admin/opportunities?status=pending', { admin: true });
  assert.equal(queue.status, 200);
  assert.ok(queue.data.items.some((item) => item.id === opportunityId));
  const approved = await call('/v1/business/admin/opportunities/' + opportunityId + '/review', {
    method: 'PATCH', admin: true, body: { decision: 'approve' },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.opportunity.reviewStatus, 'approved');

  const discovered = await call('/v1/business/opportunities?lane=fix&city=Warri', { as: 'outsider' });
  assert.equal(discovered.status, 200);
  assert.ok(discovered.data.items.some((item) => item.id === opportunityId));
  const outsiderDetail = await call('/v1/business/opportunities/' + opportunityId, { as: 'outsider' });
  assert.equal(outsiderDetail.status, 200);
  assert.deepEqual(outsiderDetail.data.updates, []);
  assert.deepEqual(outsiderDetail.data.offers, []);

  const offerOptions = {
    method: 'POST', as: 'professional',
    headers: { 'Idempotency-Key': 'business-offer-test-key' },
    body: { amountMinor: 180000, message: 'I will reconcile invoices and document discrepancies.' },
  };
  const offer = await call('/v1/business/opportunities/' + opportunityId + '/offers', offerOptions);
  assert.equal(offer.status, 201);
  const replay = await call('/v1/business/opportunities/' + opportunityId + '/offers', offerOptions);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.offer.id, offer.data.offer.id);
  assert.equal(replay.data.replayed, true);

  const accepted = await call('/v1/business/offers/' + offer.data.offer.id + '/respond', {
    method: 'POST', as: 'owner', body: { decision: 'accept' },
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.opportunity.status, 'in_progress');
  assert.equal(accepted.data.opportunity.assignedUserId, professional.id);

  const progress = await call('/v1/business/opportunities/' + opportunityId + '/updates', {
    method: 'POST', as: 'professional', body: { kind: 'progress', body: 'Matched 80% of invoices to stock records.' },
  });
  assert.equal(progress.status, 201);
  const completion = await call('/v1/business/opportunities/' + opportunityId + '/updates', {
    method: 'POST', as: 'professional', body: { kind: 'completion', body: 'Reconciliation complete; discrepancies documented.', evidenceUrl: 'https://example.test/completion-evidence' },
  });
  assert.equal(completion.status, 201);

  const hiddenEvidence = await call('/v1/business/opportunities/' + opportunityId, { as: 'outsider' });
  assert.deepEqual(hiddenEvidence.data.updates, []);
  const participantDetail = await call('/v1/business/opportunities/' + opportunityId, { as: 'professional' });
  assert.equal(participantDetail.data.updates.length, 2);
  assert.equal(participantDetail.data.offers[0].id, offer.data.offer.id);

  const providerConfirm = await call('/v1/business/offers/' + offer.data.offer.id + '/complete', { method: 'POST', as: 'professional', body: {} });
  assert.equal(providerConfirm.status, 200);
  assert.equal(providerConfirm.data.offer.status, 'accepted');
  const ownerConfirm = await call('/v1/business/offers/' + offer.data.offer.id + '/complete', { method: 'POST', as: 'owner', body: {} });
  assert.equal(ownerConfirm.status, 200);
  assert.equal(ownerConfirm.data.offer.status, 'completed');
  assert.equal(ownerConfirm.data.opportunity.status, 'completed');

  const flip = await call('/v1/business/opportunities', {
    method: 'POST', as: 'owner',
    body: {
      lane: 'flip', title: 'Resell refurbished equipment', description: 'Buy, repair and resell used equipment.',
      category: 'equipment', country: 'NG', city: 'Warri', currency: 'NGN',
      askingPriceMinor: 500000, estimatedCostMinor: 100000, targetPriceMinor: 900000,
    },
  });
  assert.equal(flip.status, 201);
  const flipId = flip.data.opportunity.id;
  const flipApproved = await call('/v1/business/admin/opportunities/' + flipId + '/review', {
    method: 'PATCH', admin: true, body: { decision: 'approve' },
  });
  assert.equal(flipApproved.status, 200);
  const flipOffer = await call('/v1/business/opportunities/' + flipId + '/offers', {
    method: 'POST', as: 'professional', body: { amountMinor: 450000, message: 'I will purchase and resell this equipment.' },
  });
  assert.equal(flipOffer.status, 201);
  const flipAccepted = await call('/v1/business/offers/' + flipOffer.data.offer.id + '/respond', {
    method: 'POST', as: 'owner', body: { decision: 'accept' },
  });
  assert.equal(flipAccepted.status, 200);
  const flipProviderConfirm = await call('/v1/business/offers/' + flipOffer.data.offer.id + '/complete', { method: 'POST', as: 'professional', body: {} });
  assert.equal(flipProviderConfirm.status, 200);
  const flipOwnerConfirm = await call('/v1/business/offers/' + flipOffer.data.offer.id + '/complete', { method: 'POST', as: 'owner', body: {} });
  assert.equal(flipOwnerConfirm.data.opportunity.status, 'completed');

  const forbiddenFinancials = await call('/v1/business/opportunities/' + flipId + '/financials', {
    method: 'PATCH', as: 'owner', body: { actualSalePriceMinor: 800000, actualCostMinor: 120000 },
  });
  assert.equal(forbiddenFinancials.status, 403);
  const financials = await call('/v1/business/opportunities/' + flipId + '/financials', {
    method: 'PATCH', as: 'professional',
    body: { actualSalePriceMinor: 800000, actualCostMinor: 120000, note: 'Sold after repairs.' },
  });
  assert.equal(financials.status, 201);
  assert.equal(financials.data.record.purchasePriceMinor, 450000);
  assert.equal(financials.data.opportunity.realizedProfitMinor, 230000);

  const ownerFlipDetail = await call('/v1/business/opportunities/' + flipId, { as: 'owner' });
  assert.equal(ownerFlipDetail.data.opportunity.realizedProfitMinor, null);
  const flipperDetail = await call('/v1/business/opportunities/' + flipId, { as: 'professional' });
  assert.equal(flipperDetail.data.opportunity.realizedProfitMinor, 230000);
  assert.equal(flipperDetail.data.financialHistory.length, 1);
});
