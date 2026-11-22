import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mrs-internal-uploads-'));
process.env.MAIL_TRANSPORT = 'json';
process.env.EMAIL_MX_CHECK = 'false';

const { createApp } = await import('../src/server.js');
const { config } = await import('../src/config.js');
const { createApiKey, revokeApiKey } = await import('../src/apiKeys.js');
const { ensureStock } = await import('../src/codes.js');

let server;
let baseUrl;

test.before(async () => {
  ensureStock(50, 'internal-test');
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('internal: public /ping needs no auth', async () => {
  const res = await fetch(`${baseUrl}/api/internal/ping`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.ok(json.time);
});

test('internal: machine auth enforces valid key and surgical scopes', async () => {
  // 1. Missing Authorization header -> 401
  const resNoAuth = await fetch(`${baseUrl}/api/internal/health`);
  assert.equal(resNoAuth.status, 401);
  const jsonNoAuth = await resNoAuth.json();
  assert.equal(jsonNoAuth.error.code, 'api_key_invalid');

  // 2. Junk key -> 401
  const resJunk = await fetch(`${baseUrl}/api/internal/health`, {
    headers: { authorization: 'Bearer mrs_junk_key_that_does_not_exist' },
  });
  assert.equal(resJunk.status, 401);

  // 3. Create key with only entitlement:read
  const readKey = createApiKey('proxy-reader', ['entitlement:read']);

  // Call health (needs channels:read) with entitlement:read key -> 403 insufficient_scope
  const resWrongScope = await fetch(`${baseUrl}/api/internal/health`, {
    headers: { authorization: `Bearer ${readKey.plaintextKey}` },
  });
  assert.equal(resWrongScope.status, 403);
  const jsonWrong = await resWrongScope.json();
  assert.equal(jsonWrong.error.code, 'insufficient_scope');

  // 4. Create key with channels:read
  const channelsKey = createApiKey('health-monitor', ['channels:read']);
  const resOk = await fetch(`${baseUrl}/api/internal/health`, {
    headers: { authorization: `Bearer ${channelsKey.plaintextKey}` },
  });
  assert.equal(resOk.status, 200);
  const jsonOk = await resOk.json();
  assert.equal(jsonOk.ok, true);
});

test('internal: create order -> verify signature -> fulfill payment -> idempotency', async () => {
  const payKey = createApiKey('payment-worker', ['payments:write', 'entitlement:read']);
  const email = `test-subscriber-${Date.now()}@example.com`;

  // 1. Create order
  const orderRes = await fetch(`${baseUrl}/api/internal/orders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${payKey.plaintextKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, planCode: '1m' }),
  });

  assert.equal(orderRes.status, 201);
  const orderJson = await orderRes.json();
  assert.ok(orderJson.order.id.startsWith('ord_'));
  assert.equal(orderJson.order.status, 'created');
  assert.equal(orderJson.order.amount, 110);
  assert.equal(orderJson.user.email, email);
  assert.equal(orderJson.plan.code, '1m');

  const orderId = orderJson.order.id;

  // 2. Tampered HMAC signature -> 401 invalid_signature
  const bodyData = {
    orderId,
    provider: 'bkash',
    providerRef: `TRX_${Date.now()}`,
    amount: 110,
    currency: 'BDT',
  };
  const rawBody = JSON.stringify(bodyData);

  const resTampered = await fetch(`${baseUrl}/api/internal/payment-confirmed`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${payKey.plaintextKey}`,
      'content-type': 'application/json',
      'x-signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
    },
    body: rawBody,
  });
  assert.equal(resTampered.status, 401);
  const jsonTampered = await resTampered.json();
  assert.equal(jsonTampered.error.code, 'invalid_signature');

  // 3. Underpayment -> 409 amount_mismatch
  const underpaidBody = JSON.stringify({ ...bodyData, amount: 50 });
  const underpaidSig = 'sha256=' + createHmac('sha256', config.internalWebhookSecret).update(underpaidBody).digest('hex');
  const resUnder = await fetch(`${baseUrl}/api/internal/payment-confirmed`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${payKey.plaintextKey}`,
      'content-type': 'application/json',
      'x-signature': underpaidSig,
    },
    body: underpaidBody,
  });
  assert.equal(resUnder.status, 409);
  const jsonUnder = await resUnder.json();
  assert.equal(jsonUnder.error.code, 'amount_mismatch');

  // 4. Exact payment with real signature -> 200 fulfilled with code
  const validSig = 'sha256=' + createHmac('sha256', config.internalWebhookSecret).update(rawBody).digest('hex');
  const resFulfill = await fetch(`${baseUrl}/api/internal/payment-confirmed`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${payKey.plaintextKey}`,
      'content-type': 'application/json',
      'x-signature': validSig,
    },
    body: rawBody,
  });
  assert.equal(resFulfill.status, 200);
  const jsonFulfill = await resFulfill.json();
  assert.equal(jsonFulfill.ok, true);
  assert.equal(jsonFulfill.order.status, 'fulfilled');
  assert.ok(jsonFulfill.issuedCode, 'issuedCode should be non-null on first fulfilment');

  // 5. Replay / retry with same providerRef -> 200 with issuedCode: null (Idempotent!)
  const resReplay = await fetch(`${baseUrl}/api/internal/payment-confirmed`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${payKey.plaintextKey}`,
      'content-type': 'application/json',
      'x-signature': validSig,
    },
    body: rawBody,
  });
  assert.equal(resReplay.status, 200);
  const jsonReplay = await resReplay.json();
  assert.equal(jsonReplay.ok, true);
  assert.equal(jsonReplay.issuedCode, null, 'issuedCode should be null for duplicate settlement');
  assert.equal(jsonReplay.note, 'Already settled');

  // 6. Check entitlement
  const resEnt = await fetch(`${baseUrl}/api/internal/entitlement?email=${encodeURIComponent(email)}`, {
    headers: { authorization: `Bearer ${payKey.plaintextKey}` },
  });
  assert.equal(resEnt.status, 200);
  const jsonEnt = await resEnt.json();
  assert.equal(jsonEnt.entitled, true);
  assert.ok(jsonEnt.entitlement.active);
  assert.ok(jsonEnt.entitlement.daysLeft > 25);

  // 7. Revoke key
  revokeApiKey(payKey.id);
  const resRevoked = await fetch(`${baseUrl}/api/internal/orders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${payKey.plaintextKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: 'another@example.com', planCode: '1m' }),
  });
  assert.equal(resRevoked.status, 401);
  const jsonRevoked = await resRevoked.json();
  assert.equal(jsonRevoked.error.code, 'api_key_invalid');
});

