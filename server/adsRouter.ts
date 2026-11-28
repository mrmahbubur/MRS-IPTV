import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import { db, get, all, run, nowIso, tx } from './mrs-iptv-backend/src/db.js';
import { getEntitlementStatus, hashDevice, signToken } from './mrs-iptv-backend/src/redeem.js';
import { config as backendConfig } from './mrs-iptv-backend/src/config.js';
import { requireAdmin } from '../src/middleware/auth.js';
import { getTrustedClientIp } from './clientIp.js';

export interface MonetagZoneEntry {
  zoneId: string;
  url: string;
  network: 'Monetag Direct';
  format: 'banner' | 'interstitial';
  label: string;
}

/**
 * Exact verified owner Monetag zones (preserved verbatim).
 */
export const MONETAG_ZONES: MonetagZoneEntry[] = [
  {
    zoneId: '11226634',
    url: 'https://uplcm.com/4/11226634',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Ultra-HD Sports & Match Priority Line',
  },
  {
    zoneId: '11683565',
    url: 'https://uplcm.com/4/11683565',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Live Sports Score & Goal Alert Feed',
  },
  {
    zoneId: '11242745',
    url: 'https://uplcm.com/4/11242745',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Sports Highlight & Match Replay Hub',
  },
  {
    zoneId: '11242069',
    url: 'https://uplcm.com/4/11242069',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'VIP Sports Fans Community Lounge',
  },
  {
    zoneId: '11242067',
    url: 'https://uplcm.com/4/11242067',
    network: 'Monetag Direct',
    format: 'interstitial',
    label: '24/7 Exclusive HD Cinema & Live Broadcasts',
  },
  {
    zoneId: '11242742',
    url: 'https://uplcm.com/4/11242742',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Global Sports Discussion & Fixture Hub',
  },
  {
    zoneId: '11230440',
    url: 'https://uplcm.com/4/11230440',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'High-Speed Global IPTV Mirror Support',
  },
  {
    zoneId: '11683560',
    url: 'https://uplcm.com/4/11683560',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Prime Broadcast CDN & Zero-Lag Relay',
  },
  {
    zoneId: '9912130',
    url: 'https://uplcm.com/4/9912130',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'All-Day Cinema, Reels & Sports Lounge',
  },
  {
    zoneId: '11242744',
    url: 'https://uplcm.com/4/11242744',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'International Match Stream Partner Network',
  },
];

export interface AdSettings {
  formats: {
    banner: boolean;
    sticky: boolean;
    popunder: boolean;
    interstitial: boolean;
    push: boolean;
  };
  testMode: boolean;
  monetag: {
    showRegularAds: boolean;
    rewarded: {
      enabled: boolean;
      snippet: string | null;
      showFn: string | null;
    };
  };
}

const SHOW_FN_REGEX = /^[A-Za-z_$][A-Za-z0-9_$.]{0,63}$/;

function sanitizeShowFn(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (!SHOW_FN_REGEX.test(trimmed)) {
    throw new AdPolicyValidationError(
      400,
      'invalid_show_fn',
      'Rewarded callback name must be a valid global function identifier (e.g. show_123456).'
    );
  }
  return trimmed;
}

const DEFAULT_AD_SETTINGS: AdSettings = {
  formats: {
    banner: true,
    sticky: true,
    popunder: false,
    interstitial: false,
    push: false,
  },
  testMode: typeof backendConfig.rewards?.adsTestMode === 'boolean' ? backendConfig.rewards.adsTestMode : true,
  monetag: {
    showRegularAds: Boolean(backendConfig.rewards?.monetagShowRegularAds),
    rewarded: {
      enabled: Boolean(backendConfig.rewards?.monetagRewardedEnabled),
      snippet: null,
      showFn:
        backendConfig.rewards?.monetagRewardedShowFn &&
        SHOW_FN_REGEX.test(backendConfig.rewards.monetagRewardedShowFn)
          ? backendConfig.rewards.monetagRewardedShowFn
          : null,
    },
  },
};

