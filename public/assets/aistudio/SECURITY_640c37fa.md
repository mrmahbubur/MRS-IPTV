# SECURITY — threat model, hardening, incident response

Written for a system that holds **money records and access control for a paid service**.
The two things an attacker wants are: a subscription they did not pay for, and the stream
URLs of a catalogue you are licensed to sell. Everything below is organised around those.

This is not a list of hopes. Each control names the file that implements it and a command
that demonstrates it.

---

## 1. Threat model

| # | Threat | Who | Impact | Control (implemented) | Demonstrated by |
|---|---|---|---|---|---|
| T1 | Payment marked paid without money arriving | anyone who can reach the payment path | free subscriptions, your money | trust boundary is explicit: only `confirmPayment` fulfils, only a verified provider answer or an admin reaches it. Amount re-checked server-side. | `409 amount_mismatch` test; tampered internal call → 401 |
| T2 | Payment replayed / double-credited | customer, or a retrying provider | two subscriptions for one payment | `provider_ref` unique per settlement, `codes(order_id)` unique, fulfilment in one transaction | replay test: code count unchanged |
| T3 | Stream URL harvested and shared | scrapers, ex-customers | the product itself | URLs never rendered to unentitled users; proxy gate checks entitlement server-side every request; signed, expiring tokens for cookie-less players | guest `/watch/:id` response contains no `.m3u8`; gate 401/402/404 |
| T4 | Proxy used as an open relay | anyone | bandwidth, liability, licence breach | gate refuses any URL that is not an alive channel in an active catalogue | `404 channel_unavailable` for an arbitrary URL |
| T5 | Admin takeover | credential stuffing | everything | scrypt password hashing, rate-limited login, fail2ban, no default account, HTTPS-only, session cookie `httpOnly`+`SameSite=Lax` | login rate-limit test; `create-admin` requires a password |
| T6 | Session theft / fixation | XSS, network | account access | CSP `script-src 'self'` (no inline scripts), no third-party JS, httpOnly cookie, hashed session tokens in the DB, session purge job | `181` audit checks CSP + no external script |
| T7 | CSRF (including login CSRF) | hostile page | action as the victim | session CSRF token on every state change **and** cross-site `Origin`/`Referer`/`Sec-Fetch-Site` rejection for anonymous posts | `POST /register` with a foreign Origin → 403 |
| T8 | Machine API key leaked | log, repo, laptop | free subscriptions, catalogue exposure | keys hashed at rest (SHA-256), per-caller, scoped, revocable, `last_used_at` visible, loopback-only endpoints | create → use → revoke → `401 api_key_invalid` |
| T9 | Signature forgery on the internal payment call | anyone on the host network | free subscriptions | HMAC over the body with a secret separate from the session secret; amount independently re-checked | tampered payload → `401 invalid_signature` |
| T10 | Licence breach (unlicensed catalogue sold) | operator error | legal exposure | ingest refuses without a recorded attestation and refuses blocked hosts | blocked-host ingest test |
| T11 | Data loss | disk, operator | every subscription | nightly `VACUUM INTO` backups, 14 kept, restore drill documented | `scripts/worker.js --job=backup` |
| T12 | Enumeration of customers/codes/channels | scraper | privacy | public API returns no stream URLs, no emails; codes are SHA-256 only; internal endpoints need keys; rate limits on login/checkout/activation | audit §11 |
| T13 | Provider outage weaponised into free access | network attacker | free subscriptions | a failed verification is a refusal, never a success; the gate fails **closed** on billing errors | provider-down test path |
| T14 | Supply chain | npm | total | two runtime dependencies (`express`, `better-sqlite3`); `npm ci` from the lockfile; no post-install scripts of our own | `package.json` |

Not in scope, stated honestly: DDoS beyond upstream rate limiting, a compromised host
(if root is taken, the database is readable), and physical access.

---

## 2. Secrets

| Secret | Purpose | Where | Rotation |
|---|---|---|---|
| `SESSION_SECRET` | signs session cookies | `/etc/mrs-site/app.env`, 0640 root:mrs | quarterly, or immediately on suspicion — invalidates all sessions |
| `INTERNAL_WEBHOOK_SECRET` | signs backend→billing payment calls | same file | quarterly, deploy both sides together |
| API keys (`mrs_…`) | machine auth to `/api/internal` | your backend's secret store | on staff change, immediately on leak |
| Provider credentials (bKash/Nagad) | automatic verification | same env file | per provider policy; sandbox keys never in production |
| SMTP password | activation email | same env file | on provider change |

Rules, enforced by process rather than trust:

- the env file is **0640 root:mrs** and lives in `/etc`, never in the repo; `.gitignore` covers `.env`
- the app cannot read files outside its unit's `ReadWritePaths`/`ProtectSystem=strict` jail
- the plaintext of an API key is shown once and never stored — there is no "show key" button
  because there is nothing to show
- `grep -r "mrs_" /var/log/mrs/` should return nothing: keys are never logged

**Check:**

```bash
stat -c '%a %U:%G' /etc/mrs-site/app.env        # 640 root:mrs
sudo -u mrs grep -c . /etc/mrs-site/app.env     # can read
grep -rn "mrs_" /var/log/mrs/ | head            # empty
```

