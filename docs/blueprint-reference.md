# Architecture blueprint: what RimSocial applies

Applied (backend `services/formulas.js` holds the formulas):
- Time_Decay, streaks (days with activity): used across ranking.
- Friend_Story_Score = (snaps x2 + chats x1.5 + streak x0.5 + replies x5 + completion x3) x e^(-0.08 h). Story replies are not tracked yet (0). The story rail orders unseen first, then this score, then newest (`services/formulas.js`, `services/ranking.js`, `services/stories.js`).
- Discover: personalised score from `main` (subscribe, interest, engagement, unseen, freshness) in `services/stories.js`. Carousel shows one story per creator; the grid shows one story per creator, and a creator in the carousel is left out of the grid.
- Discover_Feed formula (`discoverFeedScore`): subscribed x1.5, same country x1.35, skip penalty and freshness 1/(1+0.15h). It is kept as a helper; the live Discover order uses the personalised score above.
- Follow_Rank_Score: followers list (`routes/users.js`), with profile visits counted from `profile_views`.
- Best_Friend_Score: top three contacts count as Is_Best_Friend in the share sheet; Share_Target_Score (`routes/messages.js`).
- Chat_List_Score: chat list order, with streaks and pinned direct chats (up to 3, from the inbox menu).
- Quick_Add_Score = 2 per mutual friend + 5 same location (country); dismissed people are removed (`POST /v1/users/suggestions/:id/dismiss`). Phone-contact weights (50 two-way, 25 one-way) are defined but unused until contacts are read (`services/formulas.js`, `routes/users.js`).
- Spring_Damping: viewer open, close and drag snap (`frontend/src/lib/viewerMotion.js`), with stiffness 300/28 and 350/30.
- Hero tile open, drag and dismiss: `viewerMotion.js` (drag formula, 250px threshold, 0.35 release, 800px/s flick).
- Share sheet: up to 15 recipients per send, each copy sealed on the device (`POST /v1/messages/share`). A shared post is sent with its post link attached, so the chat shows the post card.
- Idempotent sends: a client id on each text send and each direct media send returns the message already created (Redis, 24h).
- Group messages: Sequence_ID from Redis INCR, stored on each message and used for history order; refused above 200 members. Per-member `group_members.lastReadAt` records when a group is opened, and the inbox calculates unread group messages after that cursor. Direct conversation open writes `readAt` for incoming messages.
- Image pipeline: fit inside 1080x1920, JPEG 0.90 for posts and stories, 0.82 for chat photos (`frontend/src/lib/imageFit.js`).
- Chunked uploads: 1 MB parts over `/v1/uploads` for posts and stories over 8 MB (`Chunk_Size_Bytes`), with resume in the same tab, a daily start cap, and a sweep after 24 hours.
- Story tray (Redis fan-out on write): `stories:tray:<viewer>`, written on post and on follow, read with a database fallback.
- Disappearing messages (Delete_Message_Now): "after viewing" and "24 hours"; "keep in chat" is the default (no deletion).
- Rimlight is the Spotlight-style short-video feed. Rimlight Discover and Explore share the same recommendation ranking engine; Following remains chronological. Ranking uses measured average watch completion, rewatch rate, fast skips, likes, repost/share rate, creator engagement, freshness and a normalized trending-sound boost calculated from public short-video uses in the last 24 hours. Posts under 300 views and 72 hours old receive controlled cold-start exposure (one seed after every four ranked posts). Posts with at least 200 views can move up one tier when measured completions + likes + reposts reach 18% of views. Feedback and successful shares update bounded per-viewer preferences and invalidate both recommendation caches. A durable per-viewer/post/surface exposure ledger records feed deliveries; recent repeated exposure applies a capped fatigue penalty, not permanent exclusion.
- Music_Track_Score: audio search ranking by public short-video uses in the last 24 hours and age (`routes/audio.js`).
- Live_Stream_Score: live list ranking by viewers, chats per minute, follows and minutes live (`routes/broadcasts.js`).
- BlurHash placeholders for photos in direct and group chats (`lib/blurhash.js`, `direct_messages.blurhash`, `group_messages.blurhash`).
- Spotlight styling on Rimlight: bottom scrim, info block, 42px translucent rail buttons, spinning audio disc.
- Group chat BlurHash: photos in group chats store and show a BlurHash placeholder.
- Creator_Score in the Explore Spotlight score (see below).
- Stories viewer: tap zones at 28% (back) and 72% (forward), top scrim, 2.5px bars, translucent reply controls.
- Stories header stays fixed while the page scrolls (the Stories page is the scroll container).
- Camera: 76px shutter, 40px translucent tools, press-and-hold to record video (up to 60s) with a red progress ring; a quick tap takes a photo. Long presses do not open the system menu.
- Discover tiles and suggestion cards: 3px corner radius; photos dimmed 45% with a contrast and saturation grade (display only).
- Design tokens (`:root` in `styles.css`). Primary buttons stay `#0095f6`, not the blueprint's `#0FADFF`.

Partly applied (signals not tracked yet count as 0):
- Discover_Score: full watch, share, rewatch, skip and exit. Story topics (Interest_Boost) are 1.
- Spotlight_Score: watch percentage, completions, loops and skips come from authenticated viewing-session samples (`spot:<post>` in Redis, written by `POST /v1/feed/feedback`); trending sound is derived from 24-hour public short-video audio usage. Creator_Score = clamp(1 + log10(1 + followers) * like rate, 1, 3), defined here because the blueprint does not define it.
- Discover click and completion models: not built, so they are 1 in `discoverFeedScore`.
- Music_Track_Score: completion, genre affinity and featured flag are 0.
- Live_Stream_Score: gifts per minute are 0.
- Quick_Add: phone contacts are not read (needs device permission and an upload path).
- Share_Target_Score: group chats (Is_Active_Group).

Not applied, and why:
- Media encryption (AES-256-GCM for chat media): needs client-side decryption of every media view. Not built, because a bug there would break every chat photo and cannot be tested here.
- Video bitrate targets (4.5 / 3.0 / 2.2 Mbps): need a transcoder on the server or client. There is none.
- Ad ranking (Ad_Rank_Score) and per-session ad caps: the app has no bids or ad campaigns, so there is nothing to score. The current rotation is kept.
- Bot risk score: the formula exists, but there is no challenge screen and no decision on what a failed challenge does. Blocking without a screen would stop sends, so it is not wired. Next step: a challenge screen, then block on failure.
- Adaptive live bitrate (`adaptiveBitrate`): the live provider (LiveKit) chooses the bitrate; the formula is not applied in the client.
- Camera pager, gallery grid, header state machine, chat swipe parallax, share drawer gesture, profile collapse, hero morph: these change the screen design, which was not to change. Each needs your approval before it is built.
- Blurred ambient backdrop and colour presets for uploaded photos (warm, noir, soft): not built. Discover photos are display-only graded; stored uploads are unchanged.
- Phone contacts for Quick Add: needs a native contacts plugin and a permission prompt.
- Video thumbnail placeholders: need a server-side BlurHash encoder.
- Spotlight cold-start queue as the blueprint describes it (a stored status and a 300-viewer batch): approximated by view counts; not a stored queue.
- Discover full-watch signals: need watch-time events from the player.