export function getAdSettings(): AdSettings {
  try {
    const row = get('SELECT value_json FROM ad_settings WHERE key = ?', 'config') as { value_json?: string } | undefined;
    if (row?.value_json) {
      const parsed = JSON.parse(row.value_json);
      return {
        formats: {
          banner: typeof parsed.formats?.banner === 'boolean' ? parsed.formats.banner : DEFAULT_AD_SETTINGS.formats.banner,
          sticky: typeof parsed.formats?.sticky === 'boolean' ? parsed.formats.sticky : DEFAULT_AD_SETTINGS.formats.sticky,
          popunder: typeof parsed.formats?.popunder === 'boolean' ? parsed.formats.popunder : DEFAULT_AD_SETTINGS.formats.popunder,
          interstitial: typeof parsed.formats?.interstitial === 'boolean' ? parsed.formats.interstitial : DEFAULT_AD_SETTINGS.formats.interstitial,
          push: typeof parsed.formats?.push === 'boolean' ? parsed.formats.push : DEFAULT_AD_SETTINGS.formats.push,
        },
        testMode: typeof parsed.testMode === 'boolean' ? parsed.testMode : DEFAULT_AD_SETTINGS.testMode,
        monetag: {
          showRegularAds: Boolean(parsed.monetag?.showRegularAds),
          rewarded: {
            enabled: Boolean(parsed.monetag?.rewarded?.enabled),
            snippet: parsed.monetag?.rewarded?.snippet || null,
            showFn: parsed.monetag?.rewarded?.showFn || null,
          },
        },
      };
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_AD_SETTINGS));
}

export class AdPolicyValidationError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function saveAdSettings(partial: Partial<AdSettings>): AdSettings {
  const current = getAdSettings();

  const next: AdSettings = {
    formats: {
      banner: typeof partial.formats?.banner === 'boolean' ? partial.formats.banner : current.formats.banner,
      sticky: typeof partial.formats?.sticky === 'boolean' ? partial.formats.sticky : current.formats.sticky,
      popunder: typeof partial.formats?.popunder === 'boolean' ? partial.formats.popunder : current.formats.popunder,
      interstitial: typeof partial.formats?.interstitial === 'boolean' ? partial.formats.interstitial : current.formats.interstitial,
      push: typeof partial.formats?.push === 'boolean' ? partial.formats.push : current.formats.push,
    },
    testMode: typeof partial.testMode === 'boolean' ? partial.testMode : current.testMode,
    monetag: {
      showRegularAds:
        typeof partial.monetag?.showRegularAds === 'boolean'
          ? partial.monetag.showRegularAds
          : current.monetag.showRegularAds,
      rewarded: {
        enabled:
          partial.monetag?.rewarded && typeof partial.monetag.rewarded.enabled === 'boolean'
            ? partial.monetag.rewarded.enabled
            : current.monetag.rewarded.enabled,
        snippet:
          partial.monetag?.rewarded && 'snippet' in partial.monetag.rewarded
            ? (partial.monetag.rewarded.snippet ? String(partial.monetag.rewarded.snippet) : null)
            : current.monetag.rewarded.snippet,
        showFn:
          partial.monetag?.rewarded && 'showFn' in partial.monetag.rewarded
            ? sanitizeShowFn(partial.monetag.rewarded.showFn)
            : current.monetag.rewarded.showFn,
      },
    },
  };

