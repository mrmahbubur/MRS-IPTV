# Channel health — keeping dead channels off the site

The rule, in one sentence:

> **A channel is shown to a customer only if this system has probed it recently and found
> a playable stream.**

Everything in this document exists to make that sentence true, provable, and true again
tomorrow without anyone watching.

---

## 1. Why a URL that answers is not a channel that works

The failure mode that matters is not `404`. It is a URL that returns HTTP 200 and a
perfectly valid playlist pointing at segments nobody can play. Measured against the demo
catalogue in this repository, four of twelve channels looked healthy and were not:

| Channel | What the URL did | Naive check | This system |
|---|---|---|---|
| Demo Movies HD | `403 Forbidden` (token expired / IP locked) | alive | **dead** |
| Demo Movies Classics | `403 Forbidden` | alive | **dead** |
| Demo Kids | master playlist fine, **variant 404** | alive | **dead** |
| Demo Music | master playlist fine, **variant 404** | alive | **dead** |

The other eight downloaded a real segment starting with the MPEG-TS sync byte (`0x47`), or
an `ftyp`/`moof` fMP4 box, or an AAC frame — those are genuinely playable and stayed.

That distinction is the whole point: **verified media**, not a reachable URL.

---

## 2. What the probe does (five stages)

`src/services/stream-probe.js`

| Stage | Question | Fails when |
|---|---|---|
| 1 | Is the URL reachable and is the body really a playlist? | 4xx/5xx, DNS failure, TLS error, timeout, HTML error page served with 200 |
| 2 | (master) Does the variant playlist exist and parse? | variant 404/403, variant is not a playlist |
| 3 | Does the media playlist contain segments? | zero segments, playlist ended (`#EXT-X-ENDLIST`) |
| 4 | Does a **real segment** download and look like media? | segment 4xx, segment under 2 KB, segment is an error page, no container signature |
| 5 | (opt-in) Is the live edge advancing? | playlist identical after a wait **and** ended |

Stage 4 is what makes the answer trustworthy. Stage 5 is off by default because it doubles
the cost per channel; turn it on (`HEALTH_LIVE_CHECK=1`) if you sell live sports where a
frozen loop matters more than the extra time.

Container signatures recognised: MPEG-TS (`0x47` at byte 0), fMP4 (`ftyp`/`moof`/`styp`),
AAC (`ID3` / ADTS sync). Anything else is recorded as `unknown` kind and still counts as
alive **if** the segment was large enough and not an error page — we do not invent failures.

---

## 3. The state machine

```
                     probe ok
        unknown ─────────────────► alive ◄──────────────┐
           │                        │  │                │
           │ 1st fail               │  │ probe ok       │
           ▼                        │  └────────────────┘
        pending ──probe ok──► alive │
           │                        │ fail #1 (held: still visible, reason recorded)
           │ fail #2                ▼
           └──────────────────► dead ──probe ok──► alive
                                  │
                                  └─ retried with exponential backoff
```

| State | Served? | Meaning |
|---|---|---|
| `unknown` | **no** | never probed — we cannot promise it works, so it is not sold |
| `pending` | no | failed once, never passed; under observation |
| `alive` | **yes**, if checked within `HEALTH_FRESH_MS` | probe found real media |
| `dead` | no | `HEALTH_FAIL_THRESHOLD` consecutive failures |

Two deliberate choices:

- **Failures are counted, not instant.** One failed probe on a healthy channel holds it
  visible with the reason recorded (`Demo Kids` shows `2×` in the admin). Two in a row and it
  is hidden. This is the difference between a provider blip and a dead channel.
- **Nothing is deleted.** Dead channels keep their row, their probe history and their
  licence link. They return automatically.

---

## 4. Freshness — the part that keeps it true forever

`alive` is a statement about a moment. Without an expiry it becomes a lie as soon as the
checker stops running (crash, disk full, cron forgotten). So serving also requires a check
within `HEALTH_FRESH_MS` (default **6 hours**):

```sql
-- the rule, in SQL (services/channel-health.js → servableWhere)
c.health_status = 'alive' AND c.last_checked >= now - HEALTH_FRESH_MS
```

Alive channels are re-checked every 15 minutes, so in normal operation the oldest evidence
is minutes old. If the checker dies, the catalogue degrades to *unavailable* within 6 hours
rather than silently selling access to streams nobody verified. Turn this off with
`HEALTH_REQUIRE_FRESH=0` only if you accept that risk knowingly.