---

## 3. Authentication and access

### Passwords
scrypt with per-user salt (`src/lib/crypto.js`). Minimum length is enforced on register.
There is no password-reset flow yet — add one via the outbox (`email_tokens` table) rather
than bolting on a weaker mechanism.

### Sessions
Token is random, stored **hashed** in `sessions`; the cookie is `httpOnly`, `SameSite=Lax`,
`Secure` in production. Expired sessions are purged hourly by the worker.

### CSRF
Two layers: the session token (per session, checked on every unsafe method) and an origin
check for requests that arrive without a session. The second layer is what stops login CSRF.

### Rate limits (`src/lib/http.js`, `src/config.js`)
| Surface | Default |
|---|---|
| login | 10 / window |
| register | 10 / window |
| checkout | 20 / window |
| activation | 12 / 10 min |
| public API | 120 / window |

Per-process, in-memory. **If you run more than one instance, move these to Redis** — otherwise
the effective limit multiplies by the instance count.

### Machine auth (`src/integrations/api-auth.js`)
`Authorization: Bearer mrs_…` (or `x-api-key`). Scopes: `payments:write`,
`entitlement:read`, `catalog:write`, `channels:read`. Wrong scope → **403**, missing/invalid
key → **401**. These are different on purpose: 403 tells you the key is real but
under-privileged, which is what you need to know at 3 a.m.

### Admin surface
Every `/admin` route is behind `requireAdmin` (session + role). There is no token-in-URL.
Anonymous access returns 401, non-admin returns 403 — verified for all nine routes by
`npm run audit`.

---

## 4. Network hardening

```
internet ──► 443 nginx ──► 127.0.0.1:3100 (Node, HOST=127.0.0.1)
                              └─ /api/internal/* refused by nginx AND bound to loopback
```

Belt and braces on the internal API: it is bound to loopback **and** nginx denies the path.
Either alone would do; both means a misconfiguration in one does not expose it.

