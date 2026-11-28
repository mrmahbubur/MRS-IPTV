// Redeeming an activation code + entitlement tokens for the app.
//
// • Only codes that were ISSUED to a verified order can be redeemed. Unsold
//   inventory ('available') is rejected, so leaking the code pool is harmless.
// • A code binds to the first device that redeems it (1 device per code).
//   The same device may re-redeem to restore access (reinstall, cleared cache).
// • The plan clock starts at first activation (EXPIRY_FROM=issue to change).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config, PLANS } from './config.js';
import { get, all, run, tx, nowIso, audit } from './db.js';
import { addMonths, isValidCodeFormat } from './codes.js';
import { normalizeEmail } from './validators.js';

const b64u = (b) => Buffer.from(b).toString('base64url');
export const DEVICE_ID_REGEX = /^[A-Za-z0-9_-]{12,128}$/;

export function sanitizeDeviceId(raw) {
  if (raw === null || raw === undefined || typeof raw === 'object') return null;
  const clean = String(raw).trim();
  return DEVICE_ID_REGEX.test(clean) ? clean : null;
}

export const hashDevice = (d) => createHash('sha256').update(String(d || '')).digest('hex').slice(0, 24);

// Brute-force protection on failed activation code guesses
const failedAttempts = new Map();
export function checkActivationLockout(key) {
  if (!key) return { blocked: false };
  const entry = failedAttempts.get(key);
  if (!entry) return { blocked: false };
  if (entry.lockUntil && entry.lockUntil > Date.now()) {
    return { blocked: true, retryAfterSeconds: Math.ceil((entry.lockUntil - Date.now()) / 1000) };
  }
  if (Date.now() - entry.firstAt > 15 * 60_000) {
    failedAttempts.delete(key);
    return { blocked: false };
  }
  return { blocked: false };
}

export function recordActivationAttempt(key, ok) {
  if (!key) return;
  if (ok) {
    failedAttempts.delete(key);
    return;
  }
  const now = Date.now();
  const prev = failedAttempts.get(key);
  const count = !prev || now - prev.firstAt > 15 * 60_000 ? 1 : prev.count + 1;
  const firstAt = !prev || now - prev.firstAt > 15 * 60_000 ? now : prev.firstAt;
  const lockUntil = count >= 8 ? now + 15 * 60_000 : null;
  failedAttempts.set(key, { count, firstAt, lockUntil });
}

export function normalizeCodeInput(raw) {
  const cleaned = String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('MRS')) {
    const rest = cleaned.slice(3);
    const m = rest.match(/^(1M|2M|6M|12M)([A-Z0-9]{4})([A-Z0-9]{4})([A-Z0-9]{4})$/);
    if (m) return `MRS-${m[1]}-${m[2]}-${m[3]}-${m[4]}`;
  }
  return String(raw ?? '').trim().toUpperCase();
}

const TOKEN_PART_REGEX = /^[A-Za-z0-9_-]+$/;

