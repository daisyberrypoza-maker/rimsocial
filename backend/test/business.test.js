const test = require('node:test');
const assert = require('node:assert/strict');
const businessRouter = require('../src/routes/business');
const { clean, money, httpsUrl, LANES, CURRENCIES } = businessRouter.testHelpers;

test('business text is trimmed, capped, and required text cannot be empty', () => {
  assert.equal(clean('  wholesale  ', 20, 'Category', true), 'wholesale');
  assert.equal(clean('x'.repeat(30), 8, 'Title', true), 'x'.repeat(8));
  assert.throws(() => clean('  ', 20, 'Title', true), (error) => error.status === 400 && /required/.test(error.message));
  assert.equal(clean('', 20, 'Website'), null);
});

test('business money accepts only safe non-negative integer minor units', () => {
  assert.equal(money('125000', 'Offer', true), 125000);
  assert.equal(money(0, 'Budget', true), 0);
  assert.equal(money('', 'Optional amount'), null);
  for (const invalid of [-1, '1.25', 'not-money', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => money(invalid, 'Offer', true), (error) => error.status === 400);
  }
});

test('business evidence and websites must use HTTPS', () => {
  assert.equal(httpsUrl('https://example.com/evidence', 'Evidence'), 'https://example.com/evidence');
  assert.equal(httpsUrl('', 'Evidence'), null);
  assert.throws(() => httpsUrl('http://example.com', 'Evidence'), (error) => error.status === 400 && /HTTPS/.test(error.message));
  assert.throws(() => httpsUrl('not a URL', 'Evidence'), (error) => error.status === 400);
});

test('only the supported Find, Flip, Fix lanes and currency codes are accepted', () => {
  assert.deepEqual(LANES, ['find', 'flip', 'fix']);
  assert.ok(CURRENCIES.includes('NGN'));
  assert.ok(CURRENCIES.includes('USD'));
  assert.equal(CURRENCIES.includes('XXX'), false);
});
