# Architecture blueprint: what RimSocial applies

Applied (backend `services/formulas.js` holds the formulas):
- Time_Decay, streaks (days with activity), Friend_Story_Score: friends carousel (`services/ranking.js`).
- Discover_Score: Discover stories (`services/stories.js`); only the subscribe signal is measured.
- Follow_Rank_Score: followers list (`routes/users.js`).
- Best_Friend_Score: top three contacts count as Is_Best_Friend in the share sheet; Share_Target_Score (`routes/messages.js`).
- Chat_List_Score: chat list order, with streaks (`routes/messages.js`).
- Quick_Add_Score: suggestions (`routes/users.js`, earlier change).
- Spring_Damping: viewer open, close and drag snap (`frontend/src/lib/viewerMotion.js`), with stiffness 300/28 and 350/30.
- Hero tile open, drag and dismiss: `viewerMotion.js` (drag formula, 250px threshold, 0.35 release, 800px/s flick).
- Share sheet: up to 15 recipients per send, each copy sealed on the device (`POST /v1/messages/share`).
- Idempotent sends: a client id on each text send returns the message already created (Redis, 24h).
- Group messages: Sequence_ID from Redis INCR (returned with the message); refused above 200 members.
- Image pipeline: fit inside 1080x1920, JPEG 0.90 for posts and stories, 0.82 for chat photos (`frontend/src/lib/imageFit.js`).
- Design tokens (`:root` in `styles.css`). Primary buttons stay `#0095f6`, not the blueprint's `#0FADFF`.

Partly applied (signals not tracked yet count as 0):
- Discover_Score: full watch, share, rewatch, skip and exit. Story topics (Interest_Boost) are 1.
- Follow_Rank_Score: profile visits. Quick_Add: phone contacts, profile searches and dismissals.
- Chat_List_Score: pinned chats (no pinning yet). Group chats are not in this order.
- Share_Target_Score: group chats (Is_Active_Group).
- Group Sequence_ID is not stored on the message, so it is not used for ordering on reload.

Not applied (the feature does not exist in RimSocial):
- Camera pager, camera shutter and zoom gestures, gallery grid.
- Spotlight (feed, cold-start queue, promotion), music engine, live calls and WebRTC streaming.
- Ephemeral direct messages, push notifications, Redis story tray fan-out.
- Video bitrate targets and 1 MB chunked uploads (uploads are single requests).
- Header state machine for a camera-first app.
