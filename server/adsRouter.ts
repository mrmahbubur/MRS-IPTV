import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import { db, get, all, run, nowIso, tx } from './mrs-iptv-backend/src/db.js';
import { getEntitlementStatus } from './mrs-iptv-backend/src/redeem.js';
import { config as backendConfig } from './mrs-iptv-backend/src/config.js';
import { requireAdmin } from '../src/middleware/auth.js';
import { getTrustedClientIp } from './clientIp.js';

export interface OfferEntry {
  offerId: string;
  url: string;
  network: 'Monetag Direct' | 'Mitgo Affiliate';
  format: 'affiliate' | 'banner' | 'interstitial';
  label: string;
}

/**
 * Exact verified owner Monetag zones & Admitad/Mitgo affiliate URLs (preserved verbatim).
 * Strict allowlist prevents any open-redirect abuse on GET /go/:offerId.
 */
export const VERIFIED_OFFERS: OfferEntry[] = [
  {
    offerId: 'pm1aev55clcb5002cfdd219aa26f6f',
    url: 'https://rzekl.com/g/pm1aev55clcb5002cfdd219aa26f6f/',
    network: 'Mitgo Affiliate',
    format: 'affiliate',
    label: 'Featured Partner Marketplace Offer',
  },
  {
    offerId: '1e8d114494cb5002cfdd16525dc3e8',
    url: 'https://rzekl.com/g/1e8d114494cb5002cfdd16525dc3e8/',
    network: 'Mitgo Affiliate',
    format: 'affiliate',
    label: 'Verified Sponsor Spotlight Promotion',
  },
  {
    offerId: '11226634',
    url: 'https://uplcm.com/4/11226634',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Ultra-HD Sports & Match Priority Line',
  },
  {
    offerId: '11683565',
    url: 'https://uplcm.com/4/11683565',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Live Sports Score & Goal Alert Feed',
  },
  {
    offerId: '11242745',
    url: 'https://uplcm.com/4/11242745',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Sports Highlight & Match Replay Hub',
  },
  {
    offerId: '11242069',
    url: 'https://uplcm.com/4/11242069',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'VIP Sports Fans Community Lounge',
  },
  {
    offerId: '11242067',
    url: 'https://uplcm.com/4/11242067',
    network: 'Monetag Direct',
    format: 'interstitial',
    label: '24/7 Exclusive HD Cinema & Live Broadcasts',
  },
  {
    offerId: '11242742',
    url: 'https://uplcm.com/4/11242742',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Global Sports Discussion & Fixture Hub',
  },
  {
    offerId: '11230440',
    url: 'https://uplcm.com/4/11230440',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'High-Speed Global IPTV Mirror Support',
  },
  {
    offerId: '11683560',
    url: 'https://uplcm.com/4/11683560',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'Prime Broadcast CDN & Zero-Lag Relay',
  },
  {
    offerId: '9912130',
    url: 'https://uplcm.com/4/9912130',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'All-Day Cinema, Reels & Sports Lounge',
  },
  {
    offerId: '11242744',
    url: 'https://uplcm.com/4/11242744',
    network: 'Monetag Direct',
    format: 'banner',
    label: 'International Match Stream Partner Network',
  },
];

const DEFAULT_AD_SETTINGS = {
  formats: {
    banner: true,
    sticky: true,
    popunder: true,
    interstitial: true,
    push: false,
    affiliate: true,
  },
  hideOffersForVip: true,
  testMode: false,
  customOffers: {} as Record<string, { url: string; label: string; network?: string }>,
};

export type AdSettings = typeof DEFAULT_AD_SETTINGS;

export function getAdSettings(): AdSettings {
  try {
    const row = get('SELECT value_json FROM ad_settings WHERE key = ?', 'config') as { value_json?: string } | undefined;
    if (row?.value_json) {
      const parsed = JSON.parse(row.value_json);
      return {
        formats: { ...DEFAULT_AD_SETTINGS.formats, ...(parsed.formats || {}) },
        hideOffersForVip: typeof parsed.hideOffersForVip === 'boolean' ? parsed.hideOffersForVip : true,
        testMode: typeof parsed.testMode === 'boolean' ? parsed.testMode : false,
        customOffers: parsed.customOffers && typeof parsed.customOffers === 'object' ? parsed.customOffers : {},
      };
    }
  } catch {}
  return {
    formats: { ...DEFAULT_AD_SETTINGS.formats },
    hideOffersForVip: true,
    testMode: false,
    customOffers: {},
  };
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
      affiliate: typeof partial.formats?.affiliate === 'boolean' ? partial.formats.affiliate : current.formats.affiliate,
    },
    hideOffersForVip: typeof partial.hideOffersForVip === 'boolean' ? partial.hideOffersForVip : current.hideOffersForVip,
    testMode: typeof partial.testMode === 'boolean' ? partial.testMode : current.testMode,
    customOffers: current.customOffers,
  };

  if (partial.customOffers && typeof partial.customOffers === 'object') {
    const cleanCustom: Record<string, { url: string; label: string; network?: string }> = { ...current.customOffers };
    for (const [id, entry] of Object.entries(partial.customOffers)) {
      const safeId = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      if (!safeId) continue;
      if (entry === null) {
        delete cleanCustom[safeId];
        continue;
      }
      if (entry && typeof entry.url === 'string' && /^https:\/\/[a-z0-9.-]+/i.test(entry.url.trim())) {
        cleanCustom[safeId] = {
          url: entry.url.trim(),
          label: String(entry.label || safeId).slice(0, 120),
          network: String(entry.network || 'Mitgo Affiliate').slice(0, 40),
        };
      }
    }
    next.customOffers = cleanCustom;
  }

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

