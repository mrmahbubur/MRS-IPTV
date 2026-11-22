# Deploying m3u-doctor as an always-on service

Complete runbook for **Option 1 (sidecar)**: a small service that watches your M3U
playlists 24/7, re-verifies channels, and publishes only the ones that actually play.

Target: a Linux VPS (Ubuntu 22.04/24.04 or Debian 12), systemd, nginx in front.
Docker path is in [§12](#12-docker-alternative).

```
                    ┌───────────────────────────────────────────────┐
   new M3U link ───►│  Admin UI  /admin    (paste link, validated)  │
   (anytime)        └───────────────────┬───────────────────────────┘
                                        │ saved to sources.json
                                        ▼
   ┌────────────── m3u-doctor (systemd, always running) ─────────────┐
   │  full scan   every SCAN_INTERVAL_MIN  (default 12h)            │
   │  retry pass  every RETRY_INTERVAL_MIN (default 30m)            │
   │      └─ re-tests ONLY failing + stale channels (cheap)         │
   │  deep probe: master → variant → real segment → sync bytes      │
   └───────────────┬───────────────────────────────────────────────┘
                   │ writes
                   ▼
       /var/lib/m3u-doctor/{clean.m3u, report.json, state.json, sources.json}
                   │
                   ▼
       nginx  →  /api/m3u-doctor/clean.m3u        ← your site reads this
                 /api/m3u-doctor/report.json
                 /api/m3u-doctor/status
```

---

## 1. Server prep

Use a small VPS — 1 vCPU / 1 GB is enough. The scanner is I/O-bound, not CPU-bound.

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install curl ca-certificates nginx

# timezone so your logs/scan times make sense
sudo timedatectl set-timezone Asia/Dhaka

# make sure the box can reach the providers at all
curl -sI "https://go.skym3u.dev/tiw4.m3u?s=dd89" | head -3
```

If that last command returns `403` + Cloudflare HTML, your provider blocks datacenter
IPs. Everything still works, but some channels will read as dead that a residential
connection could play — see [§10](#10-known-pitfalls).

> **Fingerprint matters.** All your existing channels come from `go.skym3u.dev`.
> If the provider IP-locks tokens to the requesting host, run m3u-doctor on the
> **same machine (or same egress IP) as your `/api/proxy`**, so the verdicts match
> what your users actually get.

---

## 2. Install

```bash
# copy the project to the server however you like (scp, git, rsync)
scp -r m3u-doctor/ user@server:/tmp/m3u-doctor

ssh user@server
cd /tmp/m3u-doctor
sudo ./deploy/install.sh
```

The installer:

1. installs Node 20 if needed,
2. creates the system user `m3u`,
3. copies the code to `/opt/m3u-doctor`,
4. creates `/var/lib/m3u-doctor` (data) and `/etc/m3u-doctor.env` (config),
5. **generates a random `ADMIN_TOKEN`** and prints it,
6. installs + enables the systemd unit, starts it, and health-checks it.

Re-running it is safe: it won't touch an existing env file or your sources.

Note the token it prints — you'll need it in the admin UI:

```bash
sudo grep ADMIN_TOKEN /etc/m3u-doctor.env
```

---

## 3. Verify the service

```bash
systemctl status m3u-doctor
curl -s http://127.0.0.1:8080/health
journalctl -u m3u-doctor -n 40 --no-pager
```

Expected log on first boot:

```
m3u-doctor listening on 0.0.0.0:8080
out dir: /var/lib/m3u-doctor · sources: 0 · admin token: set
started · full every 720min · retry every 30min · sources 0
full scan start (startup)
full scan skipped: no enabled sources
```

`sources: 0` is correct at this point — you add playlists next.

---

## 4. Add your playlists (the "new M3U anytime" part)

Open the admin UI through an SSH tunnel (the app port is loopback-only until §5):

```bash
ssh -L 8080:127.0.0.1:8080 user@server
# then browse http://localhost:8080/admin
```

Paste the `ADMIN_TOKEN`, then paste **one or more** M3U links in *Add a playlist*, one
per line, and hit **Validate & add**:

```
https://go.skym3u.dev/tiw4.m3u?s=dd89
https://go.skym3u.dev/e5dp.m3u?s=7bd4
https://some-new-provider.example/get.php?username=x&password=y&type=m3u_plus
```

What happens on **Validate & add**:

1. each link is fetched **before** being saved;
2. if it isn't a playlist (HTML login wall, expired token, DNS failure, Cloudflare
   block) it is **rejected with a specific reason** and nothing is saved;
3. valid links are written to `/var/lib/m3u-doctor/sources.json`;
4. a **full scan starts immediately** — no restart, no redeploy;
5. the new channels appear in the published playlist within minutes.

The same thing over the API, for scripted/customer onboarding:

```bash
TOKEN=$(sudo grep ADMIN_TOKEN /etc/m3u-doctor.env | cut -d= -f2)

curl -s -X POST http://127.0.0.1:8080/api/m3u-doctor/sources \
  -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"urls":"https://provider.example/a.m3u\nhttps://provider.example/b.m3u","name":"Provider B"}'
