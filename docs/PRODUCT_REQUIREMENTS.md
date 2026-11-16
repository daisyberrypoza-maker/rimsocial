# RimSocial Product Requirements and Verification Tracker

**Audit baseline:** `main` at `1edbcb3d0aeac4cb792b91fb20b20236fa8821a1`.
**Policy:** A PR or commit is not proof of completion. **Done** means code is on main and relevant automated checks pass. Visual playback and Android-specific requirements still need physical-device QA. No deployment is authorized by this tracker.

## Status definitions
- **Done (code/CI):** implemented on main; relevant automated checks passed.
- **Partial:** implementation exists but behavior, edge cases, or platform parity remain incomplete.
- **Open:** not implemented or not yet verified.
- **Blocked:** requires a native module, external provider, credentials, or a product decision.

## Requirements

| Area | Requirement | Status | Evidence / remaining work |
|---|---|---|---|
| Stories | My Stories/Friends typography, spacing, divider, ring and add-icon styling match the approved reference | Done (code/CI) | #120 sets medium-weight section labels, 12px/500 display names, 10px/400 usernames and reduced vertical gap. Physical-device reference check remains. |
| Stories | My Story first; friends ordered by interaction and recency; purple unseen and grey fully-watched rings | Partial | Friend ranking and unseen-first ordering merged in #115. Verify multi-story watched state and own-story ring behavior. |
| Stories | Sticky header and independently scrolling Stories page | Done (code/CI) | Sticky header and Stories page scroll rules merged in #115. Physical-device scroll check remains. |
| Stories | Video thumbnails/posters display while video starts | Done (code/CI) | Cloudinary first-frame JPEG URL and viewer poster merged in #117; CI passed. Adaptive ambient layer also uses the poster in #121. Verify physical-device rendering. |
| Story viewer | Left/right tap zones, middle pause, double-tap like, swipe gestures, close/back behavior | Partial | Core interactions exist. Regression-test photo/video/text, hold-to-pause, swipe-dismiss, overlays and app background/foreground. |
| Story viewer | Top and bottom readability scrim on photo, video and text stories; overlay must not intercept taps; captions and feedback above scrim | Done (code/CI) | #111 merged as `7bef272`; CI passed. Physical-device visual verification remains. |
| Story viewer | Snapchat-style ambient background and tone treatment without modifying original media | Partial | Adaptive blurred backdrop and display-only Discover/warm/noir/soft grades merged in #121. Original files remain unchanged. A user-facing preset selector/persistence flow is not wired yet. |
| Discover | 45% photo dimming without dimming text; adaptive blurred background; readable overlays | Done (code/CI) | 45% photo dimming (#110), adaptive ambient photo layers and foreground text/scrim stacking (#121) are on main. Verify at mobile sizes. |
| Discover | One item per creator in carousel/grid; eligible unseen followed creators in carousel | Done (code/CI) | Ranking/diversity port merged in #115 as `254e919`; CI passed. Verify live ranking behavior with production-like data. |
| Ranking | Discover, Friends rail, Spotlight and Creator Score use measured signals, freshness and diversity | Partial | Formulas exist, but `docs/blueprint-reference.md` identifies unmeasured signals and approximations. Do not call it a fully learned/personalized algorithm. |
| Suggestions | Remove Suggested-for-you people modules while retaining Follow back | Done (code/CI) | #114 removed the Explore/Find Friends modules and preserved Follow back. Stories Discover remains story content, not people suggestions. |
| Navigation | Profile > Followers/Following > another profile > Back returns to the originating list | Done (code/CI) | #113 merged as `4ab3145`; CI passed. Manually verify Followers, Following and Activity list flows. |
| Navigation | Local screen transitions do not wait on network; tabs replace history; Back returns to originating list/sheet | Partial | Rules are in `docs/SCREEN-RULES.md`; audit remaining routes and saved-data hydration. |
| Chat | Group message Copy, Reply and sender-only Delete for everyone | Done (code/CI) | Copy action merged in #116 as `38fb9c4`; existing reply/delete retained; CI passed. |
| Chat | Full direct/group media, unread state, navigation and message lifecycle consistency | Partial | Existing media and message flows need full regression testing on web and Android. Draft PR #67 migrations 030–032 require schema/security review. |
| Rimlight | Full-screen vertical feed, visible raised progress bar, immediate video start, correct playback lifecycle | Partial | #118 moves the seek control 16px higher; player already uses auto-start. Verify visibility, scrubbing and playback lifecycle on a physical device. |
| Profile/posts | Gift control is available on other people's eligible posts and hidden on own posts | Done (code/CI) | #118 adds Send a gift for eligible other creators' posts and hides it on own/sponsored posts; GiftSheet retains an ownership guard. |
| Upload | Background/chunked uploads retain multi-file, voice and music support | Partial | Chunked upload and background status exist on main. |
| Upload | Real percentage progress and accurate uploading/processing/success/error feedback | Open | PR #105 was closed as stale. Its XHR progress code would replace current chunked/multi-file/music support. Implement progress against the current uploader in a fresh PR. |
| Camera | Press-and-hold video capture with 60-second cap and visible progress; cancelled gestures discard | Done (code/CI, web) | Merged in #115; CI passed. Test on supported mobile browsers. |
| Camera | Native gallery, video trimming, editor tools and Android camera parity | Blocked | Requires native media/trim modules and React Native implementation. |
| Remix | Complete post remix workflow, attribution, permissions and resulting post/story behavior | Open | Viewer has a story repost action; end-to-end post remix workflow is not verified. |
| Sponsorship | Paid-partnership disclosure and CTA display | Partial | Display exists; verify sponsor identity and disclosure across feed, Discover and post detail. |
| Sponsorship | Billing, payment verification, campaign accounting and reconciliation | Open | Do not treat CTA display as a billing system. Provider-side webhooks and ledger/reconciliation tests are required. |
| Data model | Posts and Stories share `posts` with `isStory`; likes/views/comments/reposts/reports have correct relations | Partial | Models/migrations exist; verify constraints, ownership, privacy and expiry behavior. |
| Media | Cloudinary storage, video thumbnails, safe cleanup/retry and no orphaned media | Partial | Video Story thumbnail generation merged in #117; cleanup/retry system exists. Test provider failures and shared assets. |
| Android parity | React Native app mirrors web screen behavior and visual rules | Open | #118/#120/#121/#122 are web-only. `mobile/README.md` says the native app has not been installed or run; Creator Studio, Business Hub, Live, Algorithm, Ads, Explore Watch and profile feed are not ported. |
| Android parity | Native gallery, video trimming, notification chime and Snapchat editor tools | Blocked | Native modules and real-device implementation required; mobile chime is currently a placeholder. |
| Quality | CI, backend tests, frontend build, Android build and regression tests pass | Partial | CI passed for merged PRs #111, #113, #114, #115, #116, #117, #118, #120 and #121. Full Android build and end-to-end physical-device pass remain. |
| Release | Merge verified GitHub work before any deployment | Open | No deployment until outstanding GitHub requirements and release checks are complete. |

## Relevant pull requests

| PR | Scope | Current disposition |
|---|---|---|
| #111 | Story viewer readability scrim | Merged; CI passed. |
| #113 | Profile list return navigation | Merged; CI passed. |
| #114 | Remove Explore suggested-people modules | Merged; CI passed. |
| #115 | Discover ranking, Stories sticky header, camera hold-to-record | Merged; CI passed. |
| #116 | Group chat copy action | Merged; CI passed. |
| #117 | Cloudinary video Story thumbnails and viewer poster | Merged; CI passed. |
| #118 | Gift action and raised Rimlight progress bar | Merged; CI passed. |
| #120 | Stories typography and spacing | Merged; CI passed. |
| #121 | Adaptive ambient backgrounds and tone grades | Merged; CI passed. |
| #122 | Swipe navigation for Messages and Search | Merged; CI passed. |
| #123 | Shared relative-time formatting and Activity Likes filter | Open; CI running. |
| #105 | Story loading, Search navigation and upload progress | Closed as stale. Story cache invalidation and Search initialization are already fixed; video thumbnails are in #117. Upload progress remains open. |
| #99 | Find Friends and settings-menu polish | Closed as already covered by main. |
| #91 | Swipe between Messages and Search tabs | Closed; ported and merged in #122. |
| #89 | Activity feed consistency and relative-time formatting | Ported to #123; close after CI and merge. |
| #67 | Messaging integration draft and migrations 030–032 | Draft only; review schema, authorization, encryption and migration ordering before any merge. |

## Verification required before marking a requirement Done
1. Inspect the implementation on current main and the candidate branch.
2. Add/update focused regression tests for the reported behavior.
3. Run backend tests, frontend build/tests, and migration checks.
4. Check privacy, block/mute, authorization, ownership, and media lifecycle edge cases.
5. For visual/playback requirements, verify photo, video and text states at mobile viewport sizes and on a physical Android device where required.
6. Update this tracker with the merged commit and test evidence.
7. Keep deployment separate; do not deploy merely because a PR merged.

## Source documents
- `docs/SCREEN-RULES.md` — behavioral contract.
- `docs/blueprint-reference.md` — ranking/architecture status, including missing signals and unimplemented systems.
- `mobile/README.md` — native app setup and explicitly unported features.