---

## 5. Scheduling — how 12,000 channels stay checked

`next_check_at` on every row, computed when the result is written:

| Channel state | Next check |
|---|---|
| never checked | now |
| alive | now + 15 min |
| dead | now + 1 h × 2^(failures − threshold), capped at 24 h |

Every cycle takes the channels that are **due** first, ordered by never-checked then
least-recently-checked. A permanently dead provider therefore costs almost nothing after a
day, while a new catalogue is checked immediately.

Bounded on three axes:

- **concurrency** — `HEALTH_CONCURRENCY` (12) globally, **`HEALTH_PER_HOST` (3) per host**.
  The per-host limit is the one that matters: a checker that hammers one provider gets the
  whole server IP blocked, which would kill the channels that *do* work.
- **batch** — `HEALTH_BATCH` (200) channels per cycle.
- **budget** — `HEALTH_BUDGET_MS` (120 s); anything not started inside the budget is
  deferred to the next cycle, never half-done.

At the default settings a 12,000-channel catalogue reaches full coverage in ~2 hours and
then stays on a 15-minute refresh for the live ones.

---

## 6. Running it

### 6.1 As part of the worker (recommended)

```bash
node scripts/worker.js            # daemon: channelHealth every WORKER_HEALTH_MS (5 min)
node scripts/worker.js --job=channelHealth   # one cycle, for cron
```

The worker job also re-applies the licence gate every cycle (see §7) before probing.

### 6.2 Standalone

```bash
node scripts/check-channels.js                     # one bounded cycle
node scripts/check-channels.js --limit 1000        # bigger slice
node scripts/check-channels.js --loop --every 600000   # keep running
node scripts/check-channels.js --channel chn_…     # re-check one channel now
node scripts/check-channels.js --dry-run           # probe and report, write nothing
node scripts/check-channels.js --shallow           # playlist only (fast triage)
node scripts/check-channels.js --live              # also verify the live edge advances
node scripts/check-channels.js --enforce           # apply the licence rule to existing rows
node scripts/check-channels.js --summary           # counts and policy, no probing
```

`--dry-run` and `--shallow` are for diagnosis; production runs deep.

### 6.3 From the admin panel

`/admin/channels` shows alive / dead / unchecked / due / stale, the checker configuration,
the last transition, and a **Recent health changes** table. Two buttons:

- **Run a check cycle now** — a bounded cycle, synchronously, result in the flash message.
- **Re-check** per row — one channel, immediately, verdict shown.

Both are audited (`channels.checked`, `channel.checked`).

### 6.4 From your existing backend

```
GET  /api/internal/channels/health     scope channels:read
POST /api/internal/channels/check      scope catalog:write
```

```bash
# what the checker knows (counts, policy, what customers see, recent deaths)
curl -s http://127.0.0.1:3100/api/internal/channels/health -H "authorization: Bearer mrs_…"

# check one channel and get the verdict in the response
curl -s -X POST http://127.0.0.1:3100/api/internal/channels/check \
  -H "authorization: Bearer mrs_…" -H 'content-type: application/json' \
  -d '{"ids":"chn_t3j…"}'
# → {"ok":true,"checked":1,"channel":{"status":"alive","reason":"verified mpegts segment (98 KB)",…}}

# or kick off a batch (202) and poll /channels/health
curl -s -X POST … -d '{"limit":500}'
```

A blocked host is refused here too: `403 blocked_source_host`.

---

## 7. The licence rule, which outranks the health rule

Order of precedence, highest first:

1. **Blocked source host** (`BLOCKED_SOURCE_HOSTS`) — never probed, never served, whatever
   the database says. `enforceLicenceGate()` re-marks any such row dead on every cycle.
2. **Catalogue must be active, operator-confirmed, and attested** when
   `REQUIRE_LICENSE_ATTESTATION=1`. Channels in a paused, unconfirmed or unattested
   catalogue are not even *eligible* to be checked, so they cannot become `alive` by
   accident.
3. **Health + freshness** — §2–§4.

So a channel has to be licensed *and* alive to be sold. Neither check can compensate for
the other; a perfectly working unlicensed stream is hidden exactly like a dead one.

Both are visible: `/admin/channels` count "Dead (hidden)" includes licence-hidden rows, and
their `health_reason` says `blocked source host — licence rule` or
`catalogue not licensed/active — licence rule`.

---

## 8. Data

`src/migrations/003_channel_health.sql`