function resolveOfferById(rawId: string): OfferEntry | null {
  const cleanId = String(rawId || '').trim().replace(/^uplcm-|^rzekl-/, '');
  const exact = VERIFIED_OFFERS.find((o) => o.offerId === rawId || o.offerId === cleanId);
  if (exact) return exact;

  const settings = getAdSettings();
  const custom = settings.customOffers?.[rawId] || settings.customOffers?.[cleanId];
  if (custom && /^https:\/\/[a-z0-9.-]+/i.test(custom.url)) {
    return {
      offerId: cleanId || rawId,
      url: custom.url,
      network: custom.network === 'Monetag Direct' ? 'Monetag Direct' : 'Mitgo Affiliate',
      format: 'affiliate',
      label: custom.label,
    };
  }
  return null;
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

  // 1. Safe Affiliate & Sponsor Redirect: GET /go/:offerId
  // Strictly validates offerId against allowlist (zero open redirects)
  router.get('/go/:offerId', (req: Request, res: Response) => {
    const offer = resolveOfferById(String(req.params.offerId || ''));
    if (!offer) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { code: 'offer_not_found', message: 'Affiliate or sponsor offer not found' },
      });
    }

    const rawSubId = String(req.query.subid || req.query.sub_id || '').trim();
    const subid = /^[A-Za-z0-9_-]{1,64}$/.test(rawSubId) ? rawSubId : null;

    if (!isVipRequest(req)) {
      try {
        const ipHash = hashClientIp(getTrustedClientIp(req));
        run(
          `INSERT INTO ad_events(event_type, format, placement, offer_id, network, subid, ip_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          'click',
          offer.format,
          String(req.query.placement || 'affiliate-go').slice(0, 64),
          offer.offerId,
          offer.network,
          subid,
          ipHash,
          nowIso()
        );
      } catch (e) {
        console.warn('[AdsRouter] /go click record warning:', (e as any)?.message || e);
      }
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
    return res.redirect(302, offer.url);
  });

  // 2. Public Ad Gate Runtime Config: GET /api/ads/config
  router.get('/api/ads/config', (_req: Request, res: Response) => {
    const settings = getAdSettings();
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
    return res.json({
      ok: true,
      data: {
        formats: settings.formats,
        hideOffersForVip: settings.hideOffersForVip,
        testMode: settings.testMode,
        offers: VERIFIED_OFFERS.map((o) => ({
          offerId: o.offerId,
          network: o.network,
          format: o.format,
          label: o.label,
          goPath: `/go/${o.offerId}`,
        })),
      },
      error: null,
    });
  });

  // 3. Batched Free-User Ad Event Collector: POST /api/ads/event
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
    const ALLOWED_FORMATS = new Set(['banner', 'sticky', 'popunder', 'interstitial', 'push', 'affiliate']);

    let inserted = 0;
    tx(() => {
      const stmt = db.prepare(
        `INSERT INTO ad_events(event_type, format, placement, offer_id, network, subid, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of batch) {
        if (!item || typeof item !== 'object') continue;
        const eventType = item.eventType === 'click' ? 'click' : 'view';
        const format = ALLOWED_FORMATS.has(String(item.format)) ? String(item.format) : 'banner';
        const placement = String(item.placement || 'general').replace(/[^\w:-]/g, '').slice(0, 64) || 'general';
        const offerId = String(item.offerId || item.zoneId || 'unknown').replace(/[^\w-]/g, '').slice(0, 64) || 'unknown';
        const network = String(item.network || 'Monetag Direct').slice(0, 40);
        const subid = /^[A-Za-z0-9_-]{1,64}$/.test(String(item.subid || '')) ? String(item.subid) : null;
        stmt.run(eventType, format, placement, offerId, network, subid, ipHash, ts);
        inserted += 1;
      }
    });

    return res.json({ ok: true, data: { accepted: inserted }, error: null });
  });

  // 4. Admin Ads Views/Clicks Report: GET /api/admin/ads/report (views & clicks only)
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

    const byOffer = all(
      `SELECT offer_id AS offerId, network,
              SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
              SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM ad_events
       WHERE created_at >= ?
       GROUP BY offer_id, network
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
        byOffer,
        settings: getAdSettings(),
      },
      error: null,
    });
  });

  // 5. Admin Per-Format Toggles & Settings: PUT & POST /api/admin/ads/config
  const updateConfigHandler = (req: Request, res: Response) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const updated = saveAdSettings(body);
    return res.json({ ok: true, data: updated, error: null });
  };
  router.put('/api/admin/ads/config', requireAdmin, updateConfigHandler);
  router.post('/api/admin/ads/config', requireAdmin, updateConfigHandler);

  return router;
}
