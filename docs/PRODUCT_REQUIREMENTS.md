# RimSocial Product Requirements and Verification Tracker

**Baseline:** `main` at `531d62d84d1a413c4f44ed6417c8cb7db4c7a4ff` (audit baseline; refresh before merge).
**Rule:** A PR, commit, or implementation note is not proof of completion. Mark **Done** only after code inspection and relevant automated/manual verification. No deployment is authorized by this tracker.

## Status definitions
- **Done** — implementation exists on main and relevant checks pass.
- **Partial** — some implementation exists, but required behavior/signals/workflow is incomplete.
- **Open** — missing, not verified, or only proposed in an unmerged PR.
- **Blocked** — requires an external service, native module, credentials, policy decision, or physical-device validation.

## Product and UI requirements

| Area | Requirement | Status | Evidence / next action |
|---|---|---|---|
| Stories | My Stories/Friends typography, spacing, divider, ring and add-icon styling match the approved reference | Open | Inspect Stories CSS/component against reference; verify on phone-sized viewport. |
| Stories | My Story first; friends ordered by interaction and recency; purple unseen and grey fully-watched rings | Partial | Main has story rail/ring logic; verify ordering, multi-story viewed state, own-story behavior. |
| Stories | Sticky header and independently scrolling story rail/Discover content | Open | Proposed in PR #109; inspect implementation and tests before integration. |
| Stories | Video Stories start promptly, use poster thumbnails, and progress indicator remains visible and correctly positioned | Partial | Viewer has play readiness logic; PR #105 proposes thumbnails/cache fixes. Verify browser autoplay policy and real Android device. |
| Story viewer | Left/right tap zones, middle pause, double-tap like, swipe gestures, close/back behavior | Partial | Existing `StoryViewer.jsx`; exercise all interactions and playback cleanup. |
| Story viewer | Top and bottom readability scrim on photo, video and text stories; overlay must not intercept taps; captions and feedback above scrim | Open | PR #111 adds CSS; verify actual DOM stacking and run visual checks before merge. |
| Story viewer | Snapchat-style ambient background and tone treatment without modifying original media | Partial | Existing story background utilities; verify Discover, Suggestions and full-screen viewer consistency. |
| Discover | Image treatment, adaptive blurred background, readability gradients and requested 45% image dimming without dimming text | Partial | PR #110 is included in baseline; verify no compounded dimming with card overlays and viewer scrim. |
| Discover | One item per creator in adjacent grid positions; carousel contains eligible unseen followed creators | Partial | PR #109 proposes diversity/carousel rules; inspect backend ranking and tests. |
| Ranking | Discover, Friends story rail, Spotlight and Creator Score use measured signals, freshness and diversity | Partial | `docs/blueprint-reference.md` documents unmeasured signals; do not treat formulas with zero-valued signals as fully personalized. |
| Suggestions | Keep Follow-back separate; remove unwanted suggested-for-you people modules from Stories/Explore | Open | PR #104 proposes this but branch is 214 commits behind main; port selectively after review. |
| Navigation | Profile > Followers/Following > another profile > Back returns to the original list | Open | PR #104 proposes route-state preservation; branch is stale and must not be merged as-is. Add navigation regression tests. |
| Navigation | Local screen transitions do not wait on network; tabs replace history; Back returns to originating list/sheet | Partial | Rules in `docs/SCREEN-RULES.md`; audit route state and data hydration. |
| Chat | Direct and group message menus, copy, sender-only delete, media/status, unread state and chat navigation work consistently | Open | PR #104 has a partial group-menu change; PR #67 is draft and contains migrations 030–032 requiring schema/security review. Audit complete chat flow. |
| Rimlight | Full-screen vertical feed, visible raised progress bar, immediate video start, correct playback lifecycle | Partial | Inspect feed player and real device; user reported progress bar and playback issues. |
| Profile/posts | Gift icon hidden on own posts | Open | Verify post-card ownership condition and add component test. |
| Upload | Real multipart progress and accurate upload/processing/success/error feedback | Open | PR #105 proposes uploader/API changes; branch is 193 commits behind main. Port/rebase safely. |
| Camera | Press-and-hold video capture, zoom/gesture behavior and editor tools work | Partial | PR #109 proposes hold-to-record; native gallery and trimming are documented gaps. |
| Remix | End-to-end remix workflow, attribution, permissions and resulting post/story behavior | Open | Existing viewer action may only repost a story; validate complete post remix workflow and backend semantics. |
| Sponsorship | Paid-partnership disclosure and CTA | Partial | Display exists; verify rendering and required disclosure. |
| Sponsorship | Billing, payment verification, campaign accounting and reconciliation | Open | Do not claim paid sponsorship is complete until provider-side webhook verification and ledger tests exist. |
| Data model | Posts and Stories share `posts` with `isStory`; likes/views/comments/reposts/reports have correct relations | Partial | Inspect Sequelize models and migrations; verify DB constraints and retention/expiry behavior. |
| Media | Cloudinary assets, thumbnail generation, safe cleanup/retry and no orphaned media | Partial | Existing cleanup migrations documented in README; verify failure/retry and shared-asset safety. |
| Android parity | React Native app mirrors web screen behavior and visual rules | Open | `mobile/README.md` explicitly says app has not been installed/run; Creator Studio, Business Hub, Live, Algorithm, Ads, Explore Watch, profile feed, trimming and Snapchat editor tools are not ported. |
| Android parity | Native gallery, video trimming, notification chime, Snapchat editor tools | Blocked | Requires native media/trim modules and implementation; mobile chime is a placeholder. |
| Quality | CI, backend tests, frontend build, Android build and regression tests pass | Open | Must inspect current workflows and run checks for each integrated change. |
| Release | Merge all verified GitHub work before any deployment | Open | No deployment in this task until GitHub requirements and checks are complete. |

## Open pull requests found during audit

| PR | Scope | Audit disposition |
|---|---|---|
| #111 | Story viewer readability scrim | One commit directly on main; inspect stacking and run CI/visual verification. |
| #109 | Discover, Stories, camera and ranking follow-up | 37 commits, based on current main; review all changed files and tests before merge. |
| #105 | Story loading, Search navigation, upload feedback | 15 commits, 193 commits behind main; do not merge as-is. Port reviewed changes onto current main. |
| #104 | Story discovery, profile return navigation, group chat actions | 6 commits, 214 commits behind main; do not merge as-is. Port reviewed changes onto current main. |
| #99, #91, #89 | Suggestions polish, tab swipe, activity consistency | Inspect whether still applicable and whether changes are already covered by main. |
| #67 | Messaging integration draft and migrations 030–032 | Draft only; schema, authorization, E2EE, and migration review required before any merge. |

## Verification checklist before marking a requirement Done
- Inspect the actual implementation on the candidate branch and current main.
- Add or update a focused regression test for the reported behavior.
- Run relevant backend tests, frontend build/lint/tests, and migration checks.
- Check privacy, blocking/muting, authorization, ownership, and media lifecycle edge cases.
- For visual/playback requirements, verify photo, video and text states at mobile viewport sizes and on a physical Android device where required.
- Update this tracker with the merged commit and test evidence.
- Keep deployment separate; do not deploy merely because a PR merged.

## Audit notes
- `docs/SCREEN-RULES.md` is the behavioral contract.
- `docs/blueprint-reference.md` is the ranking/architecture status reference and already acknowledges several missing signals and unimplemented systems.
- `mobile/README.md` is explicit that the native project has not been installed or run. Web parity cannot be marked complete while those gaps remain.
