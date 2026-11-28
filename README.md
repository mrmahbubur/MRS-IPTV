# M R S IPTV — TV NETWORK

Production full-stack streaming platform featuring a dark premium UI, HLS live TV player, strict server-side VIP payment verification, SMS & webhook auto-matching, atomic activation code inventory (`1,200+` cryptographic codes per plan), emailed code delivery, and an Admin Verification Dashboard.

---

## Brand Palette, Typography & Stack

| Token | Value | Usage |
| :--- | :--- | :--- |
| **Background** | `#0B0D12` (`--theme-bg`) | Primary app canvas & viewport backdrop |
| **Surface** | `#141821` | Cards, modals, tables, navigation rails |
| **Primary Accent** | `#38BDF8` (`--theme-accent`) | Focus rings, active nav, live controls |
| **VIP Gold** | `#F5B301` | VIP badges, Best Value plan, checkout highlights |
| **Display & Body Fonts** | `Plus Jakarta Sans` + `Inter` (Google Fonts) | Display headings and UI body text |

- **Frontend Stack**: React 19, TypeScript, Tailwind CSS v4, `hls.js`, `video.js`, `lucide-react`
- **Backend Stack**: Node.js, Express, SQLite (`node:sqlite` / `better-sqlite3`-compatible SQL schema ready for PostgreSQL), Helmet, strict CORS allowlist, `express-rate-limit`, Zod, Multer, Nodemailer (SMTP)

---

## Project Structure

```text
├── .github/workflows/
│   └── ci-smoke.yml                # GitHub Actions CI + optional post-deploy Render smoke check
├── data/
│   ├── plans.json                  # VIP plans (1m, 2m, 6m, 12m)
│   ├── channels.json               # Curated channel metadata template
│   ├── mrs.sqlite                  # SQLite database (auto-initialized)
│   └── uploads/                    # Uploaded payment screenshots (outside public root)
├── public/
│   ├── ad-gate.js                  # Synchronous <head> gate, fail-closed VIP check & DOM purge
│   ├── ads.config.js               # Central Monetag zone & rewarded config
│   ├── ad-manager.js               # Free-only Monetag loader, EU/UK consent, caps & empty-slot collapse
│   └── rewardAds.js                # Official Monetag rewarded VIP flow (hidden until official snippet enabled)
├── scripts/
│   ├── generate-codes.js           # Idempotent CSPRNG code generator (default 1200/plan)
│   ├── export-codes.js             # Exports unused codes CSV backup + inventory summary
│   └── smoke-check.mjs             # Automated staging/Render deployment smoke check
├── server.ts                       # Main Express + Vite / production entry point (Port 3000)
├── server/
│   ├── adsRouter.ts                # Monetag-only /api/ads/*, /api/rewards/*, /admin/rewards/*
│   ├── clientIp.ts                 # Centralized IP normalization, trust proxy & subnet masking
│   ├── security.ts                 # WAF, Security Headers, DNS/redirect-safe SSRF & rate limiters
│   ├── paymentRouter.ts            # Express mount for /api/* payment, activation & admin routes
│   └── mrs-iptv-backend/src/
│       ├── clientIp.js             # Pure-Node IP normalization, CIDR/origin checks & proxy resolver
│       ├── config.js               # Environment config, plans, rewards & receiving accounts
│       ├── db.js                   # SQLite schema (including ad_events, reward_sessions & reward_grants)
│       ├── codes.js                # Code inventory, atomic reservation & low-stock alerts
│       ├── orders.js               # Order creation, duplicate TrxID block & 48h expiry
│       ├── verify.js               # SMS/provider matching engine & manual approve/reject
│       ├── redeem.js               # Atomic activation, reward1h HMAC tokens & device lock
│       ├── mailer.js               # Bilingual EN/BN HTML+text email templates & retry queue
│       ├── validators.js           # Zod input schemas & sanitization
│       ├── parsers.js              # bKash & Nagad SMS parser
│       ├── checkoutShield.js       # Single-use HMAC PoW, honeypot & Turnstile/hCaptcha verifier
│       ├── server.js               # Route handlers, HMAC/signature checks & rate limiters
│       └── providers/              # Modular adapters (bkash, nagad, binance, skrill, payoneer)
├── src/
│   ├── lib/mrsVip.ts               # Client SDK (API_BASE_URL, PoW challenge solver, checkout, status, activation, devices)
│   ├── lib/codes.ts                # Server-validated VIP & reward1h state + device fingerprint helper
│   ├── lib/useAdGate.ts            # React bridge to window.MRS_ADS, consent & reward expiry alerts
│   └── components/
│       ├── AdBannerUnit.tsx        # Free-only Monetag 728x90 / 320x50 banner (never on player/checkout/legal)
│       ├── WatchAdVipButton.tsx    # Official Monetag rewarded 1-hour VIP CTA (hidden until snippet configured)
│       ├── CaptchaChallengeWidget.tsx # Optional Turnstile / hCaptcha checkout widget
│       ├── PremiumModal.tsx        # VIP Plans, Free vs VIP table, Checkout & Activate flows
│       ├── AndroidTvVipGate.tsx    # TV VIP unlock & challenge-protected checkout
│       ├── AccountSupportModal.tsx # Account status, devices, favorites, support & FAQ
│       ├── LegalPolicyModal.tsx    # Terms, Refund, Privacy (Monetag only), DMCA & About
│       └── AdminDashboardView.tsx  # #admin verification queue, Monetag ad & reward analytics, toggles & stock
└── .env.example                    # Complete documented environment template
```

