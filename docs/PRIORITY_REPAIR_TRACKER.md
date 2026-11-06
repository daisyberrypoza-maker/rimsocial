# RimSocial Priority Repair Tracker

Last reviewed: 2026-11-06
Repository: `daisyberrypoza-maker/rimsocial`
Default branch: `main`

This is a living release checklist. A branch or pull request is not considered complete until its changes are reviewed, CI passes on the current head, API/database behavior is tested, and mobile/device flows are checked where relevant.

## Current priority work

### Find, Flip & Fix
- [x] Additive Sequelize models for business profiles, opportunities, offers, and work updates.
- [x] Authenticated API to submit/list/edit/pause opportunities and create business profiles.
- [x] Three lanes: Find, Flip, Fix; money represented in integer minor units.
- [x] Operator-only moderation APIs for business profiles and opportunities using `ADMIN_API_KEY`.
- [x] Offers with recipient-only accept/reject, sender withdrawal, idempotency key support, and transaction-protected acceptance.
- [x] Fix work progress/blocker/completion updates and two-party completion confirmation.
- [x] HTTPS-only evidence/website links and public discovery restricted to approved listings.
- [x] React Business workspace and navigation entry.
- [x] Additive production SQL migration: `backend/migrations/019-find-flip-fix.sql`.
- [x] Flip realized-profit calculation from completed accepted purchase price, actual sale price and additional costs; append-only outcome history and buyer-only financial visibility.
- [x] Backend syntax checks, backend unit tests, frontend production build and authenticated API lifecycle tests against an ephemeral MySQL service passed on PR #18's tested head (run: https://github.com/daisyberrypoza-maker/rimsocial/actions/runs/42137634775).
- [x] Two-account integration coverage for profile moderation, approved discovery, idempotent offers, Fix evidence privacy, both completion confirmations, and Flip realized-profit privacy/calculation.
- [ ] Apply migration 019 to the real deployment database and verify it without deleting existing records.
- [ ] Add concurrent-offer acceptance stress test and run on the production-like database.
- [ ] Payment-provider checkout, signed webhook verification, refunds, dispute handling, and reconciled settlement. Current workflow intentionally does not collect or hold money; accepted offers are not proof of payment.
- [ ] Audit logs, abuse/rate-limit policy, and operational escalation process for disputed deals.

## Social interaction and composer

