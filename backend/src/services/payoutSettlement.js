function payoutTransferAction(eventName, currentStatus) {
  if (eventName === 'transfer.success') return currentStatus === 'pending' ? 'mark_paid' : 'ignore';
  if (eventName === 'transfer.failed') return currentStatus === 'pending' ? 'refund_failed' : 'ignore';
  // A reversal can arrive after success, or before a delayed success notification.
  // In either case the provider says funds returned, so refund once and block late success.
  if (eventName === 'transfer.reversed') return ['pending', 'paid'].includes(currentStatus) ? 'refund_reversed' : 'ignore';
  return 'ignore';
}

async function settlePayoutTransfer({ eventName, reference, sequelize, Payout, EarningsWallet, LedgerEntry }) {
  if (!reference) return { handled: true, action: 'ignore' };
  return sequelize.transaction(async (transaction) => {
    const payout = await Payout.findOne({
      where: { providerRef: reference },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!payout) return { handled: true, action: 'ignore' };

    const action = payoutTransferAction(eventName, payout.status);
    if (action === 'ignore') return { handled: true, action };

    const amountMinor = Number(payout.amountMinor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('Invalid payout amount in settlement record');

    if (action === 'mark_paid') {
      await payout.update({ status: 'paid' }, { transaction });
      await LedgerEntry.create({
        userId: payout.userId, kind: 'payout_settled', deltaMinor: 0, refId: payout.id,
      }, { transaction });
      return { handled: true, action };
    }

    await payout.update({ status: 'failed' }, { transaction });
    const [wallet] = await EarningsWallet.findOrCreate({
      where: { userId: payout.userId },
      defaults: { userId: payout.userId },
      transaction,
    });
    await wallet.increment('balanceMinor', { by: amountMinor, transaction });
    await LedgerEntry.create({
      userId: payout.userId,
      kind: action === 'refund_reversed' ? 'payout_reversal_refund' : 'payout_refund',
      deltaMinor: amountMinor,
      refId: payout.id,
    }, { transaction });
    return { handled: true, action };
  });
}

module.exports = { payoutTransferAction, settlePayoutTransfer };