---

## 1. Local Installation & Setup

### Prerequisites
- Node.js `>= 22.13.0` (built-in `node:sqlite` support)
- npm `>= 10`

### Install Dependencies
```bash
npm install
```

### Configure Environment
```bash
cp .env.example .env
```
Edit `.env` and set strong random values for:
- `ADMIN_TOKEN` (used as Bearer token for `/api/admin/*`)
- `INGEST_KEY` and `SMS_WEBHOOK_SECRET` (used by your Android SMS Forwarder app)
- `TOKEN_SECRET` and `SECURITY_SECRET` (HMAC secrets for VIP entitlement tokens and checkout Proof-of-Work challenges)
- `CHECKOUT_CHALLENGE_REQUIRED` (`true`), `CHECKOUT_POW_DIFFICULTY` (`10`), plus optional `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` or `HCAPTCHA_SITE_KEY`/`HCAPTCHA_SECRET_KEY` for external CAPTCHA verification
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL` (for Nodemailer code emails and `< 50` low-stock alerts)

### Initialize Database & Generate 1,200 Activation Codes Per Plan
```bash
# Generates 1,200 unique MRS-<PLAN>-XXXX-XXXX-XXXX codes per plan (4,800 total)
npm run codes:generate

# Or specify a custom target count per plan:
node scripts/generate-codes.js 1500

# Export unused codes to CSV backup & print inventory counts:
npm run codes:export
```
Codes use `crypto.randomBytes` with an unambiguous alphabet (`A-Z`, `2-9`, excluding `0/O/1/I`) and are inserted inside a single SQLite transaction. Running `generate-codes.js` again is idempotent — it only tops up plans below the target count.

### Run Locally
```bash
# Development (Express API + Vite middleware on port 3000)
npm run dev

# Production build & start
npm run build
npm start
```
Open:
- Main app: `http://localhost:3000/`
- Admin dashboard: `http://localhost:3000/#admin`

---

## 2. Connecting Your Existing Site (`API_BASE_URL`)

If you already host a standalone frontend (for example on Cloudflare Pages, Netlify, Vercel, or an existing HTML/JS web app) and want to connect it to this M R S IPTV backend:

### Step 1: Allow Your Existing Origin in Backend CORS
In the backend `.env`:
```env
SITE_ORIGINS="https://your-existing-site.com,https://www.your-existing-site.com,http://localhost:3000"
```

### Step 2: Set `API_BASE_URL` on Your Existing Frontend
- In this React codebase, `API_BASE_URL` is exported at the top of `src/lib/mrsVip.ts` and reads `import.meta.env.VITE_API_BASE_URL` (default `''` for same-origin):
  ```env
  VITE_API_BASE_URL="https://api.your-mrs-backend.com"
  ```
- In a vanilla JS site, set `const API_BASE_URL = "https://api.your-mrs-backend.com";` at the top of your main JS file and send all requests below to `${API_BASE_URL}/api/...`.

### Step 3: Exact Public & Admin Endpoint Contract