### Pending composer PR #12
Branch: `fix/reel-composer-remix-priority`
- [x] Remove duplicate `topic`/`aiLabel` model definitions introduced on the branch.
- [x] Preserve existing draft fields when the remix source loads; draft store now supports atomic functional updates.
- [x] Backend syntax checks and frontend production build passed on current tested head (run: https://github.com/daisyberrypoza-maker/rimsocial/actions/runs/42134730388); physical-device testing remains open.
- [ ] Full media gallery with real media assets, not only tab entry points.
- [ ] Full multi-clip editing, trimming, cover selection, and rendered template pipeline.
- [ ] True remix/edit pipeline with source attribution and creator permission checks across the entire flow.
- [ ] Verify Share to Story, mentions, topic, AI disclosure, draft restore and private/public behavior on a real device.

### Pull request audit outcome
- PR #1, #4 and #5 were closed as superseded after comparing them with current `main`; their older code would overwrite newer social/feed implementations. The useful external-share action from PR #1 was ported into PR #14.
- PR #8 was closed as superseded by PR #12 to avoid competing composer implementations.
- PR #12: `fix/reel-composer-remix-priority` — open draft; duplicate model fields and draft reset are fixed and CI passed. Full media editing/rendered remix and paid-ad billing remain open.
- PR #13: `feature/find-flip-fix-priority` — closed as superseded by PR #18.
- PR #14: native external share sheet — merged into `main`; physical Android verification remains open.
- PR #15: payout webhook settlement/reversal fix — merged into `main`; Paystack sandbox verification remains open.
- PR #16: old media cleanup branch — superseded by PR #19.
- PR #17: self-declared sponsored-post guard — merged into `main`.
- PR #18: Find/Flip/Fix — merged into `main`; CI passed, including ephemeral-MySQL lifecycle tests. Real payment integration and production migration remain open.
- PR #19: `fix/cloudinary-orphan-cleanup-v2` — superseded by PR #20.
- PR #20: `fix/cloudinary-orphan-cleanup-v3` — active media cleanup PR; initial current-head CI passed, but real Cloudinary failure/retry tests and production migration remain open.

## Monetization and finance
- [x] Gift eligibility and idempotency safeguards were added in PR #11.
- [x] Payout success/failure/reversal settlement now uses atomic status transitions and retry-safe ledger entries (PR #15 merged; Paystack sandbox verification remains open).
- [x] Self-declared sponsored posts are blocked unless created through an approved, funded campaign (PR #17 merged). This is a safety gate, not an advertiser marketplace.
- [x] Creator payout requests require verified payout destination; payout transfer waits for provider webhook confirmation.
- [ ] Paystack test-mode integration tests: checkout initialization, signed webhook verification, duplicate/replayed webhook handling, failed/cancelled payments, refunds, and settlement reconciliation. Payout webhook transitions are unit-tested, but provider sandbox tests remain.
- [ ] End-to-end wallet/ledger reconciliation and invariant tests for concurrent coin spend, gifts, earnings holds, and payouts.
- [ ] Android in-app purchases must use Google Play Billing; do not enable Paystack coin checkout inside the Android app.
- [ ] Advertiser marketplace: advertiser onboarding, campaign creation, targeting, budget/debit ledger, impressions/click tracking, billing, invoices, fraud controls, reporting and ad review. Sponsored-post disclosure alone is not a paid ads marketplace.

## Media, privacy, moderation
- [x] PR #9 introduced Cloudinary-backed media and story expiry cleanup (verify merged commit and current code).
- [x] PR #20 adds a durable media cleanup queue, orphan-upload cleanup, shared-reference checks and retry/backoff; syntax/unit/frontend build and MySQL integration CI passed on the tested head.
- [ ] Exercise Cloudinary upload failure, delete failure, shared media, avatar replacement and retry behavior with configured credentials before production deployment.
- [ ] Confirm all public-profile and feed visibility rules with anonymous, follower, non-follower, blocked and private-account scenarios.
- [ ] Confirm reporting is persisted and reviewable; moderation queue, user appeals, enforcement history and operator UI still need verification.
- [ ] Add rate limits/abuse controls for uploads, comments, follows, reports, offers, live signaling and payment endpoints.

## LIVE and notifications
- [ ] Current WebRTC signaling is not the same as a production public audience broadcast. Validate host-to-host match, then implement/verify viewer broadcast architecture, TURN/media infrastructure, reconnect, room capacity, moderation and live end-state.
- [ ] Verify live scoring/gifting is server-authoritative and cannot be forged by clients.
- [ ] Push notification delivery, opt-in, retries, token lifecycle, and notification preferences.
- [ ] Test live and creator interactions on physical Android devices and poor/mobile networks.

## Production and release safety
- [x] PR #10 added API-only mode, explicit CORS, `/health`, database-backed `/ready`, and production sync safeguards (verify merged commit remains in `main`).
- [x] Current-head frontend production build and backend syntax/unit tests passed for the tested PR #20 head; re-run after any subsequent branch changes.
- [ ] Production schema migrations applied and verified before release; `DB_SYNC=false` and `AUTO_CREATE_DATABASE=false`.
- [ ] Verify secrets are server-only, rotate any exposed credentials, validate JWT/CORS/rate limits, and audit admin-key handling.
- [ ] Android Capacitor sync/build, install and smoke test on physical device, including login, uploads, profiles, likes, follows, reposts, stories, creator tools, and Find/Flip/Fix.
- [ ] Independent frontend/backend deployment test with correct `VITE_API_URL`, HTTPS, CORS preflight, `/health` and `/ready`.
- [ ] Backup/restore drill, structured logs/monitoring, error reporting, privacy/data retention and incident runbook.

## Release rule

Do not call RimSocial production-ready while any unchecked release blocker above remains. Keep unfinished payment/live/media features visibly disabled or labelled as not integrated rather than simulating success. Preserve existing user data; all database changes must be additive and reviewed.