**`channels`** (added columns): `consecutive_failures`, `consecutive_passes`,
`next_check_at`, `last_alive_at`, `latency_ms`, `segment_kind`, `check_stage`,
`http_status`.

**`channel_health_events`** — append-only transitions, so "when did this break?" survives the
next check:

```sql
SELECT at, from_status, to_status, reason, http_status
FROM channel_health_events WHERE channel_id = ? ORDER BY at DESC LIMIT 10;
```

Retention: events are cheap (one row per transition, not per check). If you want them
pruned, add it to the worker's `housekeeping`.

---

## 9. Verification — how you know it works

`npm test` (54 tests, real local origin server, no external network) asserts:

| Test | Asserts |
|---|---|
| live vs dead | 2 live channels verified and served; 8 dead hidden; nothing dies on the first failure; every dead row has a reason and a retry time |
| recovery | dead → alive on one good probe, both transitions recorded |
| freshness | a 2-day-old `alive` is not servable; a fresh one is |
| licence rule | blocked host never eligible; unconfirmed catalogue never eligible; `enforceLicenceGate` hides both |
| bounds | global concurrency never exceeded with 12 slow channels on one host; cycle finishes inside the budget |
| dry run | probes run, nothing is written |
| internal API | health summary exposes the policy; single-channel check returns a verdict |

Against the real demo catalogue (live internet), the checker found **4 genuinely dead
channels of 12** and removed them from the site within one cycle:

```
Demo Bangla        alive  verified fmp4 segment (49 KB)
Demo News World    alive  verified mpegts segment (39 KB)
Demo Sports 1 HD   alive  verified mpegts segment (98 KB)
Demo Kids          dead   variant HTTP 404          (2×)
Demo Movies HD     dead   HTTP 403                  (2×)
Demo Movies Classics dead HTTP 403                  (2×)
Demo Music         dead   variant HTTP 404          (2×)
```

`/api/channels` immediately returned 8 channels instead of 12, and the four dead rows remained
in the database, scheduled for retry.

---

## 9b. A note about the demo catalogue

The demo channels are public sample streams, and some of them are **VOD loops** (a film
played on repeat). A VOD playlist ends with `#EXT-X-ENDLIST`, which for a live TV service
means "not live" — so the checker marks them dead, correctly. That is why the seeded demo
looks smaller than the seed file.

- Production default: `HEALTH_ALLOW_VOD=0` — a live channel must be live.
- If your licensed catalogue legitimately includes catch-up/VOD entries, set
  `HEALTH_ALLOW_VOD=1` and they will be verified by segments like any other stream.

---

## 10. Operating it

**"A channel that works is not on the site."** Check `next_check_at` and `last_checked` —
if it is `unknown`, the checker has not reached it yet (raise `HEALTH_BATCH` or lower
`HEALTH_CONCURRENCY`'s per-host limit so it finishes sooner). If it is `dead`, the reason says
which stage failed.

**"Too many channels are dying at once."** Look at the reasons. All `HTTP 403` from one host
usually means an expired token or an IP ban — check that `/32` allowlist, and lower
`HEALTH_PER_HOST`. All `timeout` means your server's egress is the problem, not the channels.

**"A channel flaps alive/dead."** Raise `HEALTH_FAIL_THRESHOLD` to 3 and
`HEALTH_ALIVE_RECHECK_MS` to 30 min for that catalogue's provider. Flapping is usually
*two different edge servers* behind one URL.

**"I want to know what the checker is doing."** `journalctl -u mrs-worker | grep health.` —
every cycle logs `health.cycle` with counts and duration, every transition logs
`health.transition` with channel, stage, status code and reason.

**"I need to prove a channel is dead to a customer."** `/admin/channels?q=<name>` shows the
stage, HTTP status, latency, failure count and the transition history — the evidence, not an
opinion.

---

## 11. What it deliberately does not do

- **No geo-verification.** The probe runs from your server. A channel that works from Dhaka
  and not from London will be `alive`; that is correct for a Bangladeshi service.
- **No DRM/keys check.** An encrypted stream needs the right key to view; the probe verifies
  the media is being delivered, not that your licence grants the key.
- **No per-device bandwidth test.** Latency and segment size are recorded per channel so you
  can spot slow streams, but playback quality is the player's job.
- **No instant death.** A channel is hidden after 2 failures by design; if you want
  zero-tolerance set `HEALTH_FAIL_THRESHOLD=1`.