All endpoints return consistent JSON:
```json
{
  "ok": true,
  "data": { ... },
  "error": null
}
```
On failure:
```json
{
  "ok": false,
  "data": null,
  "error": { "code": "ALREADY_USED", "message": "Friendly explanation..." }
}
```

#### Public Endpoints
| Method & Path | Request / Headers | Response `data` |
| :--- | :--- | :--- |
| `GET /api/plans` | — | Array of active plans (`1m`, `2m`, `6m`, `12m`) with BDT/USD prices and `durationDays` |
| `GET /api/payment-methods` | — | Configured receiving accounts (bKash, Nagad, Binance Pay, Skrill, Payoneer), bilingual EN/BN instructions, and support links |
| `GET /api/payments/challenge` | — | Single-use HMAC-signed SHA-256 Proof-of-Work challenge (`challengeToken`, `nonce`, `difficulty`) + optional `turnstileSiteKey` / `hcaptchaSiteKey` |
| `POST /api/payments/submit` | `multipart/form-data`: `name`, `email`, `plan` (`1m`/`2m`/`6m`/`12m`), `method` (`bkash`/`nagad`/`binance`/`skrill`/`payoneer`), `trxId`, `senderNumber`, optional `screenshot` (png/jpg/webp/pdf <= 3MB), `challengeToken`, `challengeSolution`, `website_url` (empty honeypot), optional `captchaToken`, optional `Idempotency-Key` header | `{ ref, status: "pending", expiresAt, method, amountExpected, currency }` (never returns the code) |
| `GET /api/orders/:ref/status` | `?email=...` or `email` match | `{ ref, status: "pending" \| "verified" \| "rejected" \| "expired", plan, createdAt, verifiedAt, codeSent }` (never returns the code) |
| `POST /api/activate` | JSON `{ code, email, deviceId }` | `{ token, plan, planLabel, expiresAt, daysRemaining, deviceCount, deviceLimit, extended }` — error codes: `INVALID_CODE`, `ALREADY_USED`, `REVOKED`, `EXPIRED`, `DEVICE_LIMIT` |
| `GET /api/status` | `Authorization: Bearer <token>` | `{ active, plan, expiresAt, daysRemaining, deviceLimit, devices: [...] }` |
| `POST /api/devices/remove` | `Authorization: Bearer <token>`, JSON `{ deviceHash }` | Updated `{ devices, removed }` |
| `POST /api/support/contact` | JSON `{ name, email, subject, message }` | `{ ticketId, received: true }` |

#### Webhook Endpoints
| Method & Path | Authentication | Purpose |
| :--- | :--- | :--- |
| `POST /api/webhooks/sms` | `x-ingest-key: <INGEST_KEY>` and/or `x-webhook-signature: <HMAC-SHA256>` | Receives forwarded bKash/Nagad SMS, logs to `payments_log`, auto-matches pending orders |
| `POST /api/webhooks/binance` | `BinancePay-Signature` / `x-binance-signature` | Verified Binance Pay merchant callback |
| `POST /api/webhooks/skrill` | Skrill `md5sig` / `sha256` merchant check | Verified Skrill Quick Checkout callback |
| `POST /api/webhooks/bkash` | `x-bkash-signature` (`BKASH_WEBHOOK_SECRET`) | Verified official bKash merchant callback |
| `POST /api/webhooks/nagad` | `x-nagad-signature` (`NAGAD_WEBHOOK_SECRET`) | Verified official Nagad merchant callback |

#### Admin Endpoints (`Authorization: Bearer <ADMIN_TOKEN>`)
- `GET /api/admin/orders?status=pending&q=...`
- `POST /api/admin/orders/:id/approve`
- `POST /api/admin/orders/:id/reject` (`{ reason }`)
- `POST /api/admin/orders/:id/resend`
- `GET /api/admin/codes/stats`
- `POST /api/admin/codes/generate` (`{ plan, count }`)
- `POST /api/admin/codes/:id/revoke`
- `POST /api/admin/mail/verify` (`{ sendTest, to }`) & `POST /api/admin/mail/flush`
- `GET /api/admin/revenue`
- `GET /api/admin/audit`
- `GET /api/metrics` *(and `GET /api/security/metrics`)* — Authenticated security, WAF & rate-limiter bucket telemetry (`Authorization: Bearer <METRICS_TOKEN>` or `<ADMIN_TOKEN>`; add `?format=prometheus` or `Accept: text/plain` for Prometheus `0.0.4` scraping)

