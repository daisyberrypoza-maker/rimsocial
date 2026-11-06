# Clipverse API

Base URL: `http://localhost:3000` in development, your HTTPS domain in production.
All request and response bodies are JSON unless noted. Send `Authorization: Bearer <token>` on every request except register, login, and the view counter.

## Errors

Every error has the same shape:

```json
{ "error": "Human-readable message" }
```

Status codes: `400` bad input, `401` not logged in or session expired, `402` not enough coins, `404` not found or expired, `409` conflict, `413` file too large, `500` server error.

## Paging (feeds, explore, profile posts)

Lists are paged with an opaque cursor.

| Parameter | Default | Max | Meaning |
|---|---|---|---|
| `limit` | 10 | 30 | Items per page |
| `cursor` | none | | `nextCursor` from the previous response |

Response:

```json
{ "items": [ /* post objects */ ], "nextCursor": "eyJ0Ijo..." }
```

`nextCursor` is `null` on the last page. Keep requesting pages until it is `null`. Do not build cursors yourself.

## Post object

```json
{
  "id": "uuid",
  "kind": "video",
  "mediaUrl": "/uploads/uuid.mp4",
  "thumbUrl": null,
  "caption": "text",
  "viewCount": 120,
  "likeCount": 4,
  "createdAt": "2026-11-05T08:00:00.000Z",
  "expiresAt": null,
  "author": { "id": "uuid", "username": "ada", "displayName": "Ada", "avatarUrl": null }
}
```

Stories use the same shape, with `expiresAt` set.

## Caching and data use

- Responses include an `ETag`. Send `If-None-Match` with the last ETag, and the server replies `304 Not Modified` with no body when nothing changed.
- Uploaded media is cached for 7 days (`Cache-Control: immutable`).
- Videos support byte ranges, so the app streams the start of a clip rather than the whole file.
- Responses are gzip-compressed.
- The app loads video only for the post on screen. Other posts show a thumbnail or nothing.

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/v1/auth/register` | `username, password, email, displayName?, country?` | `{ token, user }` |
| POST | `/v1/auth/login` | `username, password` | `{ token, user }` |
| GET | `/v1/auth/me` | | `{ user }` |

## Feed

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/feed/discover` | Newest posts from the viewer's country. First page cached 30 s. |
| GET | `/v1/feed/following` | Posts from people the viewer follows, from a Redis list per user. |

## Posts

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/v1/posts` | multipart `media`, `caption?` | Returns 201 and the post |
| DELETE | `/v1/posts/:id` | | Owner only. Soft delete (204) |
| POST | `/v1/posts/:id/view` | | Counted in Redis, no auth needed (204) |
| POST | `/v1/posts/:id/like` | | Returns `{ likeCount }` |

## Stories

Stories are visible for 24 hours after upload, then removed automatically.

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/stories/rail` | Creators the viewer follows (and themselves) with active stories. `{ items: [{ user, storyCount, latestAt, expiresAt, unseen }] }`. Cached 30 s per viewer. |
| GET | `/v1/stories/users/:userId` | Active stories for one creator, oldest first. Each has `viewed`. |
| POST | `/v1/stories` | multipart `media`, `caption?` (max 200). Returns 201. |
| POST | `/v1/stories/:id/view` | Counted once per viewer (204). Returns 404 when expired. |

## Users

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/users/:username` | Use `me` for the logged-in user. Includes `postCount`, `isFollowing`, `isMe`. |
| GET | `/v1/users/:username/posts` | Paged, regular posts only. |
| POST | `/v1/users/:id/follow` | Returns `{ isFollowing, followerCount }` |
| DELETE | `/v1/users/:id/follow` | Returns `{ isFollowing, followerCount }` |

## Gifts and wallet

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/v1/gifts` | | Active gift catalog |
| POST | `/v1/gifts` | `postId, giftId` + header `Idempotency-Key`; optional `liveMatchId` for LIVE battle gifts | Required header. Retries with the same key never charge twice. Only explicitly attributed gifts count toward LIVE match scores. |
| GET | `/v1/wallet` | | `{ coinBalance }` |
| POST | `/v1/wallet/topup` | `amountMinor` | Web only. Returns a Paystack `authorizationUrl`. |
| POST | `/v1/webhooks/paystack` | Paystack event | Verified by `x-paystack-signature`. Not called by clients. |

## Background jobs (worker)

| Job | Interval | Purpose |
|---|---|---|
| Flush views | 30 s | Move view counts from Redis to MySQL |
| Purge stories | 10 min | Delete stories past 24 h, with their files |
| Holds and payouts | 1 h | Release gift earnings after 7 days, create payouts |
