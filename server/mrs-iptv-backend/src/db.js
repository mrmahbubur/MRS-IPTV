import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA wal_autocheckpoint = 1000;');

export function isDatabaseMalformedError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('malformed') || msg.includes('corrupt') || msg.includes('not a database') || msg.includes('disk image');
}

function isQuickCheckOk() {
  try {
    const row = db.prepare('PRAGMA quick_check(1)').get();
    return String(row?.quick_check || '').toLowerCase() === 'ok';
  } catch {
    return false;
  }
}

function readSalvageableChannelRows() {
  try {
    return db.prepare('SELECT * FROM channels').all();
  } catch {
    const salvaged = [];
    let minId = 0;
    let maxId = 500000;
    try {
      const bounds = db.prepare('SELECT MIN(id) AS mn, MAX(id) AS mx FROM channels').get();
      if (bounds?.mn != null) minId = Number(bounds.mn) - 1;
      if (bounds?.mx != null) maxId = Number(bounds.mx);
    } catch { /* fallback bounds */ }
    for (let id = minId + 1; id <= maxId; id++) {
      try {
        const r = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
        if (r) salvaged.push(r);
      } catch { /* skip unreadable row */ }
    }
    return salvaged;
  }
}

export function repairChannelsTable() {
  const rows = readSalvageableChannelRows();
  const byUrl = new Map();
  const rankStatus = (s) => (s === 'live' ? 3 : s === 'unknown' ? 2 : 1);

  for (const r of rows) {
    const u = String(r?.url || '').trim();
    if (!u) continue;
    const prev = byUrl.get(u);
    if (!prev) {
      byUrl.set(u, r);
      continue;
    }
    const sr = rankStatus(r.status);
    const sp = rankStatus(prev.status);
    if (
      sr > sp ||
      (sr === sp && (r.ok_count || 0) > (prev.ok_count || 0)) ||
      (sr === sp && (r.ok_count || 0) === (prev.ok_count || 0) && (r.last_ok || 0) > (prev.last_ok || 0))
    ) {
      byUrl.set(u, r);
    }
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DROP INDEX IF EXISTS idx_channels_status;');
    db.exec('DROP INDEX IF EXISTS idx_channels_norm;');
    db.exec('DROP TABLE IF EXISTS channels_repaired;');
    db.exec(`
      CREATE TABLE channels_repaired (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        url          TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        norm_name    TEXT NOT NULL,
        logo         TEXT,
        group_title  TEXT,
        tvg_id       TEXT,
        user_agent   TEXT,
        referrer     TEXT,
        source       TEXT,
        in_source    INTEGER NOT NULL DEFAULT 1,
        status       TEXT NOT NULL DEFAULT 'unknown',
        fail_count   INTEGER NOT NULL DEFAULT 0,
        ok_count     INTEGER NOT NULL DEFAULT 0,
        last_reason  TEXT,
        latency_ms   INTEGER,
        kind         TEXT,
        best_profile TEXT,
        cors         INTEGER,
        last_checked INTEGER,
        last_ok      INTEGER,
        created_at   INTEGER NOT NULL
      );
    `);

    const ins = db.prepare(`
      INSERT INTO channels_repaired(
        url, name, norm_name, logo, group_title, tvg_id, user_agent, referrer, source,
        in_source, status, fail_count, ok_count, last_reason, latency_ms, kind, best_profile,
        cors, last_checked, last_ok, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (const r of byUrl.values()) {
      ins.run(
        String(r.url).trim(),
        r.name || 'Channel',
        r.norm_name || String(r.name || 'channel').toLowerCase(),
        r.logo ?? null,
        r.group_title ?? null,
        r.tvg_id ?? null,
        r.user_agent ?? null,
        r.referrer ?? null,
        r.source ?? null,
        r.in_source ?? 1,
        r.status || 'unknown',
        r.fail_count ?? 0,
        r.ok_count ?? 0,
        r.last_reason ?? null,
        r.latency_ms ?? null,
        r.kind ?? null,
        r.best_profile ?? null,
        r.cors ?? null,
        r.last_checked ?? null,
        r.last_ok ?? null,
        r.created_at || Date.now()
      );
    }

    db.exec('DROP TABLE IF EXISTS channels;');
    db.exec('ALTER TABLE channels_repaired RENAME TO channels;');
    db.exec('CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status, in_source, last_checked);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_channels_norm   ON channels(norm_name);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source, status);');
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }

  try { db.exec('REINDEX; PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* ignore */ }
  return byUrl.size;
}

let lastRepairAt = 0;
export function verifyAndRepairDatabase(force = false) {
  if (config.dbPath === ':memory:') return true;
  if (!force && Date.now() - lastRepairAt < 5000 && isQuickCheckOk()) return true;
  if (isQuickCheckOk()) return true;

  lastRepairAt = Date.now();
  console.warn('[DB] SQLite quick_check detected corruption; attempting automatic repair...');
  try {
    db.exec('REINDEX;');
    if (isQuickCheckOk()) {
      console.info('[DB] SQLite REINDEX succeeded; database integrity restored.');
      return true;
    }
  } catch (reindexErr) {
    console.warn('[DB] REINDEX alone insufficient, rebuilding channels table:', reindexErr?.message || reindexErr);
  }

  try {
    const count = repairChannelsTable();
    const ok = isQuickCheckOk();
    console.info(`[DB] Rebuilt channels table (${count} unique channels); integrity ok=${ok}`);
    return ok;
  } catch (rebuildErr) {
    console.error('[DB] Automatic channels table repair failed:', rebuildErr?.message || rebuildErr);
    return false;
  }
}

export function checkpointAndCloseDb() {
  try {
    if (config.dbPath !== ':memory:') {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    }
  } catch { /* ignore */ }
  try {
    db.close();
  } catch { /* ignore */ }
}

if (config.dbPath !== ':memory:') {
  try {
    const hasChannels = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='channels'").get();
    if (hasChannels && !isQuickCheckOk()) {
      verifyAndRepairDatabase(true);
    }
  } catch { /* ignore before initial schema creation */ }
}

db.exec(`
-- Payments that REALLY arrived in your receiving accounts. This is the source of truth.
CREATE TABLE IF NOT EXISTS ledger (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  channel          TEXT NOT NULL,
  trx_id           TEXT NOT NULL,            -- normalised (UPPERCASE) transaction / order id
  amount_minor     INTEGER NOT NULL,         -- amount x 100 (paisa / cents)
  currency         TEXT NOT NULL,
  sender           TEXT,                     -- payer phone / nickname / email (as reported by the provider)
  sender_alt       TEXT,                     -- e.g. Binance ID
  received_at      TEXT NOT NULL,
  source           TEXT NOT NULL,            -- sms | email | binance_api | admin
  raw              TEXT,
  claimed_by_order INTEGER,
  created_at       TEXT NOT NULL,
  UNIQUE (channel, trx_id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_sender ON ledger(channel, claimed_by_order, sender);

-- Every message that hit an ingest endpoint, parsed or not (audit + manual recovery).
CREATE TABLE IF NOT EXISTS ingest_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source     TEXT NOT NULL,
  sender     TEXT,
  raw        TEXT,
  outcome    TEXT NOT NULL,                  -- ledger_added | duplicate | unparsed | rejected_sender | rejected_dkim
  detail     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS codes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  plan         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'available',   -- available | issued | redeemed | revoked
  batch        TEXT,
  order_id     INTEGER,
  issued_at    TEXT,
  device_id    TEXT,
  activated_at TEXT,
  expires_at   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_codes_pool ON codes(plan, status);

CREATE TABLE IF NOT EXISTS orders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id           TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL,         -- pending | needs_review | verified | rejected | expired
  status_reason       TEXT,
  status_detail       TEXT,                  -- JSON
  plan                TEXT NOT NULL,
  region              TEXT NOT NULL,
  channel             TEXT NOT NULL,
  currency            TEXT NOT NULL,
  expected_minor      INTEGER NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT NOT NULL,
  trx_id              TEXT,
  trx_kind            TEXT,                  -- id | nickname
  screenshot_path     TEXT,
  screenshot_sha256   TEXT,
  screenshot_flags    TEXT,                  -- JSON array
  ocr_candidates      TEXT,                  -- JSON array of ledger trx ids found in the screenshot
  ledger_id           INTEGER,
  code_id             INTEGER,
  verification_method TEXT,                  -- auto | manual
  email_status        TEXT,                  -- queued | sent | failed
  copy_email_status   TEXT,                  -- queued | sent | failed (submission record copy)
  ip                  TEXT,
  user_agent          TEXT,
  auto_activate_at    TEXT,                  -- scheduled 12-hour delayed trigger for automatic activation
  auto_activated_at   TEXT,                  -- recorded timestamp when auto-activated
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  verified_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_trx ON orders(channel, trx_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email, created_at);
-- the same screenshot can only back one live order
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_screenshot ON orders(screenshot_sha256)
  WHERE screenshot_sha256 IS NOT NULL AND status IN ('pending','needs_review','verified');

CREATE TABLE IF NOT EXISTS email_outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL,
  to_email        TEXT NOT NULL,
  mail_kind       TEXT NOT NULL DEFAULT 'activation', -- activation | auto_activated | submission_copy_customer | submission_copy_admin
  attachment_path TEXT,
  subject         TEXT NOT NULL,
  text_body       TEXT NOT NULL,
  html_body       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',   -- queued | sent | failed
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL,
  sent_at         TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON email_outbox(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       TEXT NOT NULL,
  actor    TEXT NOT NULL,
  action   TEXT NOT NULL,
  order_id INTEGER,
  detail   TEXT
);

-- Machine API keys with surgical scopes (payments:write, entitlement:read, catalog:write, channels:read)
CREATE TABLE IF NOT EXISTS api_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  scopes       TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL DEFAULT 'customer',
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS entitlements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  order_id      INTEGER,
  code_id       INTEGER,
  plan          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  device_limit  INTEGER NOT NULL DEFAULT 2,
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  revoked_at    TEXT,
  revoke_reason TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id, active, ends_at);

CREATE TABLE IF NOT EXISTS catalogs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  rights_basis TEXT,
  counterparty TEXT,
  license_ref  TEXT,
  territory    TEXT,
  validity     TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_channels (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_id           TEXT NOT NULL,
  name                 TEXT NOT NULL,
  category             TEXT,
  m3u8_url             TEXT NOT NULL,
  health_status        TEXT NOT NULL DEFAULT 'alive',
  health_reason        TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  consecutive_passes   INTEGER NOT NULL DEFAULT 0,
  next_check_at        TEXT,
  last_alive_at        TEXT,
  last_checked         TEXT,
  latency_ms           INTEGER,
  segment_kind         TEXT,
  check_stage          INTEGER,
  http_status          INTEGER,
  mirrors              TEXT,
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cat_chan_url ON catalog_channels(m3u8_url);

CREATE TABLE IF NOT EXISTS channel_health_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id   TEXT NOT NULL,
  channel_name TEXT,
  stream_url   TEXT,
  at           TEXT NOT NULL,
  from_status  TEXT NOT NULL,
  to_status    TEXT NOT NULL,
  reason       TEXT,
  http_status  INTEGER,
  latency_ms   INTEGER
);
CREATE TABLE IF NOT EXISTS devices (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  entitlement_id INTEGER,
  code_id        INTEGER,
  device_hash    TEXT NOT NULL,
  device_label   TEXT,
  last_seen      TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_entitlement_hash ON devices(entitlement_id, device_hash) WHERE entitlement_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_code_hash ON devices(code_id, device_hash) WHERE code_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open',
  ip         TEXT,
  created_at TEXT NOT NULL
);

-- Verified live IPTV channels table (persisted live/dead status, latency, hysteresis)
CREATE TABLE IF NOT EXISTS channels (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  url          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  norm_name    TEXT NOT NULL,
  logo         TEXT,
  group_title  TEXT,
  tvg_id       TEXT,
  user_agent   TEXT,
  referrer     TEXT,
  source       TEXT,
  in_source    INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'unknown',  -- unknown | live | dead
  fail_count   INTEGER NOT NULL DEFAULT 0,
  ok_count     INTEGER NOT NULL DEFAULT 0,
  last_reason  TEXT,
  latency_ms   INTEGER,
  kind         TEXT,
  best_profile TEXT,
  cors         INTEGER,
  last_checked INTEGER,
  last_ok      INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status, in_source, last_checked);
CREATE INDEX IF NOT EXISTS idx_channels_norm   ON channels(norm_name);
CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source, status);
`);

try { db.exec('ALTER TABLE orders ADD COLUMN customer_name TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE orders ADD COLUMN auto_activate_at TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE orders ADD COLUMN auto_activated_at TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE orders ADD COLUMN copy_email_status TEXT;'); } catch (_) {}
try { db.exec("ALTER TABLE email_outbox ADD COLUMN mail_kind TEXT NOT NULL DEFAULT 'activation';"); } catch (_) {}
try { db.exec('ALTER TABLE email_outbox ADD COLUMN attachment_path TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE codes ADD COLUMN auto_activate_at TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN health_reason TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN consecutive_passes INTEGER NOT NULL DEFAULT 0;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN next_check_at TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN last_alive_at TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN last_checked TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN latency_ms INTEGER;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN segment_kind TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN check_stage INTEGER;'); } catch (_) {}
try { db.exec('ALTER TABLE catalog_channels ADD COLUMN http_status INTEGER;'); } catch (_) {}
try { db.exec('ALTER TABLE channels ADD COLUMN best_profile TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE channels ADD COLUMN cors INTEGER;'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source, status);'); } catch (_) {}

export const nowIso = () => new Date().toISOString();
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

/** Thrown inside tx() to roll back and report a business reason. */
export class Abort extends Error {
  constructor(reason, detail) { super(reason); this.reason = reason; this.detail = detail; }
}

/** Synchronous transaction (re-entrant via SAVEPOINT). node:sqlite is single-threaded, so this is atomic. */
let txDepth = 0;
export function tx(fn) {
  const depth = txDepth++;
  const sp = `sp_${depth}`;
  if (depth === 0) {
    db.exec('BEGIN IMMEDIATE');
  } else {
    db.exec(`SAVEPOINT ${sp}`);
  }
  try {
    const result = fn();
    if (depth === 0) {
      db.exec('COMMIT');
    } else {
      db.exec(`RELEASE SAVEPOINT ${sp}`);
    }
    return result;
  } catch (err) {
    if (depth === 0) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    } else {
      try { db.exec(`ROLLBACK TO SAVEPOINT ${sp}`); } catch { /* ignore */ }
      try { db.exec(`RELEASE SAVEPOINT ${sp}`); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    txDepth--;
  }
}

export function audit(actor, action, orderId, detail) {
  run('INSERT INTO audit_log(at, actor, action, order_id, detail) VALUES (?,?,?,?,?)',
    nowIso(), actor, action, orderId ?? null, detail ? JSON.stringify(detail) : null);
}
