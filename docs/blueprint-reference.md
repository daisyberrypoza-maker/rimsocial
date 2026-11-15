# Architecture blueprint: what RimSocial applies

Applied now:
- Design tokens (`:root` in `frontend/src/styles.css`): values match the current look. Primary buttons use `#0095f6`, not the blueprint's `#0FADFF`.
- Share sheet ranking (`GET /v1/messages/share-targets`): shares sent in 14 days x8, chat messages in 7 days x5, mutual follow x25 (stands in for best friends), minus 0.25 per hour since last message. Group chats are not ranked yet.
- Share sheet send (`POST /v1/messages/share`): up to 15 recipients per send, each copy sealed on the device for its recipient.

Not applied (not in RimSocial, or needs signals we don't track):
- Camera pager, Spotlight, music engine, live streaming, camera capture gestures.
- Push notifications, Redis fan-out, ephemeral DMs, media encryption, group chat encryption.
- Discover signals (full watch, rewatch, skip, exit), since RimSocial tracks view counts only.
- Header state machine (RimSocial headers keep their current behaviour).