```

Response tells you, per URL, whether it was accepted and how many entries it has:

```json
{ "results": [
    { "url": "https://provider.example/a.m3u", "added": true, "valid": true,
      "id": "3f9c1ab2de", "entries": 4218, "kind": "m3u",
      "sample": ["Sky Sports 1 HD", "CNN", "beIN 1"] }
] }
```

Other source operations:

```bash
# list
curl -s localhost:8080/api/m3u-doctor/sources -H "x-admin-token: $TOKEN"

# disable (keeps the record, excluded from scans)
curl -s -X PATCH localhost:8080/api/m3u-doctor/sources/<id> \
  -H "x-admin-token: $TOKEN" -H 'content-type: application/json' -d '{"enabled":false}'

# re-validate a single source right now
curl -s -X POST localhost:8080/api/m3u-doctor/sources/<id>/validate -H "x-admin-token: $TOKEN"

# delete
curl -s -X DELETE localhost:8080/api/m3u-doctor/sources/<id> -H "x-admin-token: $TOKEN"
```

> Adding a playlist does **not** delete anything you already have. Sources are merged
> and duplicate URLs are collapsed; a channel survives if any source still provides a
> working stream.

### Also supported: JSON channel APIs

You can point a source at your existing `/api/all-channels`-style endpoint. The doctor
then probes every mirror and backup URL too, and the channel is kept if **any** of them
is alive:

```bash
curl -s -X POST localhost:8080/api/m3u-doctor/sources -H "x-admin-token: $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"url":"https://shahin-iptv.ai.studio/api/all-channels","name":"M R S site"}'
```

---

## 5. Put it behind nginx (TLS, public playlist, protected admin)

```bash
sudo cp /opt/m3u-doctor/deploy/nginx-m3u-doctor.conf /etc/nginx/sites-available/m3u-doctor
sudo nano /etc/nginx/sites-available/m3u-doctor     # set server_name + cert paths
sudo ln -s /etc/nginx/sites-available/m3u-doctor /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Certificate (subdomain `doctor.example.com` must point at this server):

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d doctor.example.com
```

Then lock the app port down so only nginx can reach it — add to `/etc/m3u-doctor.env`:

```
PORT=8080
```

and confirm the firewall doesn't expose 8080:

```bash
sudo ufw allow 22,80,443/tcp
sudo ufw enable
```

Two extra hardening options, both in the nginx file:
- uncomment the `allow/deny` lines to IP-restrict `/admin` and `/api/m3u-doctor/`;
- keep `ADMIN_TOKEN` set even so — nginx rules are just a second lock.

---

## 6. Connect it to your site

Pick whichever integration matches your backend; all three are supported.

### 6a. Your site filters its own channel list (recommended)

Keeps your existing player, catalog, ads and analytics untouched. Only the list gets
filtered by verified health.

```js
// server-side, cached so you don't refetch for every visitor
let health = { okUrls: new Set(), at: 0 };
async function getHealth() {
  if (Date.now() - health.at < 5 * 60 * 1000) return health;
  try {
    const r = await fetch('http://127.0.0.1:8080/api/m3u-doctor/report.json');
    const rep = await r.json();
    const okUrls = new Set();
    for (const c of rep.channels) {
      okUrls.add(c.url);
      if (c.playUrl) okUrls.add(c.playUrl);
    }
    health = { okUrls, at: Date.now(), verifiedAt: rep.finishedAt, totals: rep.totals };
  } catch (e) {
    console.error('[health] keeping full list:', e.message);
  }
  return health;
}