export function signToken(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Token payload must be a plain object');
  }
  const normalized = {
    ...payload,
    iat: typeof payload.iat === 'number' && Number.isFinite(payload.iat)
      ? Math.floor(payload.iat)
      : Math.floor(Date.now() / 1000),
    jti: typeof payload.jti === 'string' && /^[A-Za-z0-9_-]{12,64}$/.test(payload.jti)
      ? payload.jti
      : randomBytes(12).toString('hex'),
  };
  const body = b64u(JSON.stringify(normalized));
  return `${body}.${createHmac('sha256', config.tokenSecret).update(body).digest('base64url')}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 4096) return null;
  const parts = trimmed.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig || !TOKEN_PART_REGEX.test(body) || !TOKEN_PART_REGEX.test(sig)) return null;
  const expect = createHmac('sha256', config.tokenSecret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.exp !== undefined && (!Number.isFinite(Number(parsed.exp)) || Number(parsed.exp) <= 0)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const entitlement = (row, deviceId, extra = {}) => {
  const plan = PLANS[row.plan] || PLANS['1m'];
  const expiresIso = row.expires_at || row.ends_at;
  const exp = Math.floor(Date.parse(expiresIso) / 1000);
  const daysRemaining = Math.max(0, Math.ceil((Date.parse(expiresIso) - Date.now()) / 86400_000));
  return {
    active: true,
    plan: plan.id,
    planLabel: plan.label,
    months: plan.months,
    durationDays: plan.durationDays || plan.months * 30,
    activatedAt: row.activated_at || row.starts_at,
    expiresAt: expiresIso,
    daysRemaining,
    deviceLimit: extra.deviceLimit ?? 1,
    devices: extra.devices,
    email: extra.email,
    token: signToken({
      v: extra.v || 1,
      cid: row.id,
      eid: extra.entitlementId || null,
      dev: hashDevice(deviceId),
      plan: plan.id,
      email: extra.email || null,
      exp,
    }),
  };
};

const fail = (status, code, message, friendlyCode = null) => ({
  ok: false,
  status,
  code,
  friendlyCode: friendlyCode || code.toUpperCase(),
  message,
});

export function redeem({ code, deviceId }) {
  const c = normalizeCodeInput(code);
  const digitsOnly = String(code ?? '').replace(/[\s-]/g, '');
  const resolvedCode = /^\d+$/.test(digitsOnly) ? digitsOnly : c;

  if (!isValidCodeFormat(resolvedCode)) {
    return fail(400, 'invalid_format', 'Enter the activation code from your email (e.g. MRS-1M-XXXX-XXXX-XXXX or 10-digit pass code).', 'INVALID_CODE');
  }
  const cleanDeviceId = sanitizeDeviceId(deviceId);
  if (!cleanDeviceId) {
    return fail(400, 'invalid_device', 'Missing device identifier', 'INVALID_DEVICE');
  }
  deviceId = cleanDeviceId;

  return tx(() => {
    const row = get('SELECT * FROM codes WHERE code=?', resolvedCode);
    if (!row || row.status === 'available') {
      return fail(404, 'invalid_code', 'This activation code is not valid.', 'INVALID_CODE');
    }
    if (row.status === 'revoked') {
      return fail(403, 'revoked', 'This code has been disabled. Contact support.', 'REVOKED');
    }

    if (row.status === 'issued') {
      const now = new Date();
      const from = config.expiryFrom === 'issue' && row.issued_at ? new Date(row.issued_at) : now;
      const expires = addMonths(from, PLANS[row.plan].months).toISOString();
      run("UPDATE codes SET status='redeemed', device_id=?, activated_at=?, expires_at=? WHERE id=?", deviceId, now.toISOString(), expires, row.id);
      audit('user', 'code_activated', row.order_id || null, { plan: row.plan });
      return { ok: true, ...entitlement({ ...row, activated_at: now.toISOString(), expires_at: expires }, deviceId) };
    }

    // already redeemed
    if (Date.parse(row.expires_at) <= Date.now()) {
      return fail(410, 'expired', 'This pass has expired. Get a new VIP Pass to continue.', 'EXPIRED');
    }
    if (!row.device_id) {
      run('UPDATE codes SET device_id=? WHERE id=?', deviceId, row.id);
      audit('user', 'code_rebound', row.order_id, { plan: row.plan });
      return { ok: true, ...entitlement({ ...row, device_id: deviceId }, deviceId) };
    }
    if (row.device_id !== deviceId) {
      return fail(409, 'device_mismatch', 'This code is already active on another device. Contact support to move it.', 'DEVICE_LIMIT');
    }
    return { ok: true, ...entitlement(row, deviceId) };
  });
}

/**
 * Full account/entitlement activation for POST /api/activate:
 * - Redeems code atomically (each code redeems once).
 * - If the email already has an active plan of the same type, extends from current expiry instead of overlapping.
 * - Enforces configurable multi-device limit (default 2) tracked in the devices table by device_hash.
 */
export function activatePass({ code, email, deviceId, deviceLabel = 'Web Browser' }) {
  const c = normalizeCodeInput(code);
  const digitsOnly = String(code ?? '').replace(/[\s-]/g, '');
  const resolvedCode = /^\d+$/.test(digitsOnly) ? digitsOnly : c;

  if (!isValidCodeFormat(resolvedCode)) {
    return fail(400, 'INVALID_CODE', 'Invalid activation code format. Check the code in your email.');
  }
  const cleanDeviceId = sanitizeDeviceId(deviceId);
  if (!cleanDeviceId) {
    return fail(400, 'INVALID_DEVICE', 'Valid device identifier is required.');
  }
  deviceId = cleanDeviceId;

  const parsedEmail = email ? normalizeEmail(email) : { ok: true, value: '' };
  if (email && !parsedEmail.ok) {
    return fail(400, 'INVALID_EMAIL', parsedEmail.error || 'Invalid email address.');
  }

  return tx(() => {
    const row = get('SELECT * FROM codes WHERE code=?', resolvedCode);
    if (!row || row.status === 'available') {
      return fail(404, 'INVALID_CODE', 'This activation code is invalid.');
    }
    if (row.status === 'revoked') {
      return fail(403, 'REVOKED', 'This activation code has been revoked.');
    }

    const order = row.order_id ? get('SELECT email, customer_name FROM orders WHERE id=?', row.order_id) : null;
    const ownerEmail = parsedEmail.value || order?.email || null;
    const devHash = hashDevice(deviceId);
    const now = nowIso();
    const plan = PLANS[row.plan] || PLANS['1m'];

    // Case A: First-time redemption of an issued code
    if (row.status === 'issued') {
      let userId = ownerEmail || `code_${row.id}`;
      if (ownerEmail) {
        let user = get('SELECT * FROM users WHERE email=?', ownerEmail);
        if (!user) {
          const uid = `usr_${randomBytes(6).toString('hex')}`;
          run("INSERT INTO users(id, email, role, status, created_at) VALUES (?, ?, 'customer', 'active', ?)", uid, ownerEmail, now);
          user = get('SELECT * FROM users WHERE id=?', uid);
        }
        userId = user.id;
      }

      // Check if this user already has an active entitlement for the SAME plan -> extend from current ends_at
      const activeSamePlan = ownerEmail
        ? get(
            'SELECT * FROM entitlements WHERE user_id=? AND plan=? AND active=1 AND ends_at > ? ORDER BY ends_at DESC LIMIT 1',
            userId,
            row.plan,
            now
          )
        : null;

      let entId;
      let startsAt;
      let endsAt;
      let deviceLimit = config.defaultDeviceLimit;

      if (activeSamePlan) {
        startsAt = activeSamePlan.starts_at;
        endsAt = addMonths(new Date(activeSamePlan.ends_at), plan.months).toISOString();
        deviceLimit = activeSamePlan.device_limit || config.defaultDeviceLimit;
        run('UPDATE entitlements SET ends_at=?, code_id=? WHERE id=?', endsAt, row.id, activeSamePlan.id);
        entId = activeSamePlan.id;
      } else {
        startsAt = now;
        endsAt = addMonths(new Date(now), plan.months).toISOString();
        const ins = run(
          `INSERT INTO entitlements(user_id, order_id, code_id, plan, active, device_limit, starts_at, ends_at, created_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
          userId,
          row.order_id || null,
          row.id,
          row.plan,
          deviceLimit,
          startsAt,
          endsAt,
          now
        );
        entId = Number(ins.lastInsertRowid);
      }

      run(
        "UPDATE codes SET status='redeemed', device_id=?, activated_at=?, expires_at=? WHERE id=?",
        deviceId,
        now,
        endsAt,
        row.id
      );

      run(
        `INSERT OR IGNORE INTO devices(entitlement_id, code_id, device_hash, device_label, last_seen, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        entId,
        row.id,
        devHash,
        String(deviceLabel || 'Web Browser').slice(0, 60),
        now,
        now
      );
      run('UPDATE devices SET last_seen=? WHERE entitlement_id=? AND device_hash=?', now, entId, devHash);

      const registeredDevices = all(
        'SELECT device_hash AS deviceHash, device_label AS label, last_seen AS lastSeen, created_at AS createdAt FROM devices WHERE entitlement_id=?',
        entId
      );

      audit('user', 'code_activated', row.order_id || null, {
        plan: row.plan,
        extended: !!activeSamePlan,
        entitlementId: entId,
      });

      return {
        ok: true,
        extended: !!activeSamePlan,
        ...entitlement(
          { id: row.id, plan: row.plan, activated_at: startsAt, expires_at: endsAt },
          deviceId,
          { v: 2, entitlementId: entId, deviceLimit, devices: registeredDevices, email: ownerEmail }
        ),
      };
    }

    // Case B: Code was ALREADY redeemed
    let ent = get('SELECT * FROM entitlements WHERE code_id=? AND active=1 ORDER BY ends_at DESC LIMIT 1', row.id);
    if (!ent && ownerEmail) {
      const user = get('SELECT id FROM users WHERE email=?', ownerEmail);
      if (user) {
        ent = get('SELECT * FROM entitlements WHERE user_id=? AND active=1 ORDER BY ends_at DESC LIMIT 1', user.id);
      }
    }

    const effectiveExpiresAt = ent?.ends_at || row.expires_at;
    if (!effectiveExpiresAt || Date.parse(effectiveExpiresAt) <= Date.now()) {
      return fail(410, 'EXPIRED', 'This VIP Pass has expired. Renew your plan to continue.');
    }

    if (ent) {
      if (ownerEmail) {
        const expectedUser = get('SELECT email FROM users WHERE id=?', ent.user_id);
        if (expectedUser?.email && expectedUser.email !== ownerEmail) {
          return fail(409, 'ALREADY_USED', 'This activation code has already been redeemed by another account.');
        }
      }

      const existingDev = get('SELECT * FROM devices WHERE entitlement_id=? AND device_hash=?', ent.id, devHash);
      const allDevs = all(
        'SELECT device_hash AS deviceHash, device_label AS label, last_seen AS lastSeen, created_at AS createdAt FROM devices WHERE entitlement_id=?',
        ent.id
      );
      const limit = ent.device_limit || config.defaultDeviceLimit;

      if (!existingDev && allDevs.length >= limit) {
        return fail(409, 'DEVICE_LIMIT', `Device limit (${limit}) reached for this VIP Pass. Remove a device from your Account page to connect this one.`);
      }

      if (!existingDev) {
        run(
          `INSERT INTO devices(entitlement_id, code_id, device_hash, device_label, last_seen, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ent.id,
          row.id,
          devHash,
          String(deviceLabel || 'Web Browser').slice(0, 60),
          now,
          now
        );
      } else {
        run('UPDATE devices SET last_seen=? WHERE id=?', now, existingDev.id);
      }

      const freshDevs = all(
        'SELECT device_hash AS deviceHash, device_label AS label, last_seen AS lastSeen, created_at AS createdAt FROM devices WHERE entitlement_id=?',
        ent.id
      );

      return {
        ok: true,
        ...entitlement(
          { id: row.id, plan: row.plan, activated_at: ent.starts_at, expires_at: effectiveExpiresAt },
          deviceId,
          { v: 2, entitlementId: ent.id, deviceLimit: limit, devices: freshDevs, email: ownerEmail }
        ),
      };
    }

    // Legacy single-device redeemed code with no entitlement row
    if (row.device_id && row.device_id !== deviceId) {
      return fail(409, 'ALREADY_USED', 'This activation code has already been redeemed on another device.');
    }
    if (!row.device_id) {
      run('UPDATE codes SET device_id=? WHERE id=?', deviceId, row.id);
    }
    return {
      ok: true,
      ...entitlement({ ...row, device_id: deviceId }, deviceId, { email: ownerEmail }),
    };
  });
}