**Check from inside and outside:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/api/internal/ping   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://billing.yourdomain.com/api/internal/ping  # 404
ss -ltnp | grep 3100        # 127.0.0.1:3100, not 0.0.0.0
```

Also: `ufw` default-deny inbound, fail2ban on the login endpoint, `server_tokens off`,
HSTS, TLS 1.2+ only, unattended security upgrades.

---

## 5. Application hardening already in the code

- **Security headers + CSP** on every response (`src/middleware/context.js`):
  `default-src 'self'`, `script-src 'self'`, no inline script, `frame-ancestors 'self'`,
  `base-uri 'self'`, `object-src` blocked. hls.js is served from our own `/static`.
- **No third-party requests from the browser** — no CDN, no fonts, no analytics. Nothing
  to leak a session to, nothing to break when a CDN is compromised.
- **Input validation** for every route body (`src/lib/validate.js`), length-capped so a
  1 MB payload cannot become a 1 MB database row.
- **SQL** is parameterised everywhere; there is no string-built query in the codebase.
- **Output escaping** — every interpolated value in views goes through `escapeHtml`.
- **Errors** never leak internals: 5xx returns "Something went wrong"; the stack goes to the
  log, not the response.
- **Money** is integer minor units (`amount_poisha`). No float arithmetic anywhere.
- **Codes** are stored as SHA-256 only, single-use by conditional `UPDATE`, expiring.
- **Audit log** for every money and access action, with actor and metadata.
- **Fail-closed gate** — if the billing service is unreachable, the proxy refuses (503) rather
  than serving.

`npm run audit` asserts the headers, the absence of stream URLs in public APIs, the
inaccessibility of `/admin`, `/.env`, `/src/*`, and order ownership enforcement.

---

## 6. Hardening checklist (tick before go-live)

**Secrets**
- [ ] `SESSION_SECRET` and `INTERNAL_WEBHOOK_SECRET` are independent, 32+ random bytes
- [ ] env file is `0640 root:mrs`, outside the repo
- [ ] no secret in git history (`git log -p | grep -i "secret\|password"`)
- [ ] provider credentials are production keys, sandbox keys removed

**Network**
- [ ] app binds `127.0.0.1`; `ss -ltnp` confirms
- [ ] `/api/internal/*` → 404 from the internet, 200 from loopback
- [ ] HTTPS + HSTS; HTTP redirects
- [ ] ufw default-deny; only 22/80/443 open
- [ ] fail2ban active on the login endpoint

**Access**
- [ ] admin password unique and long; no shared admin accounts
- [ ] one API key per caller, minimal scopes; proxy key is `entitlement:read` only
- [ ] `last_used_at` reviewed monthly; unused keys revoked
- [ ] no API key present in your frontend bundle or HTML

**Application**
- [ ] `npm test` 47/47, `npm run audit` 181/181 on production
- [ ] guest and unpaid users get 401/402 and **no** stream URL
- [ ] arbitrary URL through the proxy → `404 channel_unavailable`
- [ ] cross-site POST → 403
- [ ] `NODE_ENV=production` (enables Secure cookie, HSTS, stricter config refusal)

**Data**
- [ ] backup ran, and a restore was tested
- [ ] backups copied off the machine
- [ ] `AUDIT_RETENTION_DAYS` set to what your jurisdiction requires
- [ ] no demo data in `DATA_DIR`

**Content (the legal one)**
- [ ] every catalogue has rights basis, counterparty, licence ref, territory, validity
- [ ] `BLOCKED_SOURCE_HOSTS` still contains the reseller hosts
- [ ] `REQUIRE_LICENSE_ATTESTATION=1`
- [ ] you can produce, on request, the licence behind any channel you sell

---

## 7. Monitoring for security events

Watch these log events (structured JSON, `journalctl -u mrs-site`):

| Event | Means | Action |
|---|---|---|
| `http.reject` with `code:"unauthorized"` on `/login`, high rate | credential stuffing | fail2ban should already ban; check `fail2ban-client status mrs-login` |
| `internal.bad_signature` | forged or misconfigured backend call | check the caller; a single occurrence is a bug, a burst is an attack |
| `api_auth.invalid` (401 on internal) | revoked or wrong key | expected after rotation; otherwise investigate |
| `payment_verify.amount_mismatch` | someone paid less, or tampering | never auto-approve; look at the order |
| `payment.auto_verify_refused` bursts | provider problem or fake TrxIDs | check provider status; the queue will tell you which |
| `proxy_gate.unknown_target` | proxy used as an open relay | blocked by design; if frequent, someone is probing |
| `mount.proxy_gate_shadowed` | gate is not actually in front of the proxy | **critical** — fix ordering, the gate is not running |
| `config.error` at boot | misconfiguration refused | read it; the process exited on purpose |

---

## 8. Incident response

Written as steps, because during an incident nobody reads prose.

### 8.1 API key leaked
```bash
# 1. find it
#    /admin/api-keys → the key whose last_used_at just changed
# 2. revoke (either way)
#    click Revoke, or:
node -e "const {boot}=require('/opt/mrs-site/scripts/_boot');boot();
  const k=require('/opt/mrs-site/src/models/api_keys');
  console.log(k.revoke('key_…'))"
# 3. the next call fails immediately
curl -s http://127.0.0.1:3100/api/internal/entitlement?email=x@y.z -H "authorization: Bearer mrs_OLD"
#    → 401 api_key_invalid
# 4. issue a replacement, deploy it to the caller
# 5. check /admin/audit for anything the key did that you did not do
```

### 8.2 Suspected fraudulent fulfilment
```bash
# 1. find the order
sqlite3 /var/lib/mrs-site/site.db \
  "select id,status,amount_poisha,provider,payment_ref,created_at from orders order by created_at desc limit 20;"
# 2. look at the payment and how it was verified
sqlite3 /var/lib/mrs-site/site.db \
  "select id,provider,trx_id,status,verified_by,raw from payments where order_id='ord_…';"
# 3. if it was approved by a human, that is a process problem — see 8.4
# 4. revoke the access
node scripts/revoke-access.js --user usr_… --reason "fraud investigation 2026-11-11"
```
Every step is audited; the audit row is your record.

### 8.3 Session/cookie compromise suspected
```bash
# rotate the session secret: every session on every instance becomes invalid
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')/" /etc/mrs-site/app.env
systemctl restart mrs-site
sqlite3 /var/lib/mrs-site/site.db "delete from sessions;"    # belt and braces
# affected customers sign in again; nothing else changes
```

### 8.4 Admin account compromised
```bash
# 1. demote or lock the account
sqlite3 /var/lib/mrs-site/site.db "update users set role='customer', status='blocked' where email='…';"
# 2. read the audit log for what they did — it records actor ids
sqlite3 /var/lib/mrs-site/site.db "select created_at,action,target,meta from audit_log where actor='usr_…' order by created_at;"
# 3. reverse anything wrong: revoke entitlements (8.2), revert plan prices, revoke keys
# 4. create a clean admin and rotate every secret in §2
```

### 8.5 Licence complaint
1. `/admin/catalogs` → **pause** the catalogue (channels disappear immediately, no restart).
2. Export what was sold from it: orders, dates, amounts (`/admin/orders`, filter by plan/catalogue).
3. Produce the attestation record for that catalogue — it is stored with the catalogue row.
4. If the attestation is not real, that is an operator-level failure, not a software one;
   the software's job was to require it, and it did.

---

## 9. What this system deliberately does not do

So you can plan around the gaps instead of discovering them.

- **No WAF / DDoS protection of its own.** Put Cloudflare or an equivalent in front.
- **No multi-tenant isolation.** One deployment, one operator.
- **No encryption at rest by default.** Full-disk encryption is the host's job; SQLCipher is
  the upgrade path if you need column-level.
- **No automatic refunds.** A human decides, because a wrong automatic refund is money gone.
- **No 2FA on admin yet.** Add TOTP before you have more than one admin — it is the single
  highest-value addition to this list.
- **No password reset flow.** Add it via the outbox and a signed, single-use token.

Each of these is named in `docs/BUILD.md` where it would be wired, so adding one later is an
afternoon, not a rewrite.
