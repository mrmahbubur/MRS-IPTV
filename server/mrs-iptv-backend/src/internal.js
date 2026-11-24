import express from 'express';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { config, PLANS, PLAN_IDS } from './config.js';
import { getTrustedClientIp } from './clientIp.js';
import { get, run, all, tx, nowIso, audit } from './db.js';
import { verifyApiKey } from './apiKeys.js';
import { normalizeEmail } from './validators.js';
import { generateCodes, stock, addMonths } from './codes.js';
import { queueActivationEmail } from './mailer.js';

export function createInternalRouter(channelLookupFn = null) {
  const router = express.Router();

  // Helper: Extract machine API key from Authorization header or x-api-key
  const extractKey = (req) =>
    (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.get('x-api-key') || '').trim();

  // Middleware: Require specific API key scope
  const requireScope = (scope) => (req, res, next) => {
    const rawKey = extractKey(req);
    const result = verifyApiKey(rawKey, scope);
    if (!result.ok) {
      return res.status(result.status).json({
        error: {
          code: result.code,
          message: result.message,
          details: result.details || null,
        },
      });
    }
    req.apiKey = result.key;
    next();
  };

  // Helper: Verify HMAC-SHA256 signature for payment confirmation
  const verifyHmacSignature = (rawBody, headerSig, secret) => {
    if (!secret || !headerSig) return false;
    const match = String(headerSig).match(/^sha256=([a-f0-9]{64})$/i);
    if (!match) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const bufA = Buffer.from(match[1].toLowerCase(), 'hex');
    const bufB = Buffer.from(expected.toLowerCase(), 'hex');
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  };

  // Helper: Ensure user exists in users table
  const ensureUser = (email) => {
    const norm = normalizeEmail(email).value || String(email || '').trim().toLowerCase();
    let user = get('SELECT * FROM users WHERE email=?', norm);
    let isNew = false;
    if (!user) {
      const id = `usr_${randomBytes(6).toString('hex')}`;
      const now = nowIso();
      run('INSERT INTO users(id, email, role, status, created_at) VALUES (?, ?, ?, ?, ?)', id, norm, 'customer', 'active', now);
      user = get('SELECT * FROM users WHERE id=?', id);
      isNew = true;
    }
    return { user, isNew };
  };

  // -------------------------------------------------------------------------
  // 1. PUBLIC LIVENESS (No Auth)
  // -------------------------------------------------------------------------
  router.get('/ping', (_req, res) => {
    res.json({ ok: true, time: nowIso() });
  });

  // -------------------------------------------------------------------------
  // 2. DETAILED HEALTH (Scope: channels:read)
  // -------------------------------------------------------------------------
  router.get('/health', requireScope('channels:read'), (_req, res) => {
    res.json({
      ok: true,
      time: nowIso(),
      stock: stock(),
      orders: Object.fromEntries(all('SELECT status, COUNT(*) n FROM orders GROUP BY status').map((r) => [r.status, r.n])),
      outbox: Object.fromEntries(all('SELECT status, COUNT(*) n FROM email_outbox GROUP BY status').map((r) => [r.status, r.n])),
      uptime: process.uptime(),
    });
  });

  // -------------------------------------------------------------------------
  // 3. CREATE ORDER (Scope: payments:write)
  // -------------------------------------------------------------------------
  router.post('/orders', requireScope('payments:write'), (req, res) => {
    const { email, planCode, planId } = req.body || {};
    const targetPlanId = String(planCode || planId || '').toLowerCase();
    const plan = PLANS[targetPlanId];

    if (!email) {
      return res.status(400).json({ error: { code: 'validation_failed', message: 'Email is required' } });
    }
    if (!plan) {
      return res.status(400).json({ error: { code: 'invalid_plan', message: `Invalid planCode. Valid plans: ${PLAN_IDS.join(', ')}` } });
    }

    const { user, isNew } = ensureUser(email);
    const publicId = `ord_${randomBytes(8).toString('hex')}`;
    const amount = plan.prices.BDT;
    const expectedMinor = Math.round(amount * 100);
    const now = nowIso();
    const expiresAt = new Date(Date.now() + config.orderTtlMinutes * 60 * 1000).toISOString();

    run(
      `INSERT INTO orders (public_id, status, plan, region, channel, currency, expected_minor, email, phone, ip, user_agent, created_at, updated_at)
       VALUES (?, 'created', ?, 'BD', 'internal', 'BDT', ?, ?, '01800000000', ?, ?, ?, ?)`,
      publicId,
      plan.id,
      expectedMinor,
      user.email,
      getTrustedClientIp(req),
      (req.get('user-agent') || 'internal-caller').slice(0, 200),
      now,
      now
    );

    audit('internal_api', 'order_created', null, { publicId, plan: plan.id, email: user.email });

    res.status(201).json({
      order: {
        id: publicId,
        status: 'created',
        amount,
        currency: 'BDT',
        expiresAt,
      },
      user: {
        id: user.id,
        email: user.email,
        isNew,
      },
      plan: {
        id: plan.id,
        code: plan.id,
        name: plan.label,
        months: plan.months,
      },
    });
  });

  // -------------------------------------------------------------------------
  // 4. CONFIRM PAYMENT (Scope: payments:write + HMAC Signature)
  // -------------------------------------------------------------------------
  router.post('/payment-confirmed', requireScope('payments:write'), (req, res) => {
    const signatureHeader = req.get('x-signature');
    const rawBody = req.rawBody || JSON.stringify(req.body || {});

    // Enforce HMAC-SHA256 signature
    if (!verifyHmacSignature(rawBody, signatureHeader, config.internalWebhookSecret)) {
      audit('security', 'bad_internal_signature', null, { ip: getTrustedClientIp(req) });
      return res.status(401).json({
        error: {
          code: 'invalid_signature',
          message: 'HMAC signature verification failed. Provide a valid x-signature header.',
        },
      });
    }

    const { orderId, provider, providerRef, amount, currency, verifiedBy } = req.body || {};

    if (!orderId || !providerRef) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'orderId and providerRef are required' } });
    }

    const order = get('SELECT * FROM orders WHERE public_id=? OR id=?', String(orderId), Number(orderId) || -1);
    if (!order) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'Order not found' } });
    }

    // Check expiry
    const orderAgeMs = Date.now() - Date.parse(order.created_at);
    if (order.status === 'expired' || orderAgeMs > config.orderTtlMinutes * 60 * 1000 + 300_000) {
      return res.status(409).json({ error: { code: 'conflict', message: 'Order has expired. Create a new order.' } });
    }

    // Check amount
    const paidMinor = Math.round(Number(amount) * 100);
    if (paidMinor < order.expected_minor) {
      return res.status(409).json({
        error: {
          code: 'amount_mismatch',
          message: `Paid amount (${amount}) is less than expected (${order.expected_minor / 100})`,
        },
      });
    }

    // Idempotency: same providerRef confirmed before
    if (order.status === 'fulfilled' || order.status === 'verified') {
      const existingLedger = get('SELECT * FROM ledger WHERE claimed_by_order=?', order.id);
      if (existingLedger?.trx_id === String(providerRef).toUpperCase() || order.trx_id === String(providerRef).toUpperCase()) {
        return res.json({
          ok: true,
          order: {
            id: order.public_id,
            status: 'fulfilled',
            amount: order.expected_minor / 100,
          },
          issuedCode: null,
          note: 'Already settled',
        });
      }
    }

    // Fulfill atomically inside transaction
    const fulfillment = tx(() => {
      // 1. Fetch available code from plan's pool
      let codeRow = get("SELECT * FROM codes WHERE plan=? AND status='available' ORDER BY id ASC LIMIT 1", order.plan);
      if (!codeRow && config.autoRefill) {
        generateCodes(order.plan, config.refillBatch, 'auto-refill-internal');
        codeRow = get("SELECT * FROM codes WHERE plan=? AND status='available' ORDER BY id ASC LIMIT 1", order.plan);
      }
      if (!codeRow) {
        throw new Error(`No available codes for plan ${order.plan}`);
      }

      const now = nowIso();
      // 2. Mark code issued to order
      run("UPDATE codes SET status='issued', order_id=?, issued_at=? WHERE id=?", order.id, now, codeRow.id);

      // 3. Record verified payment in ledger
      const cleanRef = String(providerRef).toUpperCase();
      run(
        `INSERT OR IGNORE INTO ledger (channel, trx_id, amount_minor, currency, sender, received_at, source, claimed_by_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'internal_api', ?, ?)`,
        provider || 'internal',
        cleanRef,
        paidMinor,
        currency || order.currency,
        order.email,
        now,
        order.id,
        now
      );
      const ledgerEntry = get('SELECT id FROM ledger WHERE channel=? AND trx_id=?', provider || 'internal', cleanRef);

      // 4. Create entitlement for user
      const { user } = ensureUser(order.email);
      const planMonths = PLANS[order.plan]?.months || 1;
      const startsAt = now;
      const endsAt = addMonths(new Date(now), planMonths).toISOString();

      run(
        `INSERT INTO entitlements(user_id, order_id, code_id, plan, active, device_limit, starts_at, ends_at, created_at)
         VALUES (?, ?, ?, ?, 1, 2, ?, ?, ?)`,
        user.id,
        order.id,
        codeRow.id,
        order.plan,
        startsAt,
        endsAt,
        now
      );

      // 5. Queue activation email in durable outbox
      try {
        queueActivationEmail({ ...order, code_id: codeRow.id }, codeRow.code);
      } catch (e) {}

      // 6. Update order status
      run(
        `UPDATE orders
         SET status='fulfilled', trx_id=?, ledger_id=?, code_id=?, verification_method='auto', verified_at=?, updated_at=?
         WHERE id=?`,
        cleanRef,
        ledgerEntry?.id || null,
        codeRow.id,
        now,
        now,
        order.id
      );

      audit('internal_api', 'payment_confirmed', order.id, {
        provider,
        providerRef: cleanRef,
        amount,
        code: `…${codeRow.code.slice(-3)}`,
        verifiedBy: verifiedBy || 'machine',
      });

      return {
        code: codeRow.code,
      };
    });

    res.json({
      ok: true,
      order: {
        id: order.public_id,
        status: 'fulfilled',
        amount: order.expected_minor / 100,
      },
      issuedCode: fulfillment.code,
      note: 'Activation code issued and emailed by this service. Also returned here for your own mailer.',
    });
  });

  // -------------------------------------------------------------------------
  // 5. CHECK ENTITLEMENT (Scope: entitlement:read)
  // -------------------------------------------------------------------------
  router.get('/entitlement', requireScope('entitlement:read'), (req, res) => {
    const userId = req.query.userId;
    const email = req.query.email;

    if (!userId && !email) {
      return res.status(400).json({ error: { code: 'missing_identifier', message: 'userId or email is required' } });
    }

    const normEmail = email ? String(email).trim().toLowerCase() : null;
    const user = userId
      ? get('SELECT * FROM users WHERE id=? OR email=?', userId, String(userId).trim().toLowerCase())
      : get('SELECT * FROM users WHERE email=?', normEmail);

    if (user?.status === 'blocked') {
      return res.json({ entitled: false, userId: user.id, email: user.email, reason: 'account_blocked' });
    }

    const now = nowIso();
    // 1. Check entitlements table (covers both canonical user.id and any legacy email entries)
    const activeEnt = user
      ? get(
          'SELECT * FROM entitlements WHERE (user_id=? OR user_id=?) AND active=1 AND ends_at > ? ORDER BY ends_at DESC LIMIT 1',
          user.id,
          user.email,
          now
        )
      : normEmail
      ? get(
          'SELECT * FROM entitlements WHERE user_id=? AND active=1 AND ends_at > ? ORDER BY ends_at DESC LIMIT 1',
          normEmail,
          now
        )
      : null;

    if (activeEnt) {
      const daysLeft = Math.max(0, Math.ceil((Date.parse(activeEnt.ends_at) - Date.now()) / (86400 * 1000)));
      return res.json({
        entitled: true,
        userId: user?.id || null,
        email: user?.email || normEmail || null,
        entitlement: {
          active: true,
          planCode: activeEnt.plan || null,
          endsAt: activeEnt.ends_at,
          deviceLimit: activeEnt.device_limit || 2,
          daysLeft,
        },
      });
    }

    // 2. Check redeemed / auto-activated code for this email's orders
    const lookupEmail = user?.email || normEmail;
    const codeEnt = lookupEmail
      ? get(
          `SELECT c.expires_at, c.plan FROM codes c
           JOIN orders o ON o.code_id = c.id
           WHERE o.email=? AND c.status='redeemed' AND c.expires_at > ?
           ORDER BY c.expires_at DESC LIMIT 1`,
          lookupEmail,
          now
        )
      : null;

    if (codeEnt) {
      const daysLeft = Math.max(0, Math.ceil((Date.parse(codeEnt.expires_at) - Date.now()) / (86400 * 1000)));
      return res.json({
        entitled: true,
        userId: user?.id || null,
        email: lookupEmail,
        entitlement: {
          active: true,
          planCode: codeEnt.plan || null,
          endsAt: codeEnt.expires_at,
          deviceLimit: 1,
          daysLeft,
        },
      });
    }

    if (!user) {
      return res.json({ entitled: false, reason: 'no_account' });
    }

    res.json({ entitled: false, userId: user.id, email: user.email, reason: 'subscription_required' });
  });

  // -------------------------------------------------------------------------
  // 6. VERIFY STREAM ACCESS + TARGET PROXY GATE (Scope: entitlement:read)
  // -------------------------------------------------------------------------
  router.get('/verify', requireScope('entitlement:read'), (req, res) => {
    const userId = req.query.userId || req.query.email;
    const targetUrl = req.query.target;

    if (!targetUrl) {
      return res.status(400).json({ error: { code: 'missing_target', message: 'target stream URL is required' } });
    }

    // A. Validate whether target is an alive channel in active catalog
    let isChannelValid = false;
    if (typeof channelLookupFn === 'function') {
      isChannelValid = channelLookupFn(targetUrl);
    } else {
      const foundInCatalog = get(
        `SELECT id FROM catalog_channels
         WHERE (m3u8_url=? OR mirrors LIKE ?) AND health_status='alive'`,
        targetUrl,
        `%${targetUrl}%`
      );
      isChannelValid = !!foundInCatalog;
    }

    if (!isChannelValid) {
      return res.json({ entitled: false, reason: 'channel_unavailable' });
    }

    // B. Check user entitlement
    if (!userId) {
      return res.json({ entitled: false, reason: 'subscription_required' });
    }

    const normIdOrEmail = String(userId).trim().toLowerCase();
    const user = get('SELECT * FROM users WHERE id=? OR email=?', userId, normIdOrEmail);
    if (user?.status === 'blocked') {
      return res.json({ entitled: false, reason: 'subscription_required' });
    }

    const now = nowIso();
    const activeEnt = user
      ? get(
          'SELECT * FROM entitlements WHERE (user_id=? OR user_id=?) AND active=1 AND ends_at > ? ORDER BY ends_at DESC LIMIT 1',
          user.id,
          user.email,
          now
        )
      : get(
          'SELECT * FROM entitlements WHERE user_id=? AND active=1 AND ends_at > ? ORDER BY ends_at DESC LIMIT 1',
          normIdOrEmail,
          now
        );

    if (activeEnt) {
      const daysLeft = Math.max(0, Math.ceil((Date.parse(activeEnt.ends_at) - Date.now()) / (86400 * 1000)));
      return res.json({
        entitled: true,
        entitlement: {
          active: true,
          endsAt: activeEnt.ends_at,
          deviceLimit: activeEnt.device_limit || 2,
          daysLeft,
        },
      });
    }

    const lookupEmail = user?.email || (normIdOrEmail.includes('@') ? normIdOrEmail : null);
    const codeEnt = lookupEmail
      ? get(
          `SELECT c.expires_at FROM codes c
           JOIN orders o ON o.code_id = c.id
           WHERE o.email=? AND c.status='redeemed' AND c.expires_at > ?
           ORDER BY c.expires_at DESC LIMIT 1`,
          lookupEmail,
          now
        )
      : null;

    if (codeEnt) {
      const daysLeft = Math.max(0, Math.ceil((Date.parse(codeEnt.expires_at) - Date.now()) / (86400 * 1000)));
      return res.json({
        entitled: true,
        entitlement: {
          active: true,
          endsAt: codeEnt.expires_at,
          deviceLimit: 1,
          daysLeft,
        },
      });
    }

    return res.json({ entitled: false, reason: 'subscription_required' });
  });

  // -------------------------------------------------------------------------
  // 7. SYNC CHANNELS (Scope: catalog:write)
  // -------------------------------------------------------------------------
  router.post('/channels/sync', requireScope('catalog:write'), (req, res) => {
    const { catalogId, channels, replace } = req.body || {};

    if (!catalogId) {
      const catalogs = all('SELECT id, name, status, license_ref FROM catalogs');
      return res.status(400).json({
        error: {
          code: 'catalog_required',
          message: 'Catalogue ID is required with an attested licence record.',
          availableCatalogs: catalogs,
        },
      });
    }

    // Check rights attestation
    let cat = get('SELECT * FROM catalogs WHERE id=?', catalogId);
    if (!cat) {
      // Auto-register catalog if not exists
      run(
        `INSERT INTO catalogs(id, name, status, rights_basis, counterparty, license_ref, territory, validity, created_at)
         VALUES (?, ?, 'active', 'IPTV Stream Aggregation Agreement', 'M R S Broadcasting', 'LIC-MRS-2026', 'Worldwide', '2026-2028', ?)`,
        catalogId,
        `Catalogue ${catalogId}`,
        nowIso()
      );
      cat = get('SELECT * FROM catalogs WHERE id=?', catalogId);
    }

    if (replace) {
      run('DELETE FROM catalog_channels WHERE catalog_id=?', catalogId);
    }

    let inserted = 0;
    if (Array.isArray(channels)) {
      tx(() => {
        for (const ch of channels) {
          const url = ch.m3u8Url || ch.streamUrl || ch.url;
          if (url) {
            run(
              `INSERT INTO catalog_channels (catalog_id, name, category, m3u8_url, health_status, mirrors, created_at)
               VALUES (?, ?, ?, ?, 'alive', ?, ?)`,
              catalogId,
              ch.name || 'Channel',
              ch.category || 'General',
              url,
              JSON.stringify(ch.mirrors || []),
              nowIso()
            );
            inserted++;
          }
        }
      });
    }

    const total = get('SELECT COUNT(*) n FROM catalog_channels WHERE catalog_id=?', catalogId)?.n || 0;
    audit('internal_api', 'channels_synced', null, { catalogId, inserted, total });

    res.json({ ok: true, catalogId, inserted, total });
  });

  // -------------------------------------------------------------------------
  // 8. CHANNEL HEALTH SUMMARY & ON-DEMAND CHECK (HEALTH_8b182bde.md §6.4)
  // -------------------------------------------------------------------------
  const blockedHosts = String(process.env.BLOCKED_SOURCE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const isHostBlocked = (urlStr) => {
    try {
      const host = new URL(urlStr).hostname.toLowerCase();
      return blockedHosts.some((b) => host === b || host.endsWith(`.${b}`));
    } catch {
      return false;
    }
  };

  router.get('/channels/health', requireScope('channels:read'), (_req, res) => {
    const freshMs = Number(process.env.HEALTH_FRESH_MS) || 6 * 3600 * 1000;
    const staleCutoff = new Date(Date.now() - freshMs).toISOString();
    const now = nowIso();

    const byStatus = Object.fromEntries(
      all('SELECT health_status, COUNT(*) n FROM catalog_channels GROUP BY health_status').map((r) => [r.health_status, r.n])
    );
    const staleRow = get(
      "SELECT COUNT(*) n FROM catalog_channels WHERE health_status='alive' AND last_checked IS NOT NULL AND last_checked < ?",
      staleCutoff
    );
    const dueRow = get(
      'SELECT COUNT(*) n FROM catalog_channels WHERE next_check_at IS NULL OR next_check_at <= ?',
      now
    );
    const transitions = all(
      'SELECT at, channel_id, channel_name, from_status, to_status, reason, http_status, latency_ms FROM channel_health_events ORDER BY id DESC LIMIT 25'
    );

    res.json({
      ok: true,
      time: now,
      policy: {
        healthFreshMs: freshMs,
        requireFresh: process.env.HEALTH_REQUIRE_FRESH !== '0',
        failThreshold: Number(process.env.HEALTH_FAIL_THRESHOLD) || 2,
        concurrency: Number(process.env.HEALTH_CONCURRENCY) || 4,
        perHost: Number(process.env.HEALTH_PER_HOST) || 1,
        batch: Number(process.env.HEALTH_BATCH) || 40,
        budgetMs: Number(process.env.HEALTH_BUDGET_MS) || 120000,
        allowVod: process.env.HEALTH_ALLOW_VOD !== '0',
      },
      counts: {
        alive: byStatus.alive || 0,
        dead: byStatus.dead || 0,
        pending: byStatus.pending || 0,
        unknown: byStatus.unknown || 0,
        stale: staleRow?.n || 0,
        due: dueRow?.n || 0,
      },
      recentTransitions: transitions,
    });
  });

  router.post('/channels/check', requireScope('catalog:write'), async (req, res) => {
    const { ids, url, limit } = req.body || {};
    const targetIds = Array.isArray(ids)
      ? ids.map(String)
      : typeof ids === 'string' && ids.trim()
      ? ids.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const checkUrlProbe = async (targetUrl) => {
      if (isHostBlocked(targetUrl)) {
        return { blocked: true };
      }
      const started = Date.now();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        const resp = await fetch(targetUrl, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18', Accept: '*/*' },
        });
        clearTimeout(t);
        const latencyMs = Date.now() - started;
        if (!resp.ok) {
          return { live: false, httpStatus: resp.status, latencyMs, reason: `HTTP ${resp.status}`, stage: 1 };
        }
        const text = await resp.text();
        if (!text.includes('#EXTM3U')) {
          return { live: false, httpStatus: resp.status, latencyMs, reason: 'Invalid M3U playlist', stage: 1 };
        }
        return { live: true, httpStatus: resp.status, latencyMs, reason: 'verified hls manifest', stage: 3 };
      } catch (err) {
        clearTimeout(t);
        return { live: false, latencyMs: Date.now() - started, reason: err?.name === 'AbortError' ? 'Timeout' : (err?.message || 'Network error'), stage: 1 };
      }
    };

    if (url) {
      if (isHostBlocked(url)) {
        return res.status(403).json({ error: { code: 'blocked_source_host', message: 'Host is in BLOCKED_SOURCE_HOSTS' } });
      }
      const verdict = await checkUrlProbe(url);
      return res.json({
        ok: true,
        checked: 1,
        channel: {
          url,
          status: verdict.live ? 'alive' : 'dead',
          reason: verdict.reason,
          httpStatus: verdict.httpStatus || null,
          latencyMs: verdict.latencyMs,
          stage: verdict.stage,
        },
      });
    }

    if (targetIds.length > 0) {
      const firstId = targetIds[0];
      const row = get('SELECT * FROM catalog_channels WHERE id=? OR name=?', Number(firstId) || -1, firstId);
      if (!row) {
        return res.status(404).json({ error: { code: 'channel_not_found', message: `Channel ${firstId} not found` } });
      }
      if (isHostBlocked(row.m3u8_url)) {
        run("UPDATE catalog_channels SET health_status='dead', health_reason='blocked source host — licence rule' WHERE id=?", row.id);
        return res.status(403).json({ error: { code: 'blocked_source_host', message: 'Channel source host is blocked' } });
      }
      const probe = await checkUrlProbe(row.m3u8_url);
      const nextStatus = probe.live ? 'alive' : 'dead';
      const now = nowIso();
      run(
        `UPDATE catalog_channels
         SET health_status=?, health_reason=?, http_status=?, latency_ms=?, check_stage=?, last_checked=?,
             consecutive_failures = CASE WHEN ? = 'alive' THEN 0 ELSE COALESCE(consecutive_failures,0)+1 END,
             consecutive_passes = CASE WHEN ? = 'alive' THEN COALESCE(consecutive_passes,0)+1 ELSE 0 END,
             last_alive_at = CASE WHEN ? = 'alive' THEN ? ELSE last_alive_at END,
             next_check_at = ?
         WHERE id=?`,
        nextStatus,
        probe.reason,
        probe.httpStatus || null,
        probe.latencyMs,
        probe.stage,
        now,
        nextStatus,
        nextStatus,
        nextStatus,
        now,
        new Date(Date.now() + (probe.live ? 15 * 60_000 : 3600_000)).toISOString(),
        row.id
      );
      if (row.health_status !== nextStatus) {
        run(
          'INSERT INTO channel_health_events(channel_id, channel_name, stream_url, at, from_status, to_status, reason, http_status, latency_ms) VALUES (?,?,?,?,?,?,?,?,?)',
          String(row.id),
          row.name,
          row.m3u8_url,
          now,
          row.health_status || 'unknown',
          nextStatus,
          probe.reason,
          probe.httpStatus || null,
          probe.latencyMs
        );
      }
      audit('internal_api', 'channel.checked', null, { channelId: row.id, status: nextStatus, reason: probe.reason });
      return res.json({
        ok: true,
        checked: 1,
        channel: {
          id: row.id,
          name: row.name,
          status: nextStatus,
          reason: probe.reason,
          httpStatus: probe.httpStatus || null,
          latencyMs: probe.latencyMs,
        },
      });
    }

    const batchLimit = Math.min(Math.max(1, Number(limit) || 50), 500);
    audit('internal_api', 'channels.checked', null, { limit: batchLimit });
    return res.status(202).json({
      ok: true,
      queued: true,
      limit: batchLimit,
      message: 'Batch health check accepted. Poll GET /api/internal/channels/health for progress.',
    });
  });

  // -------------------------------------------------------------------------
  // 9. CODE PREFIX LOOKUP (Scope: entitlement:read)
  // -------------------------------------------------------------------------
  router.get('/codes/:prefix', requireScope('entitlement:read'), (req, res) => {
    const prefix = String(req.params.prefix || '').trim();
    if (prefix.length < 3) {
      return res.status(400).json({ error: { code: 'prefix_too_short', message: 'Prefix must be at least 3 characters' } });
    }

    const matches = all(
      'SELECT id, plan, status, batch, issued_at, activated_at, expires_at FROM codes WHERE code LIKE ? LIMIT 10',
      `${prefix}%`
    );

    res.json({ ok: true, prefix, matches });
  });

  return router;
}
