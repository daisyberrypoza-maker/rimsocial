# RimSocial deployment and readiness

## Frontend and API can be deployed independently

The frontend is a Vite/React application in `frontend/`; the API is an Express service in `backend/`. They can be run separately or the backend can serve the built frontend for a single-origin deployment.

### Frontend hosting (Vercel / GitHub Pages)

1. Build the frontend with `npm ci && npm run build` from `frontend/`.
2. Set `VITE_API_URL` to the API origin, for example `https://api.example.com` (do not append `/v1`).
3. Set `CORS_ORIGINS` on the API to the exact public frontend origin(s), separated by commas.
4. Deploy the contents generated in `frontend/dist` to the configured Vercel or GitHub Pages project.

Vite proxies `/v1` and `/uploads` to localhost:3000 only during local development. A deployed frontend must have `VITE_API_URL` configured unless it is served from the same origin as the API.

### API-only hosting

Set `SERVE_FRONTEND=false`, `AUTO_CREATE_DATABASE=false`, and `DB_SYNC=false`. Configure database credentials, `JWT_SECRET` (random, at least 32 characters), `CORS_ORIGINS`, Cloudinary credentials, and the payment-provider secrets you actually use. The database and schema must already exist and be migrated before starting the service.

- `GET /health` is a process liveness check.
- `GET /ready` verifies that the API can authenticate to the database.
- CORS handles preflight requests and only returns browser access headers for configured origins. Explicit wildcard patterns such as `https://*.vercel.app` can be configured when genuinely needed; avoid broad wildcards in production.
- Set `TRUST_PROXY` to the appropriate proxy hop count only when the service is behind a trusted reverse proxy.

### Local development

Run `npm run dev --prefix backend` and `npm run dev --prefix frontend`. The Vite development server runs on port 5173 and proxies API requests to port 3000. Copy each `.env.example` to its local environment file and use non-production credentials.

## Monetization and advertising truth-in-labeling

Coin purchases must be credited by the signed Paystack webhook; payout transfers remain pending until provider webhooks confirm settlement. Never mark a payout paid manually from the client. Use test credentials and provider test mode before enabling live money movement.

The current sponsored-post fields provide paid-partnership disclosure and a destination CTA; they are **not yet a complete self-service ad marketplace**. Do not sell ad inventory or promise advertiser billing, budget pacing, campaign targeting, or verified ad delivery until advertiser campaign management, payment reconciliation, impressions/click measurement, and admin review are implemented and tested.

## Remix permissions

A creator must opt in with “Allow others to remix this post.” The API checks this permission on the server and records the source post on each new remix. Private posts and stories cannot be remixed through this flow.

## Release gate

A successful CI build proves syntax and compilation only. Before production, test account creation/login, CORS from the real hosted frontend and Android/iOS origins, media upload/deletion against Cloudinary, story expiry, coin webhook idempotency, gift ledger accounting, payout success/failure webhooks, moderation/report workflows, backups/restore, and rate limits/abuse controls.

## Database migrations

Back up the production database and confirm the backup restores **before** running any migration. Apply the SQL files in `backend/migrations/` in numeric order, skipping any already applied, and note which one is the last you ran:

- `019-find-flip-fix.sql`
- `020-media-cleanup-jobs.sql`
- `021-content-earnings.sql`
- `022-live-match-gift-attribution.sql`
- `023-ledger-unit-consistency.sql`
- `024-public-live-broadcasts.sql`

With `DB_SYNC=false` the app does not create or alter tables, so a missing migration shows up as runtime errors on the related features. After migrating, check the readiness endpoint and run the backend tests against the migrated schema. Keep the backup until the release has been verified; rolling back means restoring it, so decide the rollback point before you start.
