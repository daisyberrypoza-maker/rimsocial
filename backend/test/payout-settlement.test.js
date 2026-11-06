const test = require('node:test');
const assert = require('node:assert/strict');
const { payoutTransferAction } = require('../src/services/payoutSettlement');

test('successful transfer settles only a pending payout', () => {
  assert.equal(payoutTransferAction('transfer.success', 'pending'), 'mark_paid');
  assert.equal(payoutTransferAction('transfer.success', 'paid'), 'ignore');
  assert.equal(payoutTransferAction('transfer.success', 'failed'), 'ignore');
});

test('failed transfer refunds only a pending payout', () => {
  assert.equal(payoutTransferAction('transfer.failed', 'pending'), 'refund_failed');
  assert.equal(payoutTransferAction('transfer.failed', 'paid'), 'ignore');
  assert.equal(payoutTransferAction('transfer.failed', 'failed'), 'ignore');
});

test('reversal refunds pending or paid payouts, including out-of-order webhook delivery', () => {
  assert.equal(payoutTransferAction('transfer.reversed', 'pending'), 'refund_reversed');
  assert.equal(payoutTransferAction('transfer.reversed', 'paid'), 'refund_reversed');
  assert.equal(payoutTransferAction('transfer.reversed', 'failed'), 'ignore');
});

test('unknown provider events cannot mutate payout state', () => {
  assert.equal(payoutTransferAction('transfer.unknown', 'pending'), 'ignore');
});