/** Called by the app on launch: is this token still good for this device? */
export function checkEntitlement({ token, deviceId }) {
  const p = verifyToken(token);
  const cleanDeviceId = sanitizeDeviceId(deviceId);
  if (!p || !cleanDeviceId || p.dev !== hashDevice(cleanDeviceId)) {
    return fail(401, 'invalid_token', 'Invalid pass token', 'INVALID_CODE');
  }
  deviceId = cleanDeviceId;

  // 1. Rewarded / Sponsor Reward 1-Hour VIP Grant Tokens
  if (p.kind === 'reward' || p.kind === 'sponsor_reward') {
    const grantId = Number(p.gid);
    if (!Number.isFinite(grantId) || grantId <= 0) {
      return fail(401, 'invalid_token', 'Invalid reward token', 'INVALID_CODE');
    }
    const grant = get('SELECT * FROM reward_grants WHERE id=? AND device_hash=?', grantId, p.dev);
    if (!grant || grant.revoked_at) {
      return fail(403, 'not_active', 'Reward pass is no longer active', 'REVOKED');
    }
    if (Date.parse(grant.expires_at) <= Date.now()) {
      return fail(410, 'expired', 'Your 1-hour free VIP pass has expired', 'EXPIRED');
    }
    const resolvedPlan = p.plan === 'sponsor_reward' ? 'sponsor_reward' : 'reward1h';
    return {
      ok: true,
      kind: p.kind,
      grantId: grant.id,
      active: true,
      plan: resolvedPlan,
      planCode: resolvedPlan,
      planLabel: '1-Hour Free VIP (Reward)',
      network: grant.network,
      months: 0,
      durationDays: 0,
      activatedAt: grant.granted_at,
      expiresAt: grant.expires_at,
      daysRemaining: 0,
      deviceLimit: 1,
      unlocksVipChannels: Boolean(config.rewards?.unlocksVipChannels ?? true),
      token,
    };
  }

  // 2. Paid VIP Activation Code & Multi-Device Entitlements
  const row = get('SELECT * FROM codes WHERE id=?', p.cid);
  if (!row || row.status !== 'redeemed') return fail(403, 'not_active', 'This pass is no longer active', 'REVOKED');

  if (p.eid) {
    const ent = get('SELECT * FROM entitlements WHERE id=? AND active=1', p.eid);
    if (!ent) return fail(403, 'not_active', 'This subscription is no longer active', 'REVOKED');
    if (Date.parse(ent.ends_at) <= Date.now()) return fail(410, 'expired', 'This pass has expired', 'EXPIRED');
    const devRow = get('SELECT id FROM devices WHERE entitlement_id=? AND device_hash=?', ent.id, p.dev);
    if (!devRow) return fail(403, 'device_removed', 'This device was removed from the account', 'DEVICE_LIMIT');
    run('UPDATE devices SET last_seen=? WHERE id=?', nowIso(), devRow.id);
    const devices = all(
      'SELECT device_hash AS deviceHash, device_label AS label, last_seen AS lastSeen, created_at AS createdAt FROM devices WHERE entitlement_id=?',
      ent.id
    );
    return {
      ok: true,
      ...entitlement(
        { id: row.id, plan: row.plan, activated_at: ent.starts_at, expires_at: ent.ends_at },
        deviceId,
        { v: 2, entitlementId: ent.id, deviceLimit: ent.device_limit, devices, email: p.email }
      ),
    };
  }

  if (row.device_id !== deviceId) return fail(403, 'not_active', 'This pass is no longer active', 'DEVICE_LIMIT');
  if (Date.parse(row.expires_at) <= Date.now()) return fail(410, 'expired', 'This pass has expired', 'EXPIRED');
  return { ok: true, ...entitlement(row, deviceId) };
}