#### Backend Google Drive & Gmail Endpoints (`/api/workspace/*`)
All requests pass the client-acquired Firebase Auth Google OAuth access token via `Authorization: Bearer <googleAccessToken>` (or `x-google-access-token` alongside `Authorization: Bearer <ADMIN_TOKEN>` for admin endpoints):
- `GET /api/workspace/status` — Verifies the Google OAuth token server-side and returns granted Drive/Gmail status.
- `GET /api/workspace/drive/files`, `GET /api/workspace/drive/files/:fileId/content`, `POST /api/workspace/drive/files`, `PATCH /api/workspace/drive/files/:fileId`, `DELETE /api/workspace/drive/files/:fileId` — Server-side Google Drive API v3 operations (`drive`, `appDataFolder`, playlists, media).
- `POST /api/workspace/drive/import-m3u` — Downloads a `.m3u`/`.m3u8` file from Google Drive on the backend, writes it to `data/`, and reloads live channel sources.
- `POST /api/workspace/drive/backup` *(Admin + Google token)* — Uploads a JSON DB snapshot and unused VIP codes CSV into `"M R S IPTV Backups"` on Google Drive.
- `GET /api/workspace/gmail/labels`, `GET /api/workspace/gmail/messages`, `GET /api/workspace/gmail/messages/:messageId`, `POST /api/workspace/gmail/send`, `POST /api/workspace/gmail/drafts` — Server-side Gmail API v1 reading, MIME decoding, sending, and draft creation.
- `POST /api/workspace/gmail/sync-payments` *(Admin + Google token)* — Scans Gmail for incoming Skrill/Payoneer payment receipts, validates DKIM/SPF headers, inserts into `ledger`, and auto-verifies matching orders.
- `POST /api/workspace/gmail/flush-outbox` *(Admin + Google token)* — Delivers `queued` / `failed` emails in `email_outbox` directly through Gmail API when SMTP isn't configured.

---

## 3. Setting Up SMS Auto-Match (bKash & Nagad Personal Numbers)

1. Install an Android SMS Forwarder app (e.g., *SMS Forwarder* or *Tasker*) on the phone receiving bKash/Nagad SMS.
2. Configure a webhook rule filtered to sender `bKash` or `NAGAD` matching `"You have received Tk"` or `"Money Received"`:
   - **URL**: `https://your-backend-domain/api/webhooks/sms`
   - **Method**: `POST`
   - **Headers**:
     - `Content-Type: application/json`
     - `x-ingest-key: <YOUR_INGEST_KEY>`
     - Optional: `x-webhook-signature: <HMAC-SHA256 hex of raw JSON body using SMS_WEBHOOK_SECRET>`
   - **Body**:
     ```json
     {
       "sender": "%from%",
       "body": "%text%",
       "receivedAt": "%timestamp%"
     }
     ```
3. When a matching SMS arrives (exact `trx_id`, `amount >= planPrice`, `receivedAt` within allowed order window), the server atomically marks the order `verified`, reserves & sends one `unused` code for that plan, and emails it to the customer.

---

## 4. Production Deployment Guide

### Option A: Deploy from GitHub to Render (Recommended)

This repository includes `.node-version` (`22.14.0`), `engines.node >= 22.13.0`, and `render.yaml` (Render Blueprint) pre-configured for zero-friction deployment.