app.get('/api/all-channels', async (req, res) => {
  const all = await loadChannels();           // your existing logic, untouched
  const h = await getHealth();
  if (!h.okUrls.size) return res.json({ channels: all, health: { degraded: true } });

  const channels = all.filter(ch =>
    [ch.m3u8Url, ...(ch.mirrors || []), ...(ch.backupUrls || [])]
      .filter(Boolean)
      .some(u => h.okUrls.has(u) || h.okUrls.has(decodeURIComponent(u)))
  );
  res.json({
    channels,
    health: {
      verified: true,
      verifiedAt: h.verifiedAt,
      hidden: all.length - channels.length,
      totals: h.totals,
    },
  });
});
```

**Fail-open on purpose**: if the doctor is down or has no report, you serve the full
list rather than an empty app.

### 6b. Point the app straight at the published playlist

```
https://doctor.example.com/api/m3u-doctor/clean.m3u
```

Any player, TV app, or M3U importer can consume that URL directly — it's a normal
extended M3U with `tvg-id`, `tvg-logo`, `group-title` and `#EXTVLCOPT` preserved.

### 6c. nginx reverse-proxy so the browser can call the API

If your React bundle should read health directly, expose it same-origin:

```nginx
location /api/m3u-doctor/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_read_timeout 120s;
}
```

Then in the player:

```js
const health = await fetch('/api/m3u-doctor/report.json').then(r => r.json());
const alive = new Set(health.channels.map(c => c.url));
const visible = channels.filter(c => alive.has(c.m3u8Url));
```

---

## 7. Roll it out without losing viewers (shadow mode)

Do **not** filter 60% of the library on day one. Expect roughly **40% survival** on a
resold playlist (measured on yours: 41%).

**Week 1 — observe.** Serve the full list; add `health.status` to each channel in the
API response and paint a red dot on `dead` ones. Ask users to report channels that
don't play. Compare their reports with the verdicts to measure precision.

**Week 2 — soft filter.** Default view = verified only, with a footer link
"Show N unverified channels".

**Week 3 — enforce.** Verified only. Keep `/api/m3u-doctor/report.json` as the audit
trail, and re-enable anything a user proves should be there.

A view counter is a good second opinion: channels with **views > 0 in the last 24h**
that the scanner calls dead are probably false negatives (geo/token nuance) — exclude
those from the filter until they fail twice.

---

## 8. Day-2 operations

```bash
# status / lifecycle
systemctl status m3u-doctor
sudo systemctl restart m3u-doctor
sudo systemctl stop m3u-doctor
journalctl -u m3u-doctor -f              # live log
journalctl -u m3u-doctor --since "2 hours ago"

# force a scan now (full or cheap)
TOKEN=$(sudo grep ADMIN_TOKEN /etc/m3u-doctor.env | cut -d= -f2)
curl -s -X POST localhost:8080/api/m3u-doctor/run -H "x-admin-token: $TOKEN" \
     -H 'content-type: application/json' -d '{"mode":"full"}'
curl -s -X POST localhost:8080/api/m3u-doctor/run -H "x-admin-token: $TOKEN" \
     -H 'content-type: application/json' -d '{"mode":"retry"}'

# what is happening
curl -s localhost:8080/api/m3u-doctor/status | python3 -m json.tool
```

### Schedules (`/etc/m3u-doctor.env`)

| Setting | Default | Meaning |
|---|---|---|
| `SCAN_INTERVAL_MIN` | `720` | full deep scan of every source (12h) |
| `RETRY_INTERVAL_MIN` | `30` | incremental pass: failing + stale channels only |
| `STALE_MINUTES` | `180` | a verified channel is re-checked after this long |
| `SCAN_ON_START` | `1` | scan on boot |

A sensible production split for a 12k-channel library:

- full scan **once or twice a day** (`720` or `1440`),
- retry pass every **30 min** — this is what recovers channels quickly and keeps the
  list honest during the day, at ~5% of the cost of a full scan,
- raise frequency only for high-traffic categories if you split sources per category
  (e.g. a separate Sports-only source scanned hourly).

### Updating the code

```bash
# from your workstation
scp -r m3u-doctor/ user@server:/tmp/m3u-doctor
# on the server
cd /tmp/m3u-doctor && sudo ./deploy/install.sh
```

Your env file, sources and generated artifacts are untouched; the service restarts.

### Backup / restore

There is no database. Everything that matters is one small directory:

```bash
sudo tar czf m3u-doctor-$(date +%F).tar.gz -C /var/lib m3u-doctor /etc/m3u-doctor.env
```

Restore = unpack to the same paths, `systemctl restart m3u-doctor`.

### Disk usage

Tiny: `sources.json` (KB), `clean.m3u` (~1 MB at 12k channels), `report.json`
(a few MB), `state.json` (a few MB), log rotated by journald. Cap it explicitly if you
like:

```ini
# /etc/systemd/journald.conf  →  SystemMaxUse=200M
```

---

## 8a. What actually happens to a dead channel

