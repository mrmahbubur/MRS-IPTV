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
const paymentRouterModule = await import('../server/paymentRouter.js');
const createPaymentRouter = paymentRouterModule.default || paymentRouterModule.createPaymentRouter;

const adGateSource = fs.readFileSync(path.join(process.cwd(), 'public', 'ad-gate.js'), 'utf8');
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

test('5. enterVipMode() purges ad DOM, clears mrs_ads_* keys, unregisters ad SWs, unsubscribes Web Push', async () => {
  const futureExp = new Date(Date.now() + 86400_000 * 30).toISOString();
  const env = createDomSandbox({
    initialStorage: {
      mrs_ads_pop_timestamps: '[12345]',
      mrs_ads_consent_v1: '{"accepted":true}',
      mrs_ad_pop_last: '12345',
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



