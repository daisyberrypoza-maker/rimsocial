# RimSocial: Release Finish Line

This document is the single release gate for the current RimSocial completion effort. Do not keep opening isolated "next fix" batches once an item below is closed. Work should be grouped into the remaining release gates, then the release decision is made against this checklist.

## Definition of done

RimSocial is complete for release only when every **release-blocking** item below is either verified complete or deliberately disabled and clearly disclosed in the product. A merged PR alone is not proof of completion. A code change is complete only after CI passes on the merged commit and the relevant database/API/UI behavior is verified.

## Gate 1 — Automated build and regression safety

- [ ] GitHub Actions runs on pull requests and pushes to `main`; backend syntax, backend tests, frontend production build and MySQL integration test are green on the latest `main` commit.
- [ ] The latest ledger regression tests run successfully; migration 023 is validated against MySQL.
- [ ] Review the current open PR list at release time; merge only after CI and relevant tests pass. Do not treat historical/closed PRs as open blockers.
- [ ] Review current open PRs and release blockers as one consolidated pass; no stale/conflicting PR should be merged simply to reduce the open count.

## Gate 2 — Core social user journeys

- [ ] On a real Android device: register/login/logout; create a post; like/unlike repeatedly with correct toggle state; comment; delete own content; repost; follow/unfollow; search/find people; view profile/followers/following; update profile photo; verify public/private visibility.
- [ ] Stories and reels upload/playback, captions/topics/mentions, draft persistence, remix permissions/source attribution, share actions, and feed navigation work end-to-end.
- [ ] Confirm existing UI and data are preserved; do not replace the app with a demo or a new scaffold.

## Gate 3 — LIVE and creator monetization

- [ ] Web coin purchases are disabled by default; only enable `ENABLE_WEB_COIN_PURCHASES=true` after published prices, verified Paystack settlement/webhook idempotency, refunds/reversals and ledger reconciliation pass. Draft prices must not be sold to users.
- [ ] Google Play Billing is implemented and tested for Android digital coin purchases, or Android purchases remain disabled. Paystack web checkout is not a substitute for Play Billing where Google Play policy requires it.

- [ ] Real audience live broadcast and reconnect behavior are verified, not just signaling or a two-host peer connection; camera/microphone permissions, viewer playback, chat, match score, and gift attribution are tested on physical devices and mobile networks.
- [ ] Coin purchase, gift spend, creator earnings holds, payout request, webhook settlement/reversal and ledger reconciliation pass integration tests. Android coin purchases must use Google Play Billing.
- [ ] Features without configured media, payment, push, or payout providers remain visibly disabled instead of showing simulated success.

## Gate 4 — Deployment and data safety

- [ ] All additive migrations required by the release are applied and verified against the deployment database, including migrations 019, 021, 022 and 023 where applicable. Back up first; preserve all user, post, order, wallet and earnings records.
- [ ] Production uses `DB_SYNC=false` and `AUTO_CREATE_DATABASE=false`; health/readiness, HTTPS, CORS, uploads, logs and rollback are verified.
- [ ] Rotate credentials exposed in the historical `clipverse.zip` and review repository history cleanup. Removing the file from the current tree alone is insufficient.
- [ ] Android release build installs and passes the smoke test; Play Billing and signing/release configuration are verified before production submission.

## External dependencies that cannot be truthfully marked done from GitHub alone

- Access to the deployed MySQL database and a safe backup window.
- Valid provider credentials/configuration for Cloudinary, TURN/media broadcast, payment/payout webhooks, and push notifications where those features are enabled.
- A physical Android device for camera, microphone, notification, billing and mobile-network checks.
- Owner action to rotate provider secrets and complete any Play Console setup requiring account authorization.

## Final sign-off

- [ ] Latest `main` commit SHA recorded here.
- [ ] CI green for that exact commit; no claim of success based on an empty status list.
- [ ] All release-blocking checklist items verified, or explicitly disabled and documented.
- [ ] Final smoke-test results recorded and one release decision made: **GO** or **NO-GO**.

Until the final sign-off is complete, report the exact remaining gate(s), not a vague "next fix". Do not promise a calendar completion date while external database/provider/device gates remain inaccessible.
