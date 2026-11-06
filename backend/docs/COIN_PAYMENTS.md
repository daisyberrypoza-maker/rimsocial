# RimSocial coin payments

## Current implementation
- Web checkout uses Paystack and a server-owned pack ID; the client cannot set arbitrary prices or coin counts.
- NGN pack prices are draft configuration values and must be approved before launch.
- A signed Paystack `charge.success` webhook must match the server-configured pack's amount and currency before crediting coins.
- A unique ledger reference prevents the same payment reference from crediting a wallet twice.
- Creator gift share remains `config.creatorGiftShare = 0.5` (50%).
- Android coin checkout remains disabled until Google Play Billing is implemented and verified. Do not use Paystack for digital coin purchases inside the Android app.
- Only NGN is enabled in the current catalogue. Other currencies must not be enabled until merchant eligibility, settlement, taxes, refunds, and regional requirements have been confirmed.

## Draft NGN packs (not final prices)
| Coins | Web price |
|---:|---:|
| 80 | ₦1,100 |
| 400 | ₦5,300 |
| 800 | ₦10,400 |
| 4,000 | ₦50,000 |

## Before launch
1. Configure Paystack test keys and webhook URL `/v1/webhooks/paystack`.
2. Test checkout initialization, valid/invalid signatures, duplicate/replayed events, amount/currency mismatch, failed/cancelled payments, refunds, and wallet/ledger reconciliation.
3. Implement Google Play Billing on Android, with server-side purchase-token verification, acknowledgement, refunds/revocations, and idempotent credits before enabling the native purchase button.
4. Confirm the coin-to-creator earnings conversion, the 50/50 split, fees, payout holds, and consumer disclosures with real financial examples.
5. Approve prices before making them production commitments.