**Nothing is deleted.** The doctor is non-destructive: it never edits your source
playlists and never deletes a channel record. It only decides what goes into
`clean.m3u`.

```
                      provider serves a working stream
                                    │
   ┌────────────────────────────────┼─────────────────────────────────┐
   │                                ▼                                 │
   │   alive ────────────────── published in clean.m3u                │
   │     │                          ▲                                 │
   │     │ hard failure             │ retry pass finds it working      │
   │     │ (403/404/DNS/           │ (or operator hits "Revive")      │
   │     │  error page/no segment)  │                                 │
   │     ▼                          │                                 │
   │   removed ─────────────────────┘                                 │
   │   hidden from clean.m3u · kept in report.json + removed.m3u      │
   │   retried on backoff: 1h → 6h → 24h → 72h (cap)                  │
   │                                                                  │
   │   transient failure (timeout / 5xx / reset)                      │
   │     └── pending: needs QUARANTINE_AFTER consecutive fails        │
   └──────────────────────────────────────────────────────────────────┘
```

Where a removed channel lives, and what you can do with it:

| Place | Contains | Use |
|---|---|---|
| `report.json` → `removed[]` | name, url, reason, httpStatus, `fails`, `retryCount`, `nextRetryAt` | audit trail / debugging |
| `/api/m3u-doctor/removed.m3u` | all removed channels as a playlist, with `x-doctor-reason` + `x-doctor-next-retry` attributes | feed back in later, or send to the provider as evidence |
| `state.json` | per-URL failure history | drives the backoff; survives restarts |
| the provider's own M3U | untouched | your source is never modified |

How a channel comes back, without you doing anything:

```bash
# the retry pass re-tests removed channels whose backoff expired
curl -s -X POST localhost:8080/api/m3u-doctor/run -H "x-admin-token: $TOKEN" \
     -H 'content-type: application/json' -d '{"mode":"retry"}'
```

and forcing it by hand, ignoring the backoff:

```bash
curl -s -X POST localhost:8080/api/m3u-doctor/revive -H "x-admin-token: $TOKEN" \
     -H 'content-type: application/json' \
     -d '{"url":"https://provider.example/live/123.m3u8"}'
# -> {"results":[{"found":true,"live":true,"restored":true,"reason":"verified mpegts segment (128 KB)"}]}
```

### Why the backoff exists (important)

A naive design re-tests every dead channel on every pass. On a 12k-channel library with
~59% dead that is **~7,000 requests every 30 minutes** aimed at the same one or two
provider hosts — which gets your server IP rate-limited or banned. And a banned IP makes
*your healthy channels look dead too*, so the filter would start hiding channels that
work. Backoff plus a per-pass budget (`RETRY_MAX`, default 400) keeps the scanner
invisible to the provider:

| consecutive failures | next retry |
|---|---|
| 1 | 1 hour |
| 2 | 6 hours |
| 3 | 24 hours |
| 4+ | 72 hours (cap) |

After `MAX_RETRY_FAILS` (40) attempts a channel stops being retried automatically — it
still sits in the dead-letter list and can be revived manually.

Two related guarantees:

- **Zero-channel guard** — if a scan ends with no channels at all (provider outage,
  expired playlist, rate limit), the previous good `clean.m3u` is kept untouched. A bad
  provider day never empties your app.
- **Quarantine grace** — a *transient* failure (timeout, 5xx, reset) needs
  `QUARANTINE_AFTER` consecutive failures before removal, so one flaky pass doesn't hide
  a working channel. Only *hard* failures (403/404/DNS/error page/no segment) hide a
  channel immediately.

### Tuning

| Setting | Default | Meaning |
|---|---|---|
| `RETRY_MAX` | `400` | max channels re-tested per retry pass (budget) |
| `RETRY_INTERVAL_MIN` | `30` | how often a retry pass runs |
| `QUARANTINE_AFTER` | `2` | consecutive transient fails before removal |
| `STALE_MINUTES` | `180` | healthy channels are re-verified after this long |

Raise `RETRY_MAX` only if your library is small or spread over many hosts. If you see
`403`/`429` spikes across a whole host, the budget is too aggressive for that provider.

---