  run(
    `INSERT INTO ad_settings(key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    'config',
    JSON.stringify(next),
    nowIso()
  );
  return next;
}

function hashClientIp(ip: string): string {
  const secret = backendConfig.signingSecret || 'mrs-iptv-ad-ip-hmac';
  return crypto.createHmac('sha256', secret).update(String(ip || 'unknown')).digest('hex').slice(0, 32);
}

function safeTimingEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isVipRequest(req: Request): boolean {
  try {
    const auth = req.get('authorization') || '';
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const token = bearer || String(req.get('x-vip-token') || '');
    if (!token) return false;
    const deviceId = String(req.get('x-device-id') || req.query.deviceId || '');
    const r = getEntitlementStatus({ token, deviceId });
    return Boolean(r?.ok && r?.active);
  } catch {
    return false;
  }
}

export function createAdsRouter() {
  const router = express.Router();

  // Simple in-memory rate limiter for /api/ads/event (max 60 requests per minute per IP)
  const eventBuckets = new Map<string, { count: number; resetAt: number }>();
  const rateLimitEvents = (req: Request, res: Response, next: express.NextFunction) => {
    const ip = getTrustedClientIp(req);
    const now = Date.now();
    const bucket = eventBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      eventBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (bucket.count >= 60) {
      return res.status(429).json({
        ok: false,
        data: null,
        error: { code: 'rate_limited', message: 'Too many ad telemetry batches' },
      });
    }
    bucket.count += 1;
    return next();
  };

  // 1. Public Monetag Ad Gate Runtime Config: GET /api/ads/config
  router.get('/api/ads/config', (_req: Request, res: Response) => {
    const settings = getAdSettings();
    const rewardsCfg = backendConfig.rewards || {
      durationMinutes: 60,
      minWatchMs: 15000,
      cooldownMinutes: 180,
      maxPerDevicePerDay: 3,
      maxPerIpPerDay: 6,
      maxStartsPerIpPerHour: 20,
      unlocksVipChannels: true,
    };
    const monetagRewardedEnabled = Boolean(
      settings.monetag.rewarded.enabled &&
      (settings.testMode || settings.monetag.rewarded.snippet || settings.monetag.rewarded.showFn)
    );

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
    return res.json({
      ok: true,
      data: {
        formats: settings.formats,
        testMode: settings.testMode,
        monetag: {
          showRegularAds: Boolean(settings.monetag.showRegularAds),
          rewardedEnabled: monetagRewardedEnabled,
          rewardedShowFn: monetagRewardedEnabled ? (settings.monetag.rewarded.showFn || null) : null,
        },
        rewards: {
          durationMinutes: rewardsCfg.durationMinutes,
          minWatchMs: rewardsCfg.minWatchMs,
          cooldownMinutes: rewardsCfg.cooldownMinutes,
          maxPerDevicePerDay: rewardsCfg.maxPerDevicePerDay,
          unlocksVipChannels: Boolean(rewardsCfg.unlocksVipChannels),
          anyRewardedAvailable: monetagRewardedEnabled,
        },
      },
      error: null,
    });
  });

  // 2. Batched Free-User Monetag Ad Event Collector: POST /api/ads/event
  router.post('/api/ads/event', rateLimitEvents, (req: Request, res: Response) => {
    if (isVipRequest(req)) {
      return res.json({ ok: true, data: { accepted: 0, ignored: 'vip' }, error: null });
    }

    const rawEvents = Array.isArray(req.body?.events)
      ? req.body.events
      : req.body && typeof req.body === 'object' && req.body.eventType
        ? [req.body]
        : null;

    if (!rawEvents) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'invalid_payload', message: 'events array is required' },
      });
    }

    const batch = rawEvents.slice(0, 25);
    const ipHash = hashClientIp(getTrustedClientIp(req));
    const ts = nowIso();
    const ALLOWED_FORMATS = new Set(['banner', 'sticky', 'popunder', 'interstitial', 'push']);

    let inserted = 0;
    tx(() => {
      const stmt = db.prepare(
        `INSERT INTO ad_events(event_type, format, placement, zone_id, network, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of batch) {
        if (!item || typeof item !== 'object') continue;
        const eventType = item.eventType === 'click' ? 'click' : 'view';
        const format = ALLOWED_FORMATS.has(String(item.format)) ? String(item.format) : 'banner';
        const placement = String(item.placement || 'general').replace(/[^\w:-]/g, '').slice(0, 64) || 'general';
        const zoneId = String(item.zoneId || item.offerId || 'unknown').replace(/[^\w-]/g, '').slice(0, 64) || 'unknown';
        const network = 'Monetag Direct';
        stmt.run(eventType, format, placement, zoneId, network, ipHash, ts);
        inserted += 1;
      }
    });

    return res.json({ ok: true, data: { accepted: inserted }, error: null });
  });

  // 3. Admin Monetag Ads Views/Clicks Report: GET /api/admin/ads/report
  router.get('/api/admin/ads/report', requireAdmin, (req: Request, res: Response) => {
    const daysRaw = Number(req.query.days || 30);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(90, Math.floor(daysRaw))) : 30;
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();

    const totalsRow = get(
      `SELECT
         SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
         SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM ad_events
       WHERE created_at >= ?`,
      sinceIso
    ) as { views?: number; clicks?: number } | undefined;

    const byDay = all(
      `SELECT substr(created_at, 1, 10) AS day,
              SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
              SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM ad_events
       WHERE created_at >= ?
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day DESC
       LIMIT 90`,
      sinceIso
    );

    const byFormat = all(
      `SELECT format,
              SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
              SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM ad_events
       WHERE created_at >= ?
       GROUP BY format
       ORDER BY views DESC, clicks DESC`,
      sinceIso
    );

    const byPlacement = all(
      `SELECT placement,
              SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
              SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM ad_events
       WHERE created_at >= ?
       GROUP BY placement
       ORDER BY clicks DESC, views DESC
       LIMIT 30`,
      sinceIso
    );

    const byZone = all(
      `SELECT zone_id AS zoneId, network,
              SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
              SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM ad_events
       WHERE created_at >= ?
       GROUP BY zone_id, network
       ORDER BY clicks DESC, views DESC`,
      sinceIso
    );

    return res.json({
      ok: true,
      data: {
        days,
        totals: {
          views: Number(totalsRow?.views || 0),
          clicks: Number(totalsRow?.clicks || 0),
        },
        byDay,
        byFormat,
        byPlacement,
        byZone,
        settings: getAdSettings(),
      },
      error: null,
    });
  });

  // 5. Admin Per-Format & Network Toggles: PUT & POST /api/admin/ads/config
  const updateConfigHandler = (req: Request, res: Response) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const updated = saveAdSettings(body);
      return res.json({ ok: true, data: updated, error: null });
    } catch (err: any) {
      if (err instanceof AdPolicyValidationError) {
        return res.status(err.status).json({
          ok: false,
          data: null,
          error: { code: err.code, message: err.message },
        });
      }
      return res.status(500).json({
        ok: false,
        data: null,
        error: { code: 'internal_error', message: err?.message || 'Failed to update ad settings' },
      });
    }
  };
  router.put('/api/admin/ads/config', requireAdmin, updateConfigHandler);
  router.post('/api/admin/ads/config', requireAdmin, updateConfigHandler);

  // =========================================================================
  // 6. REWARDED 1-HOUR VIP FLOW (/api/rewards/*)
  // =========================================================================
  router.get('/api/rewards/status', (req: Request, res: Response) => {
    const deviceId = String(req.query.deviceId || req.get('x-device-id') || '').trim();
    const settings = getAdSettings();
    const rewardsCfg = backendConfig.rewards || {
      durationMinutes: 60,
      minWatchMs: 15000,
      cooldownMinutes: 180,
      maxPerDevicePerDay: 3,
      maxPerIpPerDay: 6,
      maxStartsPerIpPerHour: 20,
      unlocksVipChannels: true,
    };

    const rewardEnabled = Boolean(
      settings.monetag.rewarded.enabled &&
      (settings.testMode || settings.monetag.rewarded.snippet || settings.monetag.rewarded.showFn)
    );

    if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'invalid_device', message: 'Valid device identifier is required.' },
      });
    }

    const activeVip = isVipRequest(req);
    const devHash = hashDevice(deviceId);
    const ipHash = hashClientIp(getTrustedClientIp(req));
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const dayAgoIso = new Date(nowMs - 86_400_000).toISOString();

    const activeGrant = get(
      `SELECT id, network, granted_at, expires_at FROM reward_grants
       WHERE device_hash = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY id DESC LIMIT 1`,
      devHash,
      now
    ) as { id: number; network: string; granted_at: string; expires_at: string } | undefined;

    const latestGrant = get(
      `SELECT expires_at, revoked_at FROM reward_grants
       WHERE device_hash = ? ORDER BY id DESC LIMIT 1`,
      devHash
    ) as { expires_at: string; revoked_at: string | null } | undefined;

    const devDayRow = get(
      `SELECT COUNT(*) AS cnt FROM reward_grants WHERE device_hash = ? AND granted_at >= ?`,
      devHash,
      dayAgoIso
    ) as { cnt: number };
    const ipDayRow = get(
      `SELECT COUNT(*) AS cnt FROM reward_grants WHERE ip_hash = ? AND granted_at >= ?`,
      ipHash,
      dayAgoIso
    ) as { cnt: number };

    const maxPerDevicePerDay = Number(rewardsCfg.maxPerDevicePerDay || 3);
    const maxPerIpPerDay = Number(rewardsCfg.maxPerIpPerDay || 6);
    const devCountToday = Number(devDayRow?.cnt || 0);
    const ipCountToday = Number(ipDayRow?.cnt || 0);
    const remainingToday = Math.max(0, maxPerDevicePerDay - devCountToday);

    let cooldownMinutes = 0;
    let availableAt: string | null = null;
    if (!activeGrant && latestGrant && !latestGrant.revoked_at) {
      const cooldownMs = Math.max(0, Number(rewardsCfg.cooldownMinutes || 180)) * 60_000;
      const availMs = Date.parse(latestGrant.expires_at) + cooldownMs;
      if (cooldownMs > 0 && nowMs < availMs) {
        cooldownMinutes = Math.max(1, Math.ceil((availMs - nowMs) / 60_000));
        availableAt = new Date(availMs).toISOString();
      }
    }

    let eligible = true;
    let reason: string | null = null;
    if (activeVip || activeGrant) {
      eligible = false;
      reason = 'vip_active';
    } else if (!rewardEnabled) {
      eligible = false;
      reason = 'reward_disabled';
    } else if (latestGrant?.revoked_at) {
      eligible = false;
      reason = 'device_revoked';
    } else if (cooldownMinutes > 0) {
      eligible = false;
      reason = 'reward_cooldown';
    } else if (remainingToday <= 0) {
      eligible = false;
      reason = 'device_daily_cap';
    } else if (ipCountToday >= maxPerIpPerDay) {
      eligible = false;
      reason = 'ip_daily_cap';
    }

    return res.json({
      ok: true,
      data: {
        eligible,
        reason,
        activeVip,
        activeGrant: Boolean(activeGrant),
        activeExpiresAt: activeGrant?.expires_at || null,
        cooldownMinutes,
        availableAt,
        remainingToday,
        maxPerDevicePerDay,
        durationMinutes: Number(rewardsCfg.durationMinutes || 60),
        minWatchMs: Math.max(1000, Number(rewardsCfg.minWatchMs ?? 15000)),
        unlocksVipChannels: Boolean(rewardsCfg.unlocksVipChannels ?? true),
        rewardEnabled,
        testMode: settings.testMode,
      },
      error: null,
    });
  });

  router.post('/api/rewards/start', (req: Request, res: Response) => {
    const deviceId = String(req.body?.deviceId || '').trim();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'invalid_device', message: 'Valid device identifier is required.' },
      });
    }

    const requestedNetwork = String(req.body?.network || 'monetag').trim().toLowerCase();
    if (requestedNetwork !== 'monetag') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'unsupported_network', message: 'Reward network must be monetag.' },
      });
    }

    const settings = getAdSettings();
    const rewardsCfg = backendConfig.rewards || {
      durationMinutes: 60,
      minWatchMs: 15000,
      cooldownMinutes: 180,
      maxPerDevicePerDay: 3,
      maxPerIpPerDay: 6,
      maxStartsPerIpPerHour: 20,
      requirePostback: false,
      unlocksVipChannels: true,
    };

    if (!settings.testMode && requestedNetwork === 'monetag') {
      const hasConfig = Boolean(
        settings.monetag.rewarded.enabled &&
        (settings.monetag.rewarded.snippet || settings.monetag.rewarded.showFn)
      );
      if (!hasConfig) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            code: 'network_rewarded_disabled',
            message: 'Rewarded video format is not enabled on this network yet.',
          },
        });
      }
    }

    // Reject if caller already has an active paid VIP or active reward pass
    if (isVipRequest(req)) {
      return res.status(409).json({
        ok: false,
        data: null,
        error: { code: 'already_vip', message: 'Your VIP pass is already active.' },
      });
    }

    const devHash = hashDevice(deviceId);
    const ipHash = hashClientIp(getTrustedClientIp(req));
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    const activeGrant = get(
      `SELECT id, expires_at FROM reward_grants
       WHERE device_hash = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY id DESC LIMIT 1`,
      devHash,
      now
    ) as { id: number; expires_at: string } | undefined;

    if (activeGrant) {
      return res.status(409).json({
        ok: false,
        data: null,
        error: {
          code: 'already_active_reward',
          message: 'You already have an active 1-hour free VIP pass.',
          expiresAt: activeGrant.expires_at,
        },
      });
    }

    // Cooldown after expiry (default 180 min)
    const latestGrant = get(
      `SELECT expires_at, revoked_at FROM reward_grants
       WHERE device_hash = ? ORDER BY id DESC LIMIT 1`,
      devHash
    ) as { expires_at: string; revoked_at: string | null } | undefined;

    if (latestGrant) {
      if (latestGrant.revoked_at) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { code: 'device_revoked', message: 'Reward access for this device has been revoked due to policy limits.' },
        });
      }
      const cooldownMs = Math.max(0, Number(rewardsCfg.cooldownMinutes || 180)) * 60_000;
      const availableAtMs = Date.parse(latestGrant.expires_at) + cooldownMs;
      if (cooldownMs > 0 && nowMs < availableAtMs) {
        const waitMinutes = Math.max(1, Math.ceil((availableAtMs - nowMs) / 60_000));
        return res.status(429).json({
          ok: false,
          data: null,
          error: {
            code: 'reward_cooldown',
            message: `Cooldown active. You can watch another rewarded ad in ${waitMinutes} minute(s).`,
            retryAfterMinutes: waitMinutes,
            availableAt: new Date(availableAtMs).toISOString(),
          },
        });
      }
    }

    const dayAgoIso = new Date(nowMs - 86_400_000).toISOString();
    const hourAgoIso = new Date(nowMs - 3_600_000).toISOString();

    const devDayRow = get(
      `SELECT COUNT(*) AS cnt FROM reward_grants WHERE device_hash = ? AND granted_at >= ?`,
      devHash,
      dayAgoIso
    ) as { cnt: number };
    if ((devDayRow?.cnt || 0) >= (rewardsCfg.maxPerDevicePerDay || 3)) {
      return res.status(429).json({
        ok: false,
        data: null,
        error: {
          code: 'device_daily_cap',
          message: 'Daily reward limit reached for this device. Try again tomorrow or get a VIP Pass.',
          retryAfterMinutes: 60,
        },
      });
    }

    const ipDayRow = get(
      `SELECT COUNT(*) AS cnt FROM reward_grants WHERE ip_hash = ? AND granted_at >= ?`,
      ipHash,
      dayAgoIso
    ) as { cnt: number };
    if ((ipDayRow?.cnt || 0) >= (rewardsCfg.maxPerIpPerDay || 6)) {
      return res.status(429).json({
        ok: false,
        data: null,
        error: {
          code: 'ip_daily_cap',
          message: 'Daily reward limit reached for this network. Please wait before trying again.',
          retryAfterMinutes: 60,
        },
      });
    }

    const ipHourStartsRow = get(
      `SELECT COUNT(*) AS cnt FROM reward_sessions WHERE ip_hash = ? AND created_at >= ?`,
      ipHash,
      hourAgoIso
    ) as { cnt: number };
    if ((ipHourStartsRow?.cnt || 0) >= (rewardsCfg.maxStartsPerIpPerHour || 20)) {
      return res.status(429).json({
        ok: false,
        data: null,
        error: {
          code: 'ip_hourly_start_cap',
          message: 'Too many reward attempts from this network. Please try again later.',
          retryAfterMinutes: 30,
        },
      });
    }

    const nonce = crypto.randomBytes(24).toString('hex');
    const minWatchMs = Math.max(1000, Number(rewardsCfg.minWatchMs ?? 15000));

    run(
      `INSERT INTO reward_sessions(nonce, device_hash, ip_hash, network, created_at, status)
       VALUES (?, ?, ?, ?, ?, 'started')`,
      nonce,
      devHash,
      ipHash,
      requestedNetwork,
      now
    );

    return res.json({
      ok: true,
      data: {
        nonce,
        network: requestedNetwork,
        minWatchMs,
        testMode: settings.testMode,
        expiresInSec: 600,
      },
      error: null,
    });
  });

  router.post('/api/rewards/claim', (req: Request, res: Response) => {
    const nonce = String(req.body?.nonce || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();

    if (!/^[a-f0-9]{16,128}$/i.test(nonce)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'invalid_nonce', message: 'Invalid reward session nonce.' },
      });
    }
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'invalid_device', message: 'Valid device identifier is required.' },
      });
    }

    if (isVipRequest(req)) {
      return res.status(409).json({
        ok: false,
        data: null,
        error: { code: 'already_vip', message: 'Active VIP pass cannot stack another reward.' },
      });
    }

    const settings = getAdSettings();
    const rewardsCfg = backendConfig.rewards || {
      durationMinutes: 60,
      minWatchMs: 15000,
      cooldownMinutes: 180,
      maxPerDevicePerDay: 3,
      maxPerIpPerDay: 6,
      requirePostback: false,
    };

    const devHash = hashDevice(deviceId);
    const ipHash = hashClientIp(getTrustedClientIp(req));
    const minWatchMs = Math.max(1000, Number(rewardsCfg.minWatchMs ?? 15000));
    const durationMinutes = Math.max(1, Number(rewardsCfg.durationMinutes ?? 60));

    try {
      const claimResult = tx(() => {
        const session = get('SELECT * FROM reward_sessions WHERE nonce = ?', nonce) as any;
        if (!session) {
          throw new AdPolicyValidationError(404, 'session_not_found', 'Reward session not found.');
        }
        if (session.device_hash !== devHash) {
          throw new AdPolicyValidationError(403, 'device_mismatch', 'Device mismatch for reward session.');
        }
        if (session.status === 'claimed') {
          throw new AdPolicyValidationError(409, 'nonce_already_used', 'This reward session has already been claimed.');
        }
        if (session.status === 'expired') {
          throw new AdPolicyValidationError(410, 'session_expired', 'Reward session has expired.');
        }

        const nowMs = Date.now();
        const createdMs = Date.parse(session.created_at);
        if (Number.isNaN(createdMs) || nowMs - createdMs > 10 * 60_000) {
          run("UPDATE reward_sessions SET status='expired' WHERE id=?", session.id);
          throw new AdPolicyValidationError(410, 'session_expired', 'Reward session expired (older than 10 minutes).');
        }

        const elapsedMs = nowMs - createdMs;
        if (elapsedMs < minWatchMs) {
          const remainingMs = Math.max(1, minWatchMs - elapsedMs);
          throw new AdPolicyValidationError(
            400,
            'too_early',
            `Ad watch did not reach minimum duration (${Math.ceil(remainingMs / 1000)}s remaining).`
          );
        }

        if (rewardsCfg.requirePostback && !settings.testMode && session.status !== 'verified') {
          throw new AdPolicyValidationError(403, 'postback_required', 'Awaiting network completion verification.');
        }

        const nowStr = new Date(nowMs).toISOString();
        const activeGrant = get(
          `SELECT id FROM reward_grants WHERE device_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1`,
          devHash,
          nowStr
        ) as { id: number } | undefined;
        if (activeGrant) {
          throw new AdPolicyValidationError(409, 'already_active_reward', 'You already have an active 1-hour free VIP pass.');
        }

        const dayAgoIso = new Date(nowMs - 86_400_000).toISOString();
        const devDayRow = get(
          `SELECT COUNT(*) AS cnt FROM reward_grants WHERE device_hash = ? AND granted_at >= ?`,
          devHash,
          dayAgoIso
        ) as { cnt: number };
        if ((devDayRow?.cnt || 0) >= (rewardsCfg.maxPerDevicePerDay || 3)) {
          throw new AdPolicyValidationError(429, 'device_daily_cap', 'Daily reward limit reached for this device.');
        }

        const ipDayRow = get(
          `SELECT COUNT(*) AS cnt FROM reward_grants WHERE ip_hash = ? AND granted_at >= ?`,
          ipHash,
          dayAgoIso
        ) as { cnt: number };
        if ((ipDayRow?.cnt || 0) >= (rewardsCfg.maxPerIpPerDay || 6)) {
          throw new AdPolicyValidationError(429, 'ip_daily_cap', 'Daily reward limit reached for this network.');
        }

        const expiresMs = nowMs + durationMinutes * 60_000;
        const expiresAt = new Date(expiresMs).toISOString();

        run("UPDATE reward_sessions SET status='claimed', claimed_at=? WHERE id=?", nowStr, session.id);
        const ins = run(
          `INSERT INTO reward_grants(device_hash, ip_hash, network, granted_at, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
          devHash,
          ipHash,
          session.network,
          nowStr,
          expiresAt
        );

        const gid = Number(ins.lastInsertRowid);
        const expSec = Math.floor(expiresMs / 1000);
        const token = signToken({
          v: 3,
          kind: 'reward',
          gid,
          dev: devHash,
          plan: 'reward1h',
          network: session.network,
          exp: expSec,
        });

        return {
          token,
          plan: 'reward1h',
          network: session.network,
          grantedAt: nowStr,
          expiresAt,
          durationMinutes,
        };
      });

      return res.json({ ok: true, data: claimResult, error: null });
    } catch (err: any) {
      if (err instanceof AdPolicyValidationError) {
        return res.status(err.status).json({
          ok: false,
          data: null,
          error: { code: err.code, message: err.message },
        });
      }
      return res.status(500).json({
        ok: false,
        data: null,
        error: { code: 'claim_failed', message: err?.message || 'Failed to claim reward pass.' },
      });
    }
  });

  // Optional Server-to-Server Postback (never invents undocumented ad network schemas)
  const postbackHandler = (req: Request, res: Response) => {
    const network = String(req.body?.network || req.query.network || 'monetag').trim().toLowerCase();
    if (network !== 'monetag') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'unsupported_network', message: 'Postback network must be monetag.' },
      });
    }
    const secret = String(backendConfig.rewards?.monetagPostbackSecret || '');

    if (!secret) {
      return res.status(503).json({
        ok: false,
        data: null,
        error: { code: 'postback_unconfigured', message: 'Postback secret is not configured on this server.' },
      });
    }

    const suppliedToken = String(req.get('x-postback-secret') || req.body?.secret || req.query.secret || '').trim();
    const suppliedSig = String(req.get('x-postback-signature') || req.query.sig || '').trim();
    const nonce = String(req.body?.nonce || req.query.nonce || '').trim();

    let authorized = safeTimingEqual(suppliedToken, secret);
    if (!authorized && suppliedSig && nonce) {
      const expectedHmac = crypto.createHmac('sha256', secret).update(nonce).digest('hex');
      authorized = safeTimingEqual(suppliedSig, expectedHmac);
    }
    if (!authorized) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { code: 'unauthorized_postback', message: 'Invalid postback signature or token.' },
      });
    }

    if (!/^[a-f0-9]{16,128}$/i.test(nonce)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'invalid_nonce', message: 'Valid session nonce is required.' },
      });
    }

    const session = get('SELECT id, status FROM reward_sessions WHERE nonce = ?', nonce) as { id: number; status: string } | undefined;
    if (!session) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { code: 'session_not_found', message: 'Reward session not found.' },
      });
    }

    if (session.status === 'started') {
      run("UPDATE reward_sessions SET status='verified', verified_at=? WHERE id=? AND status='started'", nowIso(), session.id);
    }
    return res.json({ ok: true, data: { nonce, verified: true }, error: null });
  };
  router.post('/api/rewards/postback', postbackHandler);
  router.get('/api/rewards/postback', postbackHandler);

  // =========================================================================
  // 7. ADMIN REWARD REPORTING & CONTROLS (/admin/rewards/* + /api/admin/rewards/*)
  // =========================================================================
  const rewardsReportHandler = (req: Request, res: Response) => {
    const daysRaw = Number(req.query.days || 30);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(90, Math.floor(daysRaw))) : 30;
    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
    const now = nowIso();

    const startsRow = get(
      `SELECT COUNT(*) AS cnt FROM reward_sessions WHERE created_at >= ?`,
      sinceIso
    ) as { cnt: number };
    const claimsRow = get(
      `SELECT COUNT(*) AS cnt FROM reward_grants WHERE granted_at >= ?`,
      sinceIso
    ) as { cnt: number };
    const activeRow = get(
      `SELECT COUNT(*) AS cnt FROM reward_grants WHERE revoked_at IS NULL AND expires_at > ?`,
      now
    ) as { cnt: number };

    const grantsPerDay = all(
      `SELECT substr(granted_at, 1, 10) AS day, network, COUNT(*) AS grants
       FROM reward_grants WHERE granted_at >= ?
       GROUP BY substr(granted_at, 1, 10), network
       ORDER BY day DESC LIMIT 90`,
      sinceIso
    );

    const perNetwork = all(
      `SELECT s.network AS network,
              COUNT(*) AS starts,
              SUM(CASE WHEN s.status = 'claimed' THEN 1 ELSE 0 END) AS claims
       FROM reward_sessions s
       WHERE s.created_at >= ?
       GROUP BY s.network`,
      sinceIso
    );

    const suspiciousDevices = all(
      `SELECT device_hash AS deviceHash,
              COUNT(*) AS starts,
              SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) AS claims,
              SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) AS grants
       FROM reward_sessions
       WHERE created_at >= ?
       GROUP BY device_hash
       HAVING starts >= 5 OR claims >= 3
       ORDER BY starts DESC LIMIT 25`,
      sinceIso
    );

    const suspiciousIps = all(
      `SELECT ip_hash AS ipHash,
              COUNT(*) AS starts,
              SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) AS claims
       FROM reward_sessions
       WHERE created_at >= ?
       GROUP BY ip_hash
       HAVING starts >= 8 OR claims >= 4
       ORDER BY starts DESC LIMIT 25`,
      sinceIso
    );

    const starts = Number(startsRow?.cnt || 0);
    const claims = Number(claimsRow?.cnt || 0);
    const claimRatePct = starts > 0 ? Number(((claims / starts) * 100).toFixed(1)) : 0;
    const activeGrants = Number(activeRow?.cnt || 0);

    return res.json({
      ok: true,
      data: {
        days,
        starts,
        claims,
        claimRatePct,
        activeGrants,
        totals: {
          starts,
          claims,
          claimRatePercent: claimRatePct,
          activeGrantsNow: activeGrants,
        },
        grantsPerDay,
        perNetwork,
        suspiciousDevices,
        suspiciousIps,
        settings: getAdSettings(),
      },
      error: null,
    });
  };
  router.get('/admin/rewards/report', requireAdmin, rewardsReportHandler);
  router.get('/api/admin/rewards/report', requireAdmin, rewardsReportHandler);

  const rewardsRevokeHandler = (req: Request, res: Response) => {
    const deviceHash = String(req.body?.deviceHash || '').trim();
    if (!deviceHash || deviceHash.length < 8) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'invalid_device_hash', message: 'deviceHash is required.' },
      });
    }
    const result = run(
      `UPDATE reward_grants SET revoked_at = ? WHERE device_hash = ? AND revoked_at IS NULL`,
      nowIso(),
      deviceHash
    );
    return res.json({
      ok: true,
      data: { deviceHash, revokedGrants: Number(result.changes || 0) },
      error: null,
    });
  };
  router.post('/admin/rewards/revoke', requireAdmin, rewardsRevokeHandler);
  router.post('/api/admin/rewards/revoke', requireAdmin, rewardsRevokeHandler);

  const rewardsToggleHandler = (req: Request, res: Response) => {
    const network = String(req.body?.network || '').trim().toLowerCase();
    const enabled = req.body?.enabled;
    const showRegularAds = req.body?.showRegularAds;
    const hasShowFn = req.body && typeof req.body === 'object' && 'showFn' in req.body;

    if (network !== 'monetag') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { code: 'invalid_network', message: 'network must be monetag.' },
      });
    }

    try {
      const current = getAdSettings();
      const partial: Partial<AdSettings> = {
        monetag: {
          showRegularAds: typeof showRegularAds === 'boolean' ? showRegularAds : current.monetag.showRegularAds,
          rewarded: {
            ...current.monetag.rewarded,
            enabled: typeof enabled === 'boolean' ? enabled : current.monetag.rewarded.enabled,
            ...(hasShowFn ? { showFn: req.body.showFn } : {}),
          },
        },
      };
      const updated = saveAdSettings(partial);
      return res.json({ ok: true, data: updated, error: null });
    } catch (err: any) {
      if (err instanceof AdPolicyValidationError) {
        return res.status(err.status).json({
          ok: false,
          data: null,
          error: { code: err.code, message: err.message },
        });
      }
      return res.status(500).json({
        ok: false,
        data: null,
        error: { code: 'toggle_failed', message: err?.message || 'Failed to toggle network settings.' },
      });
    }
  };
  router.post('/admin/rewards/toggle', requireAdmin, rewardsToggleHandler);
  router.post('/api/admin/rewards/toggle', requireAdmin, rewardsToggleHandler);

  return router;
}
