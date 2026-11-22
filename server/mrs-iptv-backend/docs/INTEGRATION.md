# M R S IPTV – Payment Verification Backend: Integration Guide

How to plug this backend into your existing site (`shahin-iptv.ai.studio`), step by step.

---

## 1. How it works (one minute)

```
Customer pays (bKash / Nagad / Binance Pay / Skrill / Payoneer)
        │                                   │
        │ submits form (TrxID / screenshot) │ money lands in YOUR account
        ▼                                   ▼
  POST /api/orders                  LEDGER (the source of truth)
        │                              ▲ bKash/Nagad: SMS forwarded from your phone
        │                              ▲ Binance Pay : signed API poll every 60 s
        │                              ▲ Skrill/Payoneer: Gmail receipt → Apps Script
        ▼                                   │
   VERIFIER  ── format ✓ → ledger match ✓ → amount ✓ → currency ✓ → payer ✓ → not reused ✓
        │
        ├─ all pass ──────► claim payment + take a code from that plan's pool + e-mail it
        ├─ not here yet ──► "pending" (re-checked automatically when the payment arrives, up to 48 h)
        ├─ unclear ───────► "needs_review" (you approve in one call)
        └─ wrong/reused ──► "rejected" with the reason
```

**The rule that makes it a real verification:** an order is approved only when a matching,
unclaimed payment exists in the ledger. A correctly formatted Transaction ID that is not in
your ledger is never approved. A screenshot never approves anything on its own.

### What is checked per payment method

| Method | How the payment reaches the ledger | Auto-approve needs |
|---|---|---|
| **bKash** | "You have received Tk…" SMS forwarded from your phone | TrxID found · amount ≥ price · payer number = number typed in form · not used before |
| **Nagad** | "Money Received" SMS forwarded from your phone | same as bKash |
| **Binance Pay** | Official API `GET /sapi/v1/pay/transactions` (read-only key) | Order ID found · USDT/USDC… ≥ price · not used before. Nickname-only claims go to review |
| **Skrill** | Receipt e-mail → Gmail Apps Script (DKIM-checked) | Transaction ID found · amount ≥ price · not used before |
| **Payoneer** | Receipt e-mail → Gmail Apps Script (DKIM-checked) | Payment ID found · amount ≥ price · not used before |

Also enforced for everyone: email syntax + disposable-domain block + MX check, phone normalisation
(`01XXXXXXXXX` / `+880…` / international), Transaction ID format per method, price per plan/currency,
payment not older than 72 h than the order, one payment → one order → one code, screenshot integrity
(real JPG/PNG/WebP, minimum size, SHA-256 duplicate block, editing-software traces flagged).

### Prices used (edit in `src/config.js`)

| Plan | bKash / Nagad | Binance / Skrill / Payoneer |
|---|---|---|
| 1 Month (`1m`) | 110 TK | $1 |
| 2 Months (`2m`) | 210 TK | $2 |
| 6 Months (`6m`) | 610 TK | $6 |
| 12 Months (`12m`) | 1220 TK | $12 |

> Binance Pay is always verified in USD (USDT/USDC/FDUSD/BUSD count as $1 each), even when
> the customer picks it from the Bangladesh tab. If you want a TK price for Binance, tell me.

---

## 2. Deploy the backend

You need a host that runs Node **22.13+** and has a **persistent disk** (the database is one SQLite file).
A small VPS ($4–6/month) or Render/Railway **with a persistent disk** both work. Free tiers that wipe the
disk on restart will lose orders and codes – don't use those.

```bash
unzip mrs-iptv-payment-backend.zip && cd mrs-iptv-backend
npm install --omit=dev
cp .env.example .env        # fill it in (section 3)
npm run codes:import -- codes/codes_ALL.csv     # load the 4,800 codes (section 5)
npm start
```