## 9. API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | – | liveness |
| `GET` | `/api/m3u-doctor/clean.m3u` | public¹ | verified playlist |
| `GET` | `/api/m3u-doctor/report.json` | public¹ | full report (kept + removed + pending) |
| `GET` | `/api/m3u-doctor/removed.m3u` | public¹ | dead-letter playlist (removed channels + reasons) |
| `GET` | `/api/m3u-doctor/status` | public | buses, last runs, totals, per-source stats |
| `GET` | `/api/m3u-doctor/check?url=…&live=1` | public | diagnose a single stream |
| `GET` | `/api/m3u-doctor/sources` | admin | list sources |
| `POST` | `/api/m3u-doctor/sources` | admin | add `{url}` or `{urls}` (+`name`, `scan:false`) |
| `PATCH` | `/api/m3u-doctor/sources/:id` | admin | `{enabled,name,tags}` |
| `DELETE` | `/api/m3u-doctor/sources/:id` | admin | remove |
| `POST` | `/api/m3u-doctor/sources/:id/validate` | admin | re-validate now |
| `POST` | `/api/m3u-doctor/run` | admin | `{mode:"full"\|"retry"}` |
| `POST` | `/api/m3u-doctor/revive` | admin | `{url}` or `{urls}` — force re-check, restore if alive |
| `GET` | `/api/m3u-doctor/logs?lines=200` | admin | recent log ring |
| `GET` | `/admin` | – | operator UI |

¹ set `PUBLIC_READ=0` to require the admin token for these too.

Auth: header `x-admin-token: <ADMIN_TOKEN>` (or `Authorization: Bearer <token>`,
or `?token=` for browser links).

---

## 10. Known pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Almost everything `HTTP 403` | provider blocks datacenter IPs / token IP-locked | run on the same IP as your proxy; or `PROXY_PATH=1` so verdicts match playback |
| A whole host suddenly fails at once | you are being rate-limited | lower `CONCURRENCY`/`PER_HOST`, rescan later; the quarantine grace prevents mass deletion |
| Channels alive but absent from the playlist | marked `pending` (transient) | next retry pass re-adds them, or `KEEP_UNKNOWN=1` |
| A removed channel is known to work | waiting on backoff | `POST /api/m3u-doctor/revive` with its URL, or check `/api/m3u-doctor/removed.m3u` for its `nextRetryAt` |
| Scan logs "nothing due — N dead channel(s) waiting on retry backoff" | normal | backoff working as designed; nothing to fix |
| Playlist not updating | scan aborted because every source returned 0 entries | check `journalctl`; the previous good playlist is intentionally preserved |
| `service did not answer` after install | port already in use / Node too old | `journalctl -u m3u-doctor`; change `PORT` in the env file |
| Admin UI says *token required* | wrong/empty token | paste the value from `/etc/m3u-doctor.env`, or `?token=` in the URL |
| Scan takes very long | `DEEP=1` downloads a segment per channel | use `--no-deep`-style `DEEP=0` only for huge libraries, or raise `SCAN_INTERVAL_MIN` |
| Channels from a **new** provider all look dead | provider requires a request header (User-Agent/Referer) | set `PROXY_PREFIX`/probe through the player's proxy, and keep the provider's required headers in your player |

> **Geo-blocks are not dead channels.** A stream can be dead from your server and fine
> for a user in another country. That is why the classifier separates *hard* failures
> (403/404/DNS/error page/no segments) from *transient* ones, and why a single
> regional scan should never be treated as absolute truth.

---

## 11. Security checklist

- [ ] `ADMIN_TOKEN` is long, random, and not the installer default
- [ ] app port 8080 not reachable from the internet (`ufw`, nginx only)
- [ ] `/admin` and `/api/m3u-doctor/` IP-restricted if you can
- [ ] `/etc/m3u-doctor.env` is `chmod 600`
- [ ] `PUBLIC_READ` matches your intent (`0` keeps the playlist private)
- [ ] source URLs with `username=…&password=…` are treated as secrets — they are in
      `sources.json`, so back it up carefully and never commit it
- [ ] rate limits on `/api/m3u-doctor/check` (it dials arbitrary hosts on request —
      the nginx file limits it to 10 r/s with a small burst)

---

## 12. Docker alternative

```bash
cp deploy/m3u-doctor.env.example .env
# edit .env: set ADMIN_TOKEN, OUT_DIR=/data, and keep the rest
docker compose up -d --build
docker compose logs -f
```

Data lives in the `doctor-data` volume; the app is published on `127.0.0.1:8080`
only, so nginx config from §5 works unchanged.

---

## 13. Uninstall

```bash
sudo systemctl disable --now m3u-doctor
sudo rm /etc/systemd/system/m3u-doctor.service
sudo systemctl daemon-reload
sudo rm -rf /opt/m3u-doctor
sudo rm -f /etc/m3u-doctor.env
# keep the data dir if you want the reports; otherwise:
# sudo rm -rf /var/lib/m3u-doctor
sudo userdel m3u
```
