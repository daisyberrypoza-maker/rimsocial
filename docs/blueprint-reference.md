# Architecture blueprint: what RimSocial applies

Applied (backend `services/formulas.js` holds the formulas):
- Time_Decay, streaks (days with activity), Friend_Story_Score: friends carousel (`services/ranking.js`).
- Discover_Score: Discover stories (`services/stories.js`); only the subscribe signal is measured.
- Follow_Rank_Score: followers list (`routes/users.js`), with profile visits counted from `profile_views`.
- Best_Friend_Score: top three contacts count as Is_Best_Friend in the share sheet; Share_Target_Score (`routes/messages.js`).
- Chat_List_Score: chat list order, with streaks and pinned direct chats (up to 3, from the inbox menu).
- Quick_Add_Score: suggestions (`routes/users.js`): mutual friends, shared groups, same country, profile searches (`profile_views`), and dismissals (`POST /v1/users/suggestions/:id/dismiss`, -100 each).
- Spring_Damping: viewer open, close and drag snap (`frontend/src/lib/viewerMotion.js`), with stiffness 300/28 and 350/30.
- Hero tile open, drag and dismiss: `viewerMotion.js` (drag formula, 250px threshold, 0.35 release, 800px/s flick).
- Share sheet: up to 15 recipients per send, each copy sealed on the device (`POST /v1/messages/share`). A shared post is sent with its post link attached, so the chat shows the post card.
- Idempotent sends: a client id on each text send and each direct media send returns the message already created (Redis, 24h).
- Group messages: Sequence_ID from Redis INCR, stored on each message and used for history order; refused above 200 members.
- Image pipeline: fit inside 1080x1920, JPEG 0.90 for posts and stories, 0.82 for chat photos (`frontend/src/lib/imageFit.js`).
- Chunked uploads: 1 MB parts over `/v1/uploads` for posts and stories over 8 MB (`Chunk_Size_Bytes`), with resume in the same tab, a daily start cap, and a sweep after 24 hours.
- Story tray (Redis fan-out on write): `stories:tray:<viewer>`, written on post and on follow, read with a database fallback.
- Disappearing messages (Delete_Message_Now): "after viewing" and "24 hours"; "keep in chat" is the default (no deletion).
- Spotlight: Spotlight_Score ranks Explore; Promote_To_Next_Tier doubles the score; a cold-start lane shows posts under 300 views and 72 hours old, one after every four ranked posts (`services/feed.js`). Snap_Next_Page sets the Rimlight swipe paging; Rimlight stays newest-first.
- Music_Track_Score: audio search ranking by uses in the last 24 hours and age (`routes/audio.js`).
- Live_Stream_Score: live list ranking by viewers, chats per minute, follows and minutes live (`routes/broadcasts.js`).
- Design tokens (`:root` in `styles.css`). Primary buttons stay `#0095f6`, not the blueprint's `#0FADFF`.

Partly applied (signals not tracked yet count as 0):
- Discover_Score: full watch, share, rewatch, skip and exit. Story topics (Interest_Boost) are 1.
- Spotlight_Score: watch percentage, loops, trending sound and skips are 0; Creator_Score is 1 (the blueprint does not define it).
- Music_Track_Score: completion, genre affinity and featured flag are 0.
- Live_Stream_Score: gifts per minute are 0.
- Quick_Add: phone contacts are not read (needs device permission and an upload path).
- Share_Target_Score: group chats (Is_Active_Group).

Not applied, and why:
- Media encryption (AES-256-GCM for chat media) and BlurHash placeholders: need client-side decryption of every media view and a BlurHash encoder. Not built, because a bug there would break every chat photo and cannot be tested here.
- Video bitrate targets (4.5 / 3.0 / 2.2 Mbps): need a transcoder on the server or client. There is none.
- Ad ranking (Ad_Rank_Score) and per-session ad caps: the app has no bids or ad campaigns, so there is nothing to score. The current rotation is kept.
- Bot risk score: the formula exists, but a challenge is a product decision (what happens when a challenge fails). Not wired.
- Adaptive live bitrate (`adaptiveBitrate`): the live provider (LiveKit) chooses the bitrate; the formula is not applied in the client.
- Camera pager, shutter and zoom, gallery grid, header state machine, chat swipe parallax, share drawer gesture, profile collapse, hero morph: these change the screen design, which was not to change. Each needs your approval before it is built.
- Spotlight cold-start queue as the blueprint describes it (a stored status and a 300-viewer batch): approximated by view counts; not a stored queue.
- Discover full-watch signals: need watch-time events from the player.