Put it behind HTTPS (Render/Railway do this for you; on a VPS use Caddy or nginx + Let's Encrypt).
Check it: `curl https://YOUR-BACKEND-URL/api/health` → `{"ok":true,…}`.
Keep it running with `pm2 start src/server.js --name mrs-pay` (or systemd).

**Back up `data/` daily** (it holds the database and the uploaded screenshots).

---

## 3. Configure `.env`

Generate three secrets (32+ chars each) with `openssl rand -hex 32`: `ADMIN_TOKEN`, `INGEST_KEY`, `TOKEN_SECRET`.
In production the server refuses to start with weak or missing secrets.

**E-mail (activation codes).** Use a transactional provider (Brevo, Resend, Amazon SES, Mailgun – all give SMTP
credentials) and a sender on your own domain with SPF + DKIM set up, otherwise codes land in spam. A Gmail
app password works for testing but is capped (~500/day) and often flagged.
Set `SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM`.
Mails are queued in the database and retried with back-off (8 attempts) – a mail-server hiccup never loses a code.

`SITE_ORIGINS` must contain your site's origin (`https://shahin-iptv.ai.studio` by default), otherwise browsers
block the calls (CORS).

---

## 4. Feed the ledger (this is what makes verification real)

### 4a. bKash + Nagad – SMS forwarding from the phone that receives the money
1. Use an Android phone (or a spare SIM phone) that is **always on and online** with your receiving SIM.
2. Install an SMS-forwarding app that can send an HTTP POST (examples: *SMS Forwarder*, *HTTP SMS*, MacroDroid, Tasker).
3. Rule: for SMS from sender **bKash** and **NAGAD**, POST to
   `https://YOUR-BACKEND-URL/api/ingest/sms` with
   * header `x-ingest-key: <your INGEST_KEY>`
   * header `content-type: application/json`
   * body `{"from":"<sender>","body":"<message text>","receivedAt":"<ISO time>"}` (use your app's placeholders)
4. **Important:** the backend only accepts the official sender IDs (`BKASH_SMS_SENDERS`, `NAGAD_SMS_SENDERS`).
   Anyone can text your phone a fake "You have received Tk 110" from a normal number – those are refused.
   Check what name your phone really shows for bKash/Nagad and put it in `.env` if different.
5. **Test with a real message** (formats differ between app versions):
   ```bash
   npm run sms:test -- bKash "You have received Tk 110.00 from 01712345678. Fee Tk 0.00. Balance Tk 500.00. TrxID 9G7H2K4L1M at 07/11/2026 13:45"
   npm run sms:test -- NAGAD "<paste a real Nagad receipt SMS>"
   ```
   The bKash pattern was written from published bKash examples. **Nagad's was written from general
   knowledge – paste me one real Nagad SMS if `sms:test` says "NOT parsed" and I'll adjust it.**
   Unparsed messages are kept in the `ingest_log` table, so nothing is lost.

If the phone is off, orders simply stay `pending` and are verified automatically when the SMS arrives.

### 4b. Binance Pay – official API
1. Binance → *Account → API Management → Create API* → **Enable Reading only** (no trading, no withdrawals).
2. Restrict the key to your server's IP address.
3. Put `BINANCE_API_KEY` and `BINANCE_API_SECRET` in `.env`. The backend polls Pay history every 60 s
   (`GET /sapi/v1/pay/transactions`, signed with HMAC-SHA256) and records incoming transfers only.

### 4c. Skrill + Payoneer – Gmail receipt forwarder
Neither offers a public API for personal accounts, but both e-mail you every incoming payment.
1. Open `integrations/gmail-payment-forwarder.gs` and follow the 4 setup steps at the top
   (paste into script.google.com, set `ENDPOINT` + `INGEST_KEY`, add a 1-minute trigger).
2. It forwards only mails whose DKIM verification by Google passed for skrill.com / payoneer.com;
   the backend re-checks the sender domain. Forged "you received $12" e-mails are refused.
3. If a receipt isn't understood, it appears in `ingest_log` as `unparsed`; add the payment by hand (4d).
   **These two e-mail layouts are parsed with tolerant patterns, not an official spec – send me one real
   receipt of each (hide personal data) and I'll tighten them.**

### 4d. Manual fallback (always available)
You checked your Skrill/Payoneer dashboard yourself? Add the payment and waiting orders verify instantly:
```bash
curl -X POST https://YOUR-BACKEND-URL/api/admin/ledger -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"channel":"skrill","trxId":"4567890123","amount":6}'
```

> **Why not call bKash/Nagad directly?** Personal bKash/Nagad accounts have no API to look up a received
> payment. Merchant accounts do (bKash Tokenized Checkout, Nagad Merchant). If you upgrade, the ledger layer
> is the only part that changes – add a new source that calls `addLedger()`.

---

## 5. Activation codes

* **4,800 codes are included**: 1,200 each for 1, 2, 6 and 12 months, all unique, 10 digits, never starting with 0
  (`codes/codes_ALL.csv`, plus one file per plan).
* Load them: `npm run codes:import -- codes/codes_ALL.csv` (safe to repeat; existing codes are skipped).
* A code is **inventory** until a payment is verified. Only issued codes can be redeemed, so a leaked list is useless.
* After a verified payment the customer receives a code **from the pool of the plan they paid for**.
* If a pool runs low the backend creates new codes automatically (`AUTO_REFILL_CODES=true`). Add more manually any time:
  `npm run codes:generate -- --per-plan 3000` (tops each plan up to 3,000 available) or `POST /api/admin/codes/generate`.
* **Best practice:** the included codes were generated in my workspace. For full secrecy, generate your own on your
  server instead of importing mine: `npm run codes:generate -- --per-plan 1200` – same result, and the codes never
  leave your machine.
* Rules: one code = one device (first to redeem). The plan clock starts at activation (`EXPIRY_FROM=issue` starts it at payment).
  Same device can re-redeem to restore access. Support can move a code: `reset-device` (section 7).

**If your existing site already validates codes itself** (e.g. a Firestore/Sheet list): import the same CSV there
and keep your own redeem screen. The backend still verifies payments and e-mails the code. You lose the server-side
device lock/expiry unless your existing logic enforces it – the built-in redeem (section 6) is recommended.

---

## 6. Wire it into your existing site

Files: `frontend/mrsVip.js` (copy into your site, e.g. `src/lib/mrsVip.js`).

### Field mapping (your modal → API)

| In your modal | API field | Values |
|---|---|---|
| Plan cards (1 / 2 / 6 / 12 months) | `plan` | `1m` `2m` `6m` `12m` |
| Tab "Bangladesh" / "International" | `region` | `BD` / `INTL` |
| Selected payment option | `channel` | `bkash` `nagad` `binance` `skrill` `payoneer` |
| WhatsApp or Mobile Number | `phone` | text |
| Email Address (For Code Delivery) | `email` | text |
| Option 1: Transaction ID / Sender Ref | `trxId` | text (optional if screenshot given) |
| Option 2: Upload screenshot | `screenshot` | `File` (optional if trxId given) |

### Paste this into the AI Studio chat for your site
(replace `YOUR-BACKEND-URL`, then paste the contents of `frontend/mrsVip.js` where it says so)

> Integrate my payment-verification backend into the VIP Pass modal. Backend base URL: `https://YOUR-BACKEND-URL`.
>
> 1. Create `src/lib/mrsVip.js` with the exact code below and call `configure({ apiBase: 'https://YOUR-BACKEND-URL' })` once at app start. *(paste mrsVip.js here)*
> 2. In the "Get VIP Pass" tab, replace the current SUBMIT ORDER handler. Validate locally that WhatsApp/Mobile and Email are filled and that at least one of Transaction ID or screenshot is provided, then call `submitOrder({ plan, region, channel, phone, email, trxId, screenshot })` using this mapping: plan cards → `1m|2m|6m|12m`; tab Bangladesh → `BD`, International → `INTL`; payment option → `bkash|nagad|binance|skrill|payoneer`. Disable the button and show a spinner while submitting.
> 3. If it throws an error with `.fields`, show each message under the matching input (`email`, `phone`, `trxId`, `screenshot`, `plan`, `channel`). Otherwise show the error message.
> 4. On success show a status panel and call `waitForVerification(res.orderId, { onUpdate })`: `pending` → spinner "Waiting for your payment to be confirmed… this can take a few minutes"; `verified` → green "Payment verified! Your activation code was emailed to {email}. Check Inbox/Spam, then paste it in Redeem Code."; `needs_review` → amber with `message`; `rejected`/`expired` → red with `message`. Show the order reference `orderId`. Never show or generate a code on the client and never fake a success state.
> 5. Redeem Code tab: ACTIVATE PASS NOW calls `redeemCode(code)`. On success turn on VIP mode (no ads, 4K priority streams, YouTube section) based on `isVip()` and show plan + expiry date; on error show `err.message`.
> 6. On app start, and every 6 hours and whenever the app returns to the foreground, call `refreshEntitlement()` and set VIP mode from `result.active`.
> 7. Remove any old hard-coded or local code validation and any client-side "VIP" shortcuts.

The Median iOS wrapper needs nothing extra – it loads the same site. Keep `SITE_ORIGINS` = the site's origin.

### API reference (public)

| Call | Purpose |
|---|---|
| `GET /api/plans` | plans + channels |
| `POST /api/orders` (multipart) | create order → `{orderId,status,reason,message,email}` |
| `GET /api/orders/:orderId` | poll status (`pending` `needs_review` `verified` `rejected` `expired`) |
| `POST /api/redeem` `{code,deviceId}` | activate → `{plan,expiresAt,token}` |
| `POST /api/entitlement` `{token,deviceId}` | still valid? |

---

## 7. Running it day to day (admin API)

All calls: `-H "Authorization: Bearer $ADMIN_TOKEN"` against `https://YOUR-BACKEND-URL/api/admin/…`

| Task | Call |
|---|---|
| Overview (orders by status, code stock, mail queue) | `GET /stats` |
| Orders needing you | `GET /orders?status=needs_review` |
| One order (+ linked payment + audit trail) | `GET /orders/:id` |
| View its screenshot | `GET /orders/:id/screenshot` |
| Approve (payment already linked) | `POST /orders/:id/approve` `{}` |
| Approve with no ledger payment (you checked the wallet) | `POST /orders/:id/approve` `{"note":"Checked Skrill: $6 received 07-Nov"}` – a written note is mandatory |
| Reject | `POST /orders/:id/reject` `{"reason":"…"}` |
| Re-run verification | `POST /orders/:id/recheck` |
| Re-send the code e-mail | `POST /orders/:id/resend` |
| Payments not yet matched to an order | `GET /ledger?claimed=0` |
| Add a payment manually | `POST /ledger` `{"channel","trxId","amount"}` |
| Code stock / export | `GET /stats` · `GET /codes/export?plan=6m&status=available` |
| Make more codes | `POST /codes/generate` `{"plan":"6m","count":500}` |
| Customer got a new phone | `POST /codes/:code/reset-device` |
| Disable a code (refund/abuse) | `POST /codes/:code/revoke` |

Review reasons you'll see: `sender_mismatch` (paid from a different number), `paid_for_other_plan`,
`payment_too_old`, `currency_mismatch`, `nickname_match_needs_confirmation`, `duplicate_submission`,
`screenshot_unreadable`.

---

## 8. Go-live checklist

- [ ] HTTPS backend reachable; `/api/health` OK; `data/` on a persistent disk with backups
- [ ] `ADMIN_TOKEN`, `INGEST_KEY`, `TOKEN_SECRET` set (32+ chars, different from each other)
- [ ] Test e-mail: do a manual approve on a test order to your own address; check inbox **and spam**
- [ ] SMS forwarder: send yourself a small bKash/Nagad payment; confirm it appears in `GET /ledger`
- [ ] `npm run sms:test` passes with a real bKash and a real Nagad SMS
- [ ] Binance key is read-only + IP-restricted (or skip Binance auto and use manual ledger)
- [ ] Gmail script trigger running; send a real small Skrill/Payoneer payment and confirm it is parsed
- [ ] Codes imported (`GET /stats` shows stock per plan)
- [ ] Frontend wired (section 6); one full run: pay → submit → e-mail → redeem → VIP on
- [ ] `SITE_ORIGINS` matches your site

## 9. Honest limits

* Verification is only as good as the ledger feed: if your phone is off or the Gmail script stops, orders wait
  (never auto-approve) and complete when the payment shows up. Orders still unmatched after 48 h expire; you can
  recheck/approve them later.
* A screenshot can be edited by anyone, so it never approves an order alone. To let the server read the TrxID printed
  on screenshots, run `npm install tesseract.js` (optional; first run downloads language data).
  Without it, screenshot-only orders go to manual review.
* Sender-number matching for bKash/Nagad assumes the customer pays from the number they typed. If they use another
  number the order goes to review rather than failing.
* No rejection/confirmation e-mails are sent – only the activation code. (Otherwise anyone could make your system
  e-mail strangers.)
* Rate limits are in-memory per server process.

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| Browser says CORS / network error | `SITE_ORIGINS` exactly equals the site origin (scheme + host, no trailing slash) |
| Orders stay `pending` | `GET /ledger` – is the payment there? If not: SMS app / Gmail trigger / Binance key. If yes but different TrxID: customer typed another reference |
| SMS arrives but not stored | `ingest_log` table: `rejected_sender` (wrong sender ID in `.env`) or `unparsed` (format) |
| Code e-mail not received | `GET /stats` → `outbox`; `email_outbox.last_error`; check SPF/DKIM and spam folder; `POST /orders/:id/resend` |
| "Not enough codes" | can't happen with `AUTO_REFILL_CODES=true`; otherwise generate more |
