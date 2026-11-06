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
- [ ] CI/build results on this feature branch.
- [ ] Live MySQL migration and authenticated API integration tests.
- [ ] Two-account end-to-end tests for offers, Fix evidence, both completion confirmations, and concurrent offer acceptance.
- [ ] Payment-provider checkout, signed webhook verification, refunds, dispute handling, and reconciled settlement. Current workflow intentionally does not collect or hold money; accepted offers are not proof of payment.
- [ ] Audit logs, abuse/rate-limit policy, and operational escalation process for disputed deals.

## Social interaction and composer

### Pending composer PR #12
Branch: `fix/reel-composer-remix-priority`
- [x] Remove duplicate `topic`/`aiLabel` model definitions introduced on the branch.
- [x] Preserve existing draft fields when the remix source loads; draft store now supports atomic functional updates.
- [ ] Confirm CI/build after these corrections.
- [ ] Full media gallery with real media assets, not only tab entry points.
- [ ] Full multi-clip editing, trimming, cover selection, and rendered template pipeline.
- [ ] True remix/edit pipeline with source attribution and creator permission checks across the entire flow.
- [ ] Verify Share to Story, mentions, topic, AI disclosure, draft restore and private/public behavior on a real device.

### Other open pull requests that must be reviewed/consolidated, not blindly merged
- PR #1: `rimsocial-full-feature-fixes` — open draft; branch is a base for other work and reported non-mergeable.
- PR #4: `rimsocial-live-match-signaling` into `rimsocial-full-feature-fixes` — open draft and not directly based on `main`; review branch ancestry and merge conflicts before extracting its changes.
- PR #5: `fix/rimsocial-social-experience` — open draft; likes/follow suggestions/follower lists/repost/post-menu changes; requires current-head CI and authenticated DB tests.
- PR #8: `rimsocial-composer-and-remix` — open, overlaps composer/remix work; compare against PR #12 and preserve any unique fixes before closing or merging.
- PR #12: `fix/reel-composer-remix-priority` — open draft; composer changes and fixes above.

## Monetization and finance
- [x] Gift eligibility and idempotency safeguards were added in PR #11 (verify merged commit remains in `main`).
- [x] Creator payout requests require verified payout destination; payout transfer waits for provider webhook confirmation.
- [ ] Paystack test-mode integration tests: checkout initialization, signed webhook verification, duplicate/replayed webhook handling, failed/cancelled payments, refunds, and settlement reconciliation.
- [ ] End-to-end wallet/ledger reconciliation and invariant tests for concurrent coin spend, gifts, earnings holds, and payouts.
- [ ] Android in-app purchases must use Google Play Billing; do not enable Paystack coin checkout inside the Android app.
- [ ] Advertiser marketplace: advertiser onboarding, campaign creation, targeting, budget/debit ledger, impressions/click tracking, billing, invoices, fraud controls, reporting and ad review. Sponsored-post disclosure alone is not a paid ads marketplace.

## Media, privacy, moderation
- [x] PR #9 introduced Cloudinary-backed media and story expiry cleanup (verify merged commit and current code).
- [ ] Test Cloudinary failures, shared asset references, deleted/expired story cleanup, avatar replacement, orphaned uploads, retry/backoff and scheduled cleanup against real Cloudinary credentials.
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
- [ ] Current-head frontend production build and backend syntax/tests for every candidate branch.
- [ ] Production schema migrations applied and verified before release; `DB_SYNC=false` and `AUTO_CREATE_DATABASE=false`.
- [ ] Verify secrets are server-only, rotate any exposed credentials, validate JWT/CORS/rate limits, and audit admin-key handling.
- [ ] Android Capacitor sync/build, install and smoke test on physical device, including login, uploads, profiles, likes, follows, reposts, stories, creator tools, and Find/Flip/Fix.
- [ ] Independent frontend/backend deployment test with correct `VITE_API_URL`, HTTPS, CORS preflight, `/health` and `/ready`.
- [ ] Backup/restore drill, structured logs/monitoring, error reporting, privacy/data retention and incident runbook.

## Release rule

Do not call RimSocial production-ready while any unchecked release blocker above remains. Keep unfinished payment/live/media features visibly disabled or labelled as not integrated rather than simulating success. Preserve existing user data; all database changes must be additive and reviewed.
