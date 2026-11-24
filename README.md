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
├── data/
│   ├── plans.json                  # VIP plans (1m, 2m, 6m, 12m)
│   ├── channels.json               # Curated channel metadata template
│   ├── mrs.sqlite                  # SQLite database (auto-initialized)
│   └── uploads/                    # Uploaded payment screenshots (outside public root)
├── scripts/
│   ├── generate-codes.js           # Idempotent CSPRNG code generator (default 1200/plan)
│   └── export-codes.js             # Exports unused codes CSV backup + inventory summary
├── server.ts                       # Main Express + Vite / production entry point (Port 3000)
├── server/
│   ├── paymentRouter.ts            # Express mount for /api/* payment, activation & admin routes
│   └── mrs-iptv-backend/src/
│       ├── config.js               # Environment config, plans & receiving accounts
│       ├── db.js                   # SQLite schema, migrations, audit_log, atomic transactions
│       ├── codes.js                # Code inventory, atomic reservation & low-stock alerts
│       ├── orders.js               # Order creation, duplicate TrxID block & 48h expiry
│       ├── verify.js               # SMS/provider matching engine & manual approve/reject
│       ├── redeem.js               # Atomic activation, plan extension & 2-device lock
│       ├── mailer.js               # Bilingual EN/BN HTML+text email templates & retry queue
│       ├── validators.js           # Zod input schemas & sanitization
│       ├── parsers.js              # bKash & Nagad SMS parser
│       ├── checkoutShield.js       # Single-use HMAC PoW, honeypot & Turnstile/hCaptcha verifier
│       ├── server.js               # Route handlers, HMAC/signature checks & rate limiters
│       └── providers/              # Modular adapters (bkash, nagad, binance, skrill, payoneer)
├── src/
│   ├── lib/mrsVip.ts               # Client SDK (API_BASE_URL, PoW challenge solver, checkout, status, activation, devices)
│   ├── lib/codes.ts                # Server-validated VIP state & device fingerprint helper
│   └── components/
│       ├── CaptchaChallengeWidget.tsx # Optional Turnstile / hCaptcha checkout widget
│       ├── PremiumModal.tsx        # VIP Plans, Free vs VIP table, Checkout & Activate flows
│       ├── AndroidTvVipGate.tsx    # TV VIP unlock & challenge-protected checkout
│       ├── AccountSupportModal.tsx # Account status, devices, favorites, support & FAQ
│       ├── LegalPolicyModal.tsx    # Terms, Refund, Privacy, DMCA & About M R S TV
│       └── AdminDashboardView.tsx  # #admin verification queue, SMTP health, revenue, audit log & stock
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

### Option A: Node.js Host + Persistent Disk (Railway / Render / VPS / Cloud Run)
1. Mount a persistent volume at `/app/data` so `data/mrs.sqlite` and `data/uploads/` survive container restarts.
2. Build and run:
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```
3. Behind Nginx / Cloudflare / Caddy, set `TRUST_PROXY=1` in `.env` so rate-limiters use real client IP headers.
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