#### Method 1 — One-Click Blueprint (`render.yaml`)
1. Push this repository to GitHub (make sure `.env` is **not** committed — `.gitignore` excludes it automatically).
2. Open **Render Dashboard → New → Blueprint**, connect your GitHub repository, and Render will auto-detect `render.yaml`.
3. Fill in the prompted `sync: false` secrets in Render (`GEMINI_API_KEY`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL`, and optional Turnstile/hCaptcha/Cloudinary keys). Internal secrets (`ADMIN_TOKEN`, `TOKEN_SECRET`, `SECURITY_SECRET`, etc.) are generated automatically by Render.
4. Click **Apply**. Render builds the Vite client + CJS server bundle (`dist/server.cjs`) and verifies `/api/health`.

#### Method 2 — Manual Render Web Service
If you create a Web Service manually from GitHub in Render:
- **Runtime**: `Node` (automatically picks up `.node-version` = `22.14.0` for built-in `node:sqlite`)
- **Build Command**: `npm ci --include=dev && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`
- **Required Environment Variables**:
  - `NODE_VERSION=22.14.0`
  - `NODE_ENV=production`
  - `TRUST_PROXY=1`
  - `ADMIN_TOKEN`, `INGEST_KEY`, `SMS_WEBHOOK_SECRET`, `TOKEN_SECRET`, `SECURITY_SECRET`, `INTERNAL_WEBHOOK_SECRET`, `CAMELLIA_TOKEN`
  - `GEMINI_API_KEY`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL`, `MAIL_TRANSPORT=smtp`
  - Optional: `SITE_ORIGINS` (Render's `RENDER_EXTERNAL_URL` is automatically trusted on startup; add any custom domain comma-separated).

- **Optional Observability & Cloudflare Origin Hardening**:
  - **Metrics Scraping (`/api/metrics`)**: Set `METRICS_TOKEN` in Render Environment (or use `ADMIN_TOKEN`) and scrape `/api/metrics?format=prometheus` with `Authorization: Bearer <METRICS_TOKEN>` for rate-limiter active buckets, blocked counts, WAF counters, and runtime memory gauges (JSON returned by default).
  - **Cloudflare Origin Secret (`CF_ORIGIN_SECRET`)**: When placing Cloudflare in front of Render, generate a random secret (`openssl rand -hex 32`), set `CF_ORIGIN_SECRET` in Render Environment (and optionally `CLOUDFLARE_STRICT_ORIGIN=1`), then create a **Cloudflare Rules → Transform Rules → Modify Request Header** rule that sets static header `x-cf-origin-secret` to the exact same value.
  - **GitHub Actions CI & Smoke Hook**: `.github/workflows/ci-smoke.yml` runs typechecks, build, unit/integration tests, and local compiled smoke checks on every push/PR, and triggers post-deploy smoke checks when `vars.RENDER_EXTERNAL_URL` or `workflow_dispatch` is set.

#### Persistent Storage Note (Free Tier vs Starter+)
- **Free Tier**: SQLite (`data/mrs.sqlite`) and activation codes (`1,200` per plan) auto-initialize on every boot, so the app runs cleanly with zero extra setup, though runtime orders/uploads reset on redeploy/spin-down.
- **Starter+ with Persistent Disk**: Add a Render Disk mounted at `/var/data`, uncomment the `disk:` section in `render.yaml`, and set `DATA_DIR=/var/data` (or `DB_PATH=/var/data/mrs.sqlite` and `UPLOAD_DIR=/var/data/uploads`) so orders, SQLite state, and screenshots persist across redeploys.

### Option B: Node.js Host / VPS / Cloud Run
1. Mount a persistent volume at `/app/data` so `data/mrs.sqlite` and `data/uploads/` survive container restarts.
2. Build and run:
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```
3. Behind Nginx / Cloudflare / Caddy, set `TRUST_PROXY=1` in `.env` so rate-limiters use real client IP headers. If proxying through Cloudflare on Render, enable `CLOUDFLARE_STRICT_ORIGIN=1` (verifies Cloudflare edge CIDRs + `CF-Ray`) or set `CF_ORIGIN_SECRET` with a Cloudflare Transform Rule sending `x-cf-origin-secret` so unproxied visitors cannot spoof `CF-Connecting-IP`.
4. Schedule daily SQLite backup cron:
   ```bash
   0 3 * * * sqlite3 /app/data/mrs.sqlite ".backup '/app/data/backups/mrs-$(date +\%F).sqlite'"
   ```

### Option B: Porting to PostgreSQL
The SQL schema in `server/mrs-iptv-backend/src/db.js` uses standard normalized tables (`plans`, `codes`, `orders`, `payments_log`, `entitlements`, `devices`, `audit_log`) with `UNIQUE (method, trx_id)`. When scaling to managed PostgreSQL:
- Replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `SERIAL PRIMARY KEY`.
- Replace `INSERT OR IGNORE` / `datetime('now')` with `ON CONFLICT DO NOTHING` / `NOW()`.
- Keep the exact transaction boundaries around code picking (`FOR UPDATE SKIP LOCKED` in PostgreSQL).

---

## 5. Verification & Test Checklist

Run the automated backend integration suite (33 assertions covering code generation, duplicate `trx_id` blocking, SMS auto-matching, concurrent race protection, manual admin approval/rejection, double-redeem prevention, 2-device limits, and signed status checks):

```bash
npm run test:payments
npm run test:livecheck
npx tsx --test tests/adGate.test.ts server/channelGeo.test.ts tests/clientIp.test.ts

# Post-deploy / staging smoke test against local or Render URL:
BASE_URL=https://your-app.onrender.com npm run smoke
```

Manual E2E checklist:
- [ ] **Submit Order**: Checkout accepts name, email, plan, method, TrxID, sender account, optional screenshot and returns a `pending` order reference without leaking any code.
- [ ] **Duplicate TrxID Blocked**: Resubmitting the same `(method, trx_id)` fails cleanly with `409 DUPLICATE_TRX`.
- [ ] **SMS Auto-Match**: Posting a valid `bKash` SMS to `POST /api/webhooks/sms` transitions the matching order to `verified`, marks one code `sent`, and queues email delivery.
- [ ] **Manual Admin Approve / Reject**: Opening `/#admin` shows pending orders with screenshot preview; approving issues a single unique code and emails the buyer.
- [ ] **Activate Code**: Entering `MRS-<PLAN>-XXXX-XXXX-XXXX` in **Activate VIP** validates atomically, creates the entitlement, and returns a signed Bearer token.
- [ ] **Double-Redeem Blocked**: Reusing the same code returns `ALREADY_USED`.
- [ ] **2-Device Lock & Removal**: Activating a 3rd distinct `deviceId` returns `DEVICE_LIMIT`; removing an old device in **Account > Devices** frees the slot.
- [ ] **Expired Order**: Orders unverified past `PENDING_TTL_HOURS` (`48h`) transition to `expired` and cannot be verified.
- [ ] **Concurrent Orders Get Different Codes**: Two simultaneous approvals/auto-matches execute inside exclusive DB transactions and never receive the same code.

---

## 6. Ad Monetization Policy & Rewarded 1-Hour VIP System

M R S IPTV uses **Monetag as the sole advertising network** and enforces strict separation between free-tier advertisements and zero-ad VIP experiences:

### Network Policy (Monetag Only)
- **Monetag (`monetag.showRegularAds: false` by default)**:
  - Existing owner publisher verification (`<meta name="monetag" content="fa9656182dbc7301dcd9a2326441dcf3" />`) and all 10 Smartlink zone URLs (`https://uplcm.com/4/...`) remain intact inside `public/ads.config.js` and `server/adsRouter.ts`.
  - **Rewarded 1-Hour VIP (`MONETAG_REWARDED_ENABLED=false` by default)**: **Monetag has no official rewarded-ad format snippet/callback configured for this site yet (`snippet: null`, `MONETAG_REWARDED_SHOW_FN=""`), so the "Watch an ad, get 1 hour VIP" button is automatically hidden on the UI.** To enable it later, either set `MONETAG_REWARDED_ENABLED=true` and `MONETAG_REWARDED_SHOW_FN="<globalFunctionName>"` in `.env` (or configure `showFn` + `Rewarded: ON` in `#admin` → Monetag Ads, or paste Monetag's official rewarded-format snippet under `public/ads.config.js`). No SDK function names or callbacks are fabricated.
- **Placement & Cap Rules**:
  - Monetag ads load ONLY in Free mode (`MRS_ADS.state() === 'free'`) after EU/UK consent.
  - Never shown on the player page, checkout, activation, account, support, legal, or admin pages.
  - Popunder / OnClick max 1 per 30 minutes and 3 per day, triggered only from normal page clicks (never Play, Close, or form buttons) and disabled in app WebViews.
  - Push pre-prompt appears only after the 2nd visit or 60 seconds on site, and "No thanks" is remembered for 30 days.

### Central Ad Gate & Fail-Closed Protection
- `public/ad-gate.js` loads synchronously first in `<head>`, starts in `window.MRS_AD_STATE = "pending"`, and injects CSS hiding all `.ad-slot` / `.mrs-free-upsell` containers until verified `"free"`.
- Verification uses `GET /api/status` (3s timeout) with the saved Bearer token. Paid VIP (`plan: "vip"`) and active 1-hour rewards (`plan: "reward1h"`) are both returned as `active: true` and receive the identical zero-ad experience (no banners, no upsells, and `enterVipMode()` unregisters Monetag push service workers and unsubscribes Web Push).
- If a token exists and `/api/status` fails or times out, the gate **fails closed** (stays `"pending"` or uses the future `mrs_vip_ads_hint` expiry for ad-hiding only, never showing ads and never granting channel access from `localStorage` alone).

### "Watch an Ad, Get 1 Hour VIP" Backend Limits
- **Client (`public/rewardAds.js` + `WatchAdVipButton.tsx`)**: Hidden by default until Monetag's official rewarded completion callback is configured; when active, syncs cooldown/quota via `GET /api/rewards/status`, starts `POST /api/rewards/start { deviceId, network: 'monetag' }`, awaits official completion (or `ADS_TEST_MODE` simulated preview), and calls `POST /api/rewards/claim { nonce, deviceId }` + `MRS_ADS.enterVipMode()` to unlock channels ad-free for 60 minutes.
- **Server Routes (`server/adsRouter.ts`)**:
  - `GET /api/rewards/status?deviceId=...` — Returns eligibility, active grant status, cooldown minutes remaining, daily remaining quota, and channel-unlock policy.
  - `POST /api/rewards/start` — Creates a single-use cryptographic `nonce` (valid 10 min) and enforces caps.
  - `POST /api/rewards/claim` — Atomically verifies `nonce`, `(now - created_at) >= minWatchMs` (`15000`ms default), single-use locking, and issues a `60`-minute `reward1h` token (`reward_sessions` + `reward_grants` tables).
  - `POST /api/rewards/postback` — Optional S2S callback protected by `MONETAG_POSTBACK_SECRET` (timing-safe comparison).
  - `GET /api/admin/rewards/report`, `POST /api/admin/rewards/revoke`, `POST /api/admin/rewards/toggle` (and `/admin/rewards/*` aliases; protected by `x-admin-token` / `Authorization: Bearer <ADMIN_TOKEN>`).
- **Default Environment Configuration (`.env.example`)**:
  - `ADS_TEST_MODE=true`, `MONETAG_SHOW_REGULAR_ADS=false`, `MONETAG_REWARDED_ENABLED=false`, `MONETAG_REWARDED_SHOW_FN=""`
  - `MONETAG_BANNER_ENABLED=true`, `MONETAG_STICKY_ENABLED=true`, `MONETAG_POPUNDER_ENABLED=false`, `MONETAG_INTERSTITIAL_ENABLED=false`, `MONETAG_PUSH_ENABLED=false`
  - `REWARD_DURATION_MINUTES=60`, `REWARD_MIN_WATCH_MS=15000`, `REWARD_UNLOCKS_VIP_CHANNELS=true`
  - `REWARD_COOLDOWN_MINUTES=180` (3-hour cooldown after expiry)
  - `REWARD_MAX_PER_DEVICE_PER_DAY=3`, `REWARD_MAX_PER_IP_PER_DAY=6`, `REWARD_MAX_STARTS_PER_IP_PER_HOUR=20`
  - Rejects stacking while paid VIP or an active reward pass is already active. Only HMAC-hashed device IDs and client IPs are stored.

### Test Mode (`testMode: true` Default)
- While `ADS_TEST_MODE=true` (default in `.env.example` and `server/adsRouter.ts`), all banner slots render `[TEST 728x90]` / `[TEST 320x50]` placeholders and the reward button opens a simulated countdown modal with **zero external ad-network calls**. Canceling/closing the modal rejects cleanly and grants zero VIP time.

### Honest Security Limitation
> **Important Note on Reward Verification Without S2S Postbacks:**  
> Without an active server-to-server (S2S) network postback (`REWARD_REQUIRE_POSTBACK=true` with a verified network secret), the server can enforce `minWatchMs` (`15s`) elapsed time between `/api/rewards/start` and `/api/rewards/claim`, single-use nonces, and device/IP binding — **not** cryptographic proof that a user visually watched the third-party player. A determined user could script a `POST /api/rewards/claim` call after waiting `minWatchMs`. Server-enforced 3-hour cooldowns, 1-active-reward-per-device locks, daily device/IP caps, hourly start rate limits, and `/admin/rewards/revoke` keep worst-case abuse bounded to a few free hours per device per day.