export function getEntitlementStatus({ token, deviceId }) {
  return checkEntitlement({ token, deviceId });
}

export function removeRegisteredDevice({ token, deviceHash, deviceId }) {
  const p = verifyToken(token);
  if (!p) return fail(401, 'invalid_token', 'Invalid session token');

  const cleanHash = typeof deviceHash === 'string' && /^[a-f0-9]{16,64}$/i.test(deviceHash.trim()) ? deviceHash.trim() : '';
  const cleanDeviceId = sanitizeDeviceId(deviceId);
  const targetHash = cleanHash || (cleanDeviceId ? hashDevice(cleanDeviceId) : '');
  if (!targetHash) return fail(400, 'bad_request', 'Valid deviceHash or deviceId is required');

  if (p.eid) {
    const del = run('DELETE FROM devices WHERE entitlement_id=? AND device_hash=?', p.eid, targetHash);
    if (del.changes === 0) return fail(404, 'not_found', 'Device not found for this subscription');
    audit('user', 'device_removed', null, { entitlementId: p.eid, deviceHash: targetHash });
    const devices = all(
      'SELECT device_hash AS deviceHash, device_label AS label, last_seen AS lastSeen, created_at AS createdAt FROM devices WHERE entitlement_id=?',
      p.eid
    );
    return { ok: true, removed: targetHash, devices };
  }

  const row = get('SELECT * FROM codes WHERE id=?', p.cid);
  if (!row) return fail(404, 'not_found', 'Subscription not found');
  if (row.device_id && hashDevice(row.device_id) === targetHash) {
    run('UPDATE codes SET device_id=NULL WHERE id=?', row.id);
    audit('user', 'device_removed', row.order_id, { codeId: row.id });
    return { ok: true, removed: targetHash, devices: [] };
  }
  return fail(404, 'not_found', 'Device not found');
}