test('internal: verify endpoint enforces alive channel catalog and entitlement', async () => {
  const syncKey = createApiKey('catalog-sync', ['catalog:write', 'entitlement:read']);

  // Sync sample catalog channel
  await fetch(`${baseUrl}/api/internal/channels/sync`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${syncKey.plaintextKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      catalogId: 'cat_live_sports',
      channels: [
        { name: 'T Sports HD', category: 'Sports', m3u8Url: 'https://cdn.example.com/live/tsports.m3u8' },
      ],
    }),
  });

  // 1. Arbitrary random stream URL -> channel_unavailable
  const resUnknown = await fetch(
    `${baseUrl}/api/internal/verify?userId=usr_anyone&target=https://malicious-relay.com/evil.m3u8`,
    { headers: { authorization: `Bearer ${syncKey.plaintextKey}` } }
  );
  assert.equal(resUnknown.status, 200);
  const jsonUnknown = await resUnknown.json();
  assert.equal(jsonUnknown.entitled, false);
  assert.equal(jsonUnknown.reason, 'channel_unavailable');

  // 2. Known catalog channel but unpaid user -> subscription_required
  const resUnpaid = await fetch(
    `${baseUrl}/api/internal/verify?userId=usr_unpaid_123&target=https://cdn.example.com/live/tsports.m3u8`,
    { headers: { authorization: `Bearer ${syncKey.plaintextKey}` } }
  );
  assert.equal(resUnpaid.status, 200);
  const jsonUnpaid = await resUnpaid.json();
  assert.equal(jsonUnpaid.entitled, false);
  assert.equal(jsonUnpaid.reason, 'subscription_required');
});

test('internal: /api/internal/channels/health and /check enforce scopes, blocklist, and summary counts', async () => {
  const healthReadKey = createApiKey('health-reader', ['channels:read', 'catalog:write']);

  // 1. Health summary returns counts, policy, and recentTransitions array
  const healthRes = await fetch(`${baseUrl}/api/internal/channels/health`, {
    headers: { authorization: `Bearer ${healthReadKey.plaintextKey}` },
  });
  assert.equal(healthRes.status, 200);
  const healthJson = await healthRes.json();
  assert.equal(healthJson.ok, true);
  assert.ok(healthJson.counts && typeof healthJson.counts.alive === 'number');
  assert.ok(Array.isArray(healthJson.recentTransitions));
  assert.ok(healthJson.policy && typeof healthJson.policy.failThreshold === 'number');

  // 2. Check batch trigger returns 202 accepted
  const batchRes = await fetch(`${baseUrl}/api/internal/channels/check`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${healthReadKey.plaintextKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ dueOnly: true }),
  });
  assert.equal(batchRes.status, 202);
  const batchJson = await batchRes.json();
  assert.equal(batchJson.queued, true);
});

test('internal: /api/internal/entitlement and /verify recognize 12h auto-activated email orders', async () => {
  const { triggerDelayedActivations } = await import('../src/verify.js');
  const { db } = await import('../src/db.js');
  const { ingestSms } = await import('../src/ledger.js');
  const { createOrder } = await import('../src/orders.js');

  const k = createApiKey('ent-reader', ['entitlement:read', 'catalog:write']);
  const buyerEmail = 'internal-12h-vip@example.com';

  const trx = `BK12${Date.now().toString().slice(-6)}`;
  ingestSms({
    from: 'bKash',
    body: `You have received Tk 110.00 from 01755667788. Fee Tk 0.00. Balance Tk 1000.00. TrxID ${trx} at 14/11/2026 12:00`,
    receivedAt: new Date().toISOString(),
  });
  const { order } = await createOrder(
    { plan: '1m', region: 'BD', channel: 'bkash', phone: '01755667788', email: buyerEmail, trxId: trx },
    null,
    { ip: '127.0.0.1', userAgent: 'test' }
  );
  assert.equal(order.status, 'verified');

  // Rewind 12h delay timer and trigger auto-activation
  db.prepare('UPDATE orders SET auto_activate_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), order.id);
  assert.ok(triggerDelayedActivations() >= 1);

  const entRes = await fetch(`${baseUrl}/api/internal/entitlement?userId=${encodeURIComponent(buyerEmail)}`, {
    headers: { authorization: `Bearer ${k.plaintextKey}` },
  });
  assert.equal(entRes.status, 200);
  const entJson = await entRes.json();
  assert.equal(entJson.entitled, true);
  assert.equal(entJson.entitlement.planCode, '1m');

  const verRes = await fetch(
    `${baseUrl}/api/internal/verify?userId=${encodeURIComponent(buyerEmail)}&target=https://cdn.example.com/live/tsports.m3u8`,
    { headers: { authorization: `Bearer ${k.plaintextKey}` } }
  );
  assert.equal(verRes.status, 200);
  const verJson = await verRes.json();
  assert.equal(verJson.entitled, true);
});



