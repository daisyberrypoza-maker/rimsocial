const test = require('node:test');
const assert = require('node:assert/strict');
const { payoutTransferAction, settlePayoutTransfer } = require('../src/services/payoutSettlement');

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


function settlementHarness(initialStatus = 'pending') {
  const payout = {
    id: 'payout-1', userId: 'creator-1', providerRef: 'provider-ref-1',
    amountMinor: 5000, status: initialStatus,
    async update(patch) { Object.assign(this, patch); },
  };
  const wallet = { balanceMinor: 0, async increment(field, { by }) { this[field] += by; } };
  const ledger = [];
  const models = {
    sequelize: { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
    Payout: { findOne: async () => payout },
    EarningsWallet: { findOrCreate: async () => [wallet, false] },
    LedgerEntry: { create: async (entry) => {
      if (ledger.some((row) => row.kind === entry.kind && row.refId === entry.refId)) {
        const error = new Error('duplicate ledger entry'); error.name = 'SequelizeUniqueConstraintError'; throw error;
      }
      ledger.push(entry);
    } },
  };
  return { payout, wallet, ledger, models };
}

test('settlement writes one audit entry and duplicate success does not duplicate it', async () => {
  const { payout, ledger, models } = settlementHarness();
  await settlePayoutTransfer({ eventName: 'transfer.success', reference: 'provider-ref-1', ...models });
  await settlePayoutTransfer({ eventName: 'transfer.success', reference: 'provider-ref-1', ...models });
  assert.equal(payout.status, 'paid');
  assert.equal(ledger.filter((row) => row.kind === 'payout_settled').length, 1);
});

test('failed payout returns available earnings once, even if the webhook is retried', async () => {
  const { payout, wallet, ledger, models } = settlementHarness();
  await settlePayoutTransfer({ eventName: 'transfer.failed', reference: 'provider-ref-1', ...models });
  await settlePayoutTransfer({ eventName: 'transfer.failed', reference: 'provider-ref-1', ...models });
  assert.equal(payout.status, 'failed');
  assert.equal(wallet.balanceMinor, 5000);
  assert.equal(ledger.filter((row) => row.kind === 'payout_refund').length, 1);
});

test('reversal after success restores earnings once and blocks a late success event', async () => {
  const { payout, wallet, ledger, models } = settlementHarness();
  await settlePayoutTransfer({ eventName: 'transfer.success', reference: 'provider-ref-1', ...models });
  await settlePayoutTransfer({ eventName: 'transfer.reversed', reference: 'provider-ref-1', ...models });
  await settlePayoutTransfer({ eventName: 'transfer.success', reference: 'provider-ref-1', ...models });
  assert.equal(payout.status, 'failed');
  assert.equal(wallet.balanceMinor, 5000);
  assert.equal(ledger.filter((row) => row.kind === 'payout_reversal_refund').length, 1);
  assert.equal(ledger.filter((row) => row.kind === 'payout_settled').length, 1);
});

test('reversal arriving before success refunds once and ignores late success', async () => {
  const { payout, wallet, ledger, models } = settlementHarness();
  await settlePayoutTransfer({ eventName: 'transfer.reversed', reference: 'provider-ref-1', ...models });
  await settlePayoutTransfer({ eventName: 'transfer.success', reference: 'provider-ref-1', ...models });
  assert.equal(payout.status, 'failed');
  assert.equal(wallet.balanceMinor, 5000);
  assert.equal(ledger.filter((row) => row.kind === 'payout_reversal_refund').length, 1);
});