export function resetDevice(code, actor = 'admin') {
  const row = get('SELECT * FROM codes WHERE code=?', code);
  if (!row) return null;
  if (row.status === 'redeemed') {
    run('UPDATE codes SET device_id=NULL WHERE id=?', row.id);
    run('DELETE FROM devices WHERE code_id=?', row.id);
  }
  audit(actor, 'device_reset', row.order_id, { code: `…${code.slice(-3)}` });
  return get('SELECT * FROM codes WHERE id=?', row.id);
}

/**
 * Automatically claim a VIP pass that was activated by the 12-hour delayed trigger.
 * Enforces single-device lock on the first device that claims the order.
 */
export function claimOrderVip({ orderId, deviceId }) {
  const cleanOrderId = String(orderId ?? '').trim();
  if (!cleanOrderId) return fail(400, 'invalid_order', 'Order ID is required');
  const cleanDeviceId = sanitizeDeviceId(deviceId);
  if (!cleanDeviceId) {
    return fail(400, 'invalid_device', 'Missing device identifier');
  }
  deviceId = cleanDeviceId;

  return tx(() => {
    const order = get('SELECT * FROM orders WHERE public_id=?', cleanOrderId);
    if (!order) return fail(404, 'not_found', 'Order not found');
    if (order.status !== 'verified' || !order.auto_activated_at || !order.code_id) {
      return fail(409, 'not_auto_activated', 'This order has not been automatically activated yet.');
    }

    const row = get('SELECT * FROM codes WHERE id=?', order.code_id);
    if (!row) return fail(404, 'not_found', 'VIP code record not found');
    if (row.status === 'revoked') return fail(403, 'revoked', 'This code has been disabled. Contact support.');
    if (row.status !== 'redeemed') return fail(409, 'not_active', 'Pass is not active yet.');
    if (Date.parse(row.expires_at) <= Date.now()) {
      return fail(410, 'expired', 'This pass has expired. Get a new VIP Pass to continue.');
    }

    if (!row.device_id) {
      run('UPDATE codes SET device_id=? WHERE id=?', deviceId, row.id);
      audit('user', 'order_auto_claim', order.id, { plan: row.plan });
      return { ok: true, autoActivated: true, ...entitlement({ ...row, device_id: deviceId }, deviceId) };
    }
    if (row.device_id !== deviceId) {
      return fail(409, 'device_mismatch', 'This auto-activated VIP pass is already locked to another device.');
    }
    return { ok: true, autoActivated: true, ...entitlement(row, deviceId) };
  });
}
