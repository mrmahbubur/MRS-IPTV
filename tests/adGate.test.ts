import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
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

const { db, run, get, nowIso } = await import('../server/mrs-iptv-backend/src/db.js');
const { redeem } = await import('../server/mrs-iptv-backend/src/redeem.js');
const { createAdsRouter, VERIFIED_OFFERS } = await import('../server/adsRouter.js');
const paymentRouterModule = await import('../server/paymentRouter.js');
const createPaymentRouter = paymentRouterModule.default || paymentRouterModule.createPaymentRouter;

const adGateSource = fs.readFileSync(path.join(process.cwd(), 'public', 'ad-gate.js'), 'utf8');

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

  const sandbox: any = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    AbortController,
    encodeURIComponent,
    setTimeout: (_fn: any, ms: number) => {
      scheduledDelays.push(Number(ms || 0));
      return timerSeq++;
    },
    clearTimeout: () => {},
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
});

test('6. GET /go/:offerId redirects verified Mitgo/Monetag offers and blocks open redirects', async () => {
  const mitgoOffer = VERIFIED_OFFERS.find((o) => o.offerId === 'pm1aev55clcb5002cfdd219aa26f6f');
  assert.ok(mitgoOffer);

  const okRes = await fetch(`${baseUrl}/go/pm1aev55clcb5002cfdd219aa26f6f?subid=hero_unit_1`, {
    redirect: 'manual',
  });
  assert.equal(okRes.status, 302);
  assert.equal(okRes.headers.get('location'), 'https://rzekl.com/g/pm1aev55clcb5002cfdd219aa26f6f/');

  // Open redirect attempt must fail closed with 404
  const badRes = await fetch(`${baseUrl}/go/https%3A%2F%2Fevil.example.com`, { redirect: 'manual' });
  assert.equal(badRes.status, 404);

  const logged = get(
    `SELECT event_type, offer_id, subid FROM ad_events WHERE offer_id = ? ORDER BY id DESC LIMIT 1`,
    'pm1aev55clcb5002cfdd219aa26f6f'
  ) as any;
  assert.equal(logged?.event_type, 'click');
  assert.equal(logged?.subid, 'hero_unit_1');
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

test('8. Admin ads report & config routes enforce x-admin-token and persist toggles', async () => {
  const unauthRes = await fetch(`${baseUrl}/api/admin/ads/report`);
  assert.equal(unauthRes.status, 401);

  const putRes = await fetch(`${baseUrl}/api/admin/ads/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': 'test-admin-secret-123',
    },
    body: JSON.stringify({
      formats: { popunder: false, banner: true },
      testMode: true,
      hideOffersForVip: true,
    }),
  });
  assert.equal(putRes.status, 200);
  const putJson = await putRes.json() as any;
  assert.equal(putJson.ok, true);
  assert.equal(putJson.data.formats.popunder, false);
  assert.equal(putJson.data.testMode, true);

  const reportRes = await fetch(`${baseUrl}/api/admin/ads/report?days=30`, {
    headers: { 'x-admin-token': 'test-admin-secret-123' },
  });
  assert.equal(reportRes.status, 200);
  const reportJson = await reportRes.json() as any;
  assert.equal(reportJson.ok, true);
  assert.ok(reportJson.data.totals.views >= 1);
  assert.ok(reportJson.data.totals.clicks >= 1);
});

test('9. GET /api/status returns { ok, data: { active, plan, expiresAt } } for VIP and { active: false } for free/invalid', async () => {
  const vipRes = await fetch(`${baseUrl}/api/status?deviceId=${encodeURIComponent(TEST_DEVICE)}`, {
    headers: { Authorization: `Bearer ${activeVipToken}` },
  });
  assert.equal(vipRes.status, 200);
  const vipJson = await vipRes.json() as any;
  assert.equal(vipJson.ok, true);
  assert.equal(vipJson.data.active, true);
  assert.equal(vipJson.data.plan, '1m');
  assert.ok(typeof vipJson.data.expiresAt === 'string' && vipJson.data.expiresAt.length > 0);

  const anonRes = await fetch(`${baseUrl}/api/status`);
  assert.equal(anonRes.status, 401);
  const anonJson = await anonRes.json() as any;
  assert.equal(anonJson.ok, false);
  assert.equal(anonJson.data.active, false);
});
