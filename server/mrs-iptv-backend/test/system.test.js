import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Environment must be set BEFORE the app modules are imported.
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mrs-uploads-'));
process.env.MAIL_TRANSPORT = 'json';
process.env.EMAIL_MX_CHECK = 'false';
process.env.AUTO_REFILL_CODES = 'true';
process.env.SKRILL_WEBHOOK_ENABLED = 'true';
process.env.SKRILL_MERCHANT_ID = '998877';
process.env.SKRILL_SECRET_WORD = 'TestSecretWord';

import crypto from 'node:crypto';
const { createApp } = await import('../src/server.js');
const { config, PLANS, PLAN_IDS } = await import('../src/config.js');
const { db, get, all } = await import('../src/db.js');
const { sentMail, processOutbox } = await import('../src/mailer.js');
const { ensureStock, stock, addMonths } = await import('../src/codes.js');
const { ingestBinanceTransactions, pollBinance } = await import('../src/ledger.js');
const v = await import('../src/validators.js');
const p = await import('../src/parsers.js');

let server; let base;
const ADMIN = { authorization: `Bearer ${config.adminToken}` };
const INGEST = { 'x-ingest-key': config.ingestKey, 'content-type': 'application/json' };

before(async () => {
  ensureStock(1200, 'test');
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// ------------------------------- helpers -----------------------------------
const j = (r) => r.json();
const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const mailTo = (email) => sentMail.filter((m) => m.to?.[0]?.address === email || m.to === email || JSON.stringify(m.to).includes(email));
const sms = (from, body) => fetch(base + '/api/ingest/sms', { method: 'POST', headers: INGEST, body: JSON.stringify({ from, body, receivedAt: new Date().toISOString() }) });
const bk = (trx, tk, from = '01712345678') => `You have received Tk ${tk}.00 from ${from}.Ref X. Fee Tk 0.00. Balance Tk 500.00. TrxID ${trx} at 07/11/2026 13:45`;

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
function makePng(w = 400, h = 400, seed = 1, software) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3, seed & 255); row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  if (software) parts.push(chunk('tEXt', Buffer.from(`Software\0${software}`)));
  parts.push(chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

async function order(fields, png) {
  const fd = new FormData();
  for (const [k, val] of Object.entries(fields)) if (val !== undefined) fd.append(k, val);
  if (png) fd.append('screenshot', new Blob([png], { type: 'image/png' }), 'shot.png');
  const r = await fetch(base + '/api/orders', { method: 'POST', body: fd });
  return { status: r.status, body: await r.json() };
}
const bd = (o = {}) => ({ plan: '1m', region: 'BD', channel: 'bkash', phone: '01712345678', email: `u${Math.random().toString(36).slice(2)}@gmail.com`, ...o });
const intl = (o = {}) => ({ plan: '6m', region: 'INTL', channel: 'skrill', phone: '+14155550123', email: `i${Math.random().toString(36).slice(2)}@gmail.com`, ...o });
const CODE_RE = /(?:MRS-(?:1M|2M|6M|12M)-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}|\d{10})/;
const activationMailsTo = (email) => mailTo(email).filter((m) => new RegExp(`Activation code: ${CODE_RE.source}`).test(m.text || ''));
const codeFromMail = (email) => (activationMailsTo(email).at(-1)?.text || '').match(new RegExp(`Activation code: (${CODE_RE.source})`))?.[1];

// ============================== 1. validators ===============================
test('validators: transaction ids per channel', () => {
  assert.equal(v.normalizeTrxInput('bkash', ' 9g7h2k4l1m ').value, '9G7H2K4L1M');
  assert.equal(v.normalizeTrxInput('bkash', 'TrxID: 9G7H2K4L1M').value, '9G7H2K4L1M');
  for (const bad of ['123', 'ABC DEF!!', '9G7H2K4L1M99', 'AAAAAAAAAA', 'TESTTEST12']) assert.equal(v.normalizeTrxInput('bkash', bad).ok, false, bad);
  assert.equal(v.normalizeTrxInput('nagad', '71ABCDEF9').ok, true);
  assert.equal(v.normalizeTrxInput('skrill', '4567890123').ok, true);
  assert.equal(v.normalizeTrxInput('skrill', 'ABC4567890').ok, false);
  assert.equal(v.normalizeTrxInput('payoneer', 'PAY-123456').ok, true);
  assert.equal(v.normalizeTrxInput('binance', '412345678901234567').kind, 'id');
  assert.equal(v.normalizeTrxInput('binance', 'MrxShahin').kind, 'nickname');
  assert.equal(v.normalizeTrxInput('binance', '<script>').ok, false);
  assert.equal(v.normalizeTrxInput('bkash', '').empty, true);
});
test('validators: email and phone', () => {
  assert.equal(v.normalizeEmail('  You@Gmail.COM ').value, 'you@gmail.com');
  for (const bad of ['', 'nope', 'a@b', 'a..b@gmail.com', '.a@gmail.com', 'x@mailinator.com', 'a b@gmail.com']) assert.equal(v.normalizeEmail(bad).ok, false, bad);
  assert.equal(v.normalizePhone('01810853282').e164, '+8801810853282');
  assert.equal(v.normalizePhone('+8801810853282').e164, '+8801810853282');
  assert.equal(v.normalizePhone('+880 1810-853282').e164, '+8801810853282');
  assert.equal(v.normalizePhone('+14155550123').country, 'INTL');
  for (const bad of ['', '12345', '01010853282', '14155550123', 'abc']) assert.equal(v.normalizePhone(bad).ok, false, bad);
});

test('validators: e-mail domain check fails open unless DNS is clearly negative AND the resolver is healthy', async () => {
  const neg = async () => { throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' }); };
  const yes = async () => ['mx.example'];
  const down = async () => { throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); };
  const healthy = { resolveMx: async (d) => (d === 'gmail.com' ? yes() : neg()), resolve4: neg };
  const broken = { resolveMx: neg, resolve4: neg };
  assert.equal(await v.emailDomainCanReceive('gmail.com', broken), true, 'major providers skip DNS');
  assert.equal(await v.emailDomainCanReceive('typo-domain.example', healthy), false, 'real negative answer blocks');
  assert.equal(await v.emailDomainCanReceive('typo-domain.example', broken), true, 'broken resolver never blocks');
  assert.equal(await v.emailDomainCanReceive('company.example', { resolveMx: yes, resolve4: neg }), true);
  assert.equal(await v.emailDomainCanReceive('company.example', { resolveMx: down, resolve4: down }), true, 'DNS outage never blocks');
  assert.equal(await v.emailDomainCanReceive('mailless.example', { resolveMx: neg, resolve4: async () => ['1.2.3.4'] }), true, 'implicit MX (A record)');
});

// ================================ 2. parsers ================================
test('parsers: bKash (published sample), Nagad, Skrill, Payoneer, Binance', () => {
  const b = p.parseBkashSms('You have received Tk 800.00 from 01999999999.Ref XYZ. Fee Tk 0.00. Balance Tk 0.00. TrxID XYZABC1234 at 15/07/2021 11:00');
  assert.deepEqual([b.trxId, b.amountMinor, b.sender, b.receivedAt], ['XYZABC1234', 80000, '01999999999', '2021-07-15T05:00:00.000Z']);
  assert.equal(p.parseBkashSms('Cash In Tk 3,260.00 from 01999999999 successful. Fee Tk 0.00. Balance Tk 0.00. TrxID XYZABC at 14/07/2021 20:19.'), null);
  assert.equal(p.parseBkashSms('You have sent Tk 110.00 to 01999999999. TrxID ABCDEFGH12'), null);
  assert.equal(p.parseBkashSms(bk('9G7H2K4L1M', '1,220')).amountMinor, 122000);
  const n = p.parseNagadSms('Money Received.\nAmount: Tk 210.00\nSender: 01712345678\nRef: N/A\nTxnID: 71ABCDEF9\nBalance: Tk 900.00\n07/11/2026 13:45');
  assert.deepEqual([n.channel, n.trxId, n.amountMinor, n.sender], ['nagad', '71ABCDEF9', 21000, '01712345678']);
  const s = p.parseSkrillEmail({ subject: 'You have received a payment', body: 'You have received a payment of 6.00 USD from John Doe (john@example.com). Transaction ID: 4567890123' });
  assert.deepEqual([s.trxId, s.amountMinor, s.currency, s.sender], ['4567890123', 600, 'USD', 'john@example.com']);
  const y = p.parsePayoneerEmail({ subject: 'You have received a payment', body: 'You received a payment of $12.00 from Jane. Payment ID: PY1234567' });
  assert.deepEqual([y.trxId, y.amountMinor], ['PY1234567', 1200]);
  assert.equal(p.parseBinanceTx({ orderType: 'C2C', transactionId: '1', amount: '-5.0', currency: 'USDT' }), null, 'outgoing ignored');
  assert.equal(p.parseBinanceTx({ orderType: 'CRYPTO_BOX', transactionId: '1', amount: '5', currency: 'USDT' }), null, 'wrong order type ignored');
});

// ============================ 3. activation codes ===========================
test('codes: 1200+ unique per plan in MRS-<PLAN>-XXXX-XXXX-XXXX format (no 0/O/1/I)', () => {
  const s = stock();
  for (const id of PLAN_IDS) assert.ok(s[id].available >= 1200, `${id} has ${s[id].available}`);
  const rows = all('SELECT code, plan FROM codes');
  assert.equal(new Set(rows.map((r) => r.code)).size, rows.length, 'all codes globally unique');
  assert.ok(rows.every((r) => new RegExp(`^MRS-${r.plan.toUpperCase()}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$`).test(r.code)));
});
test('codes: calendar-aware month math', () => {
  assert.equal(addMonths('2026-01-31T00:00:00Z', 1).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(addMonths('2026-11-07T10:00:00Z', 12).toISOString().slice(0, 10), '2027-11-07');
  assert.equal(addMonths('2026-11-07T10:00:00Z', 6).toISOString().slice(0, 10), '2027-05-07');
});

// ======================= 4. bKash end-to-end ================================
test('bKash: real payment → verified → code delivered ONLY by email (never leaked in status) → redeemable once per device', async () => {
  assert.equal((await sms('bKash', bk('BK10000001', '210'))).status, 200);
  const o = bd({ plan: '2m', trxId: 'bk10000001' });
  const r = await order(o);
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'verified');
  assert.equal(r.body.code, undefined, 'activation code is NEVER leaked in HTTP order status');
  const statusCheck = await j(await fetch(`${base}/api/orders/${r.body.orderId}/status`));
  assert.equal(statusCheck.code, undefined, 'GET /api/orders/:ref/status never returns code');

  await processOutbox();
  const code = codeFromMail(o.email);
  assert.match(code, /^MRS-2M-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(get('SELECT plan, status FROM codes WHERE code=?', code).plan, '2m');
  assert.match(mailTo(o.email).at(-1).subject, /2 Months/);

  const dev = 'device-aaaaaaaaaaaaaaaa';
  const a = await post('/api/redeem', { code, deviceId: dev });
  assert.equal(a.status, 200);
  const ent = await j(a);
  assert.equal(ent.plan, '2m');
  const expect = addMonths(new Date(), 2).getTime();
  assert.ok(Math.abs(Date.parse(ent.expiresAt) - expect) < 60_000, 'expires in 2 calendar months');
  assert.equal((await post('/api/redeem', { code, deviceId: dev })).status, 200, 'same device may restore');
  assert.equal((await post('/api/redeem', { code, deviceId: 'device-bbbbbbbbbbbbbbbb' })).status, 409, 'other device blocked');
  assert.equal((await post('/api/entitlement', { token: ent.token, deviceId: dev })).status, 200);
  assert.equal((await post('/api/entitlement', { token: ent.token, deviceId: 'device-bbbbbbbbbbbbbbbb' })).status, 401);
  assert.equal((await post('/api/entitlement', { token: ent.token + 'x', deviceId: dev })).status, 401, 'tampered token');
});

test('bKash: order submitted BEFORE the SMS arrives is verified automatically afterwards', async () => {
  const o = bd({ trxId: 'BK10000002' });
  const r = await order(o);
  assert.equal(r.body.status, 'pending');
  await processOutbox();
  assert.equal(activationMailsTo(o.email).length, 0);
  await sms('bKash', bk('BK10000002', '110'));
  const s = await j(await fetch(`${base}/api/orders/${r.body.orderId}`));
  assert.equal(s.status, 'verified');
  await processOutbox();
  assert.ok(codeFromMail(o.email));
});

test('a well-formatted but FAKE transaction id is never verified', async () => {
  const o = bd({ trxId: 'ZZ99YY88XX' });
  const r = await order(o);
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'pending');
  await processOutbox();
  assert.equal(activationMailsTo(o.email).length, 0);
  assert.equal(mailTo(o.email).length, 1);
  assert.match(mailTo(o.email)[0].subject, /Payment Received & Under Review/);
});

test('re-using a verified transaction id is rejected', async () => {
  await sms('bKash', bk('BK10000003', '110'));
  const a = await order(bd({ trxId: 'BK10000003' }));
  assert.equal(a.body.status, 'verified');
  const b = await order(bd({ trxId: 'BK10000003' }));
  assert.equal(b.body.status, 'rejected');
  assert.equal(b.body.reason, 'trx_already_used');
});

test('underpayment is rejected with amounts; overpayment is accepted', async () => {
  await sms('bKash', bk('BK10000004', '100'));
  const a = await order(bd({ trxId: 'BK10000004' }));
  assert.equal(a.body.status, 'rejected');
  assert.equal(a.body.reason, 'underpaid');
  assert.match(a.body.message, /received 100 TK.*costs 110 TK/);
  await sms('bKash', bk('BK10000005', '115'));
  assert.equal((await order(bd({ trxId: 'BK10000005' }))).body.status, 'verified');
});

test('paying the price of a different plan goes to manual review', async () => {
  await sms('bKash', bk('BK10000006', '610'));
  const a = await order(bd({ trxId: 'BK10000006', plan: '1m' }));
  assert.equal(a.body.status, 'needs_review');
  assert.equal(a.body.reason, 'paid_for_other_plan');
});

test('payer number must match the number entered (else manual review, never auto-approved)', async () => {
  await sms('bKash', bk('BK10000007', '110', '01900000000'));
  const a = await order(bd({ trxId: 'BK10000007', phone: '01712345678' }));
  assert.equal(a.body.status, 'needs_review');
  assert.equal(a.body.reason, 'sender_mismatch');
});

test('someone squatting on a victim\'s TrxID cannot steal the payment', async () => {
  const attacker = await order(bd({ trxId: 'BK10000008', phone: '01611111111' }));
  assert.equal(attacker.body.status, 'pending');
  await sms('bKash', bk('BK10000008', '110', '01712345678'));
  assert.equal(get('SELECT status, status_reason FROM orders WHERE public_id=?', attacker.body.orderId).status, 'needs_review');
  const victim = await order(bd({ trxId: 'BK10000008', phone: '01712345678' }));
  assert.equal(victim.body.status, 'verified');
});

test('Nagad works via /api/webhooks/sms too', async () => {
  const res = await fetch(base + '/api/webhooks/sms', {
    method: 'POST',
    headers: INGEST,
    body: JSON.stringify({ from: 'NAGAD', body: 'Money Received.\nAmount: Tk 1220.00\nSender: 01712345678\nRef: N/A\nTxnID: 71NAG0001\nBalance: Tk 900.00' }),
  });
  assert.equal(res.status, 200);
  const o = bd({ channel: 'nagad', plan: '12m', trxId: '71nag0001' });
  assert.equal((await order(o)).body.status, 'verified');
  await processOutbox();
  assert.equal(get('SELECT plan FROM codes WHERE code=?', codeFromMail(o.email)).plan, '12m');
});

// ================================ ingest & webhooks =========================
test('ingest: needs the key; spoofed senders and DKIM failures are refused', async () => {
  assert.equal((await fetch(base + '/api/ingest/sms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  const spoof = await sms('+8801700000000', bk('SPOOF00001', '110'));
  assert.equal(spoof.status, 403);
  assert.equal(get("SELECT COUNT(*) n FROM ledger WHERE trx_id='SPOOF00001'").n, 0);
  const email = (dkimPass, from = 'Skrill <noreply@skrill.com>') => post('/api/ingest/email', { from, subject: 'Payment received', body: 'You have received a payment of 6.00 USD from A B (a@b.com). Transaction ID: 9000000001', dkimPass }, INGEST);
  assert.equal((await email(false)).status, 403);
  assert.equal((await email(true, 'Scam <skrill@skrill.com.evil.io>')).status, 403);
  assert.equal(get("SELECT COUNT(*) n FROM ledger WHERE trx_id='9000000001'").n, 0);
});

test('Skrill: signed Quick Checkout callback + e-mail receipt both verify orders', async () => {
  const secretMd5 = crypto.createHash('md5').update('TestSecretWord').digest('hex').toUpperCase();
  const trx = '9000000888';
  const md5sig = crypto.createHash('md5').update(`998877${trx}${secretMd5}6.00USD2`).digest('hex').toUpperCase();
  const whRes = await post('/api/webhooks/skrill', {
    merchant_id: '998877',
    transaction_id: trx,
    mb_transaction_id: trx,
    mb_amount: '6.00',
    mb_currency: 'USD',
    status: '2',
    pay_from_email: 'payer@example.com',
    md5sig,
  });
  assert.equal(whRes.status, 200);
  const o = intl({ trxId: trx });
  assert.equal((await order(o)).body.status, 'verified');
  await processOutbox();
  assert.equal(get('SELECT plan FROM codes WHERE code=?', codeFromMail(o.email)).plan, '6m');
});

test('Payoneer: matching payment verified; wrong amount rejected', async () => {
  await post('/api/ingest/email', { from: 'Payoneer <no-reply@payoneer.com>', subject: 'You received a payment', body: 'You received a payment of $12.00 from Jane. Payment ID: PY0000001', dkimPass: true }, INGEST);
  assert.equal((await order(intl({ channel: 'payoneer', plan: '12m', trxId: 'PY0000001' }))).body.status, 'verified');
  await post('/api/ingest/email', { from: 'Payoneer <no-reply@payoneer.com>', subject: 'You received a payment', body: 'You received a payment of $1.00 from Jane. Payment ID: PY0000002', dkimPass: true }, INGEST);
  assert.equal((await order(intl({ channel: 'payoneer', plan: '12m', trxId: 'PY0000002' }))).body.reason, 'underpaid');
});

// ================================ Binance ===================================
test('Binance Pay: order id verified automatically; nickname needs a human; non-stable asset flagged', async () => {
  const mk = (id, amt, cur, name) => ({ orderType: 'C2C', transactionId: id, transactionTime: Date.now(), amount: amt, currency: cur, payerInfo: { name, binanceId: '777' } });
  assert.equal(ingestBinanceTransactions([mk('412000000000000001', '1.00000000', 'USDT', 'Rahim'), mk('412000000000000002', '2.00', 'USDT', 'Karim'), mk('412000000000000003', '1.00', 'BNB', 'Zed'), mk('412000000000000009', '-1.00', 'USDT', 'me')]), 3);
  assert.equal((await order(bd({ channel: 'binance', trxId: '412000000000000001' }))).body.status, 'verified');
  const nick = await order(bd({ channel: 'binance', plan: '2m', trxId: 'Karim' }));
  assert.equal(nick.body.status, 'needs_review');
  assert.equal(nick.body.reason, 'nickname_match_needs_confirmation');
  const bnb = await order(bd({ channel: 'binance', trxId: '412000000000000003' }));
  assert.equal(bnb.body.reason, 'currency_mismatch');
  assert.equal((await order(bd({ channel: 'binance', trxId: '412000000000000009' }))).body.status, 'pending', 'outgoing tx is not in the ledger');
});

test('Binance poller signs the request and reads the response', async () => {
  Object.assign(config.binance, { key: 'k', secret: 's' });
  let seen;
  const fake = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => ({ code: '000000', success: true, data: [{ orderType: 'C2C', transactionId: '412000000000000050', transactionTime: Date.now(), amount: '12.0', currency: 'USDT', payerInfo: { name: 'Poll' } }] }) }; };
  const r = await pollBinance(fake);
  Object.assign(config.binance, { key: '', secret: '' });
  assert.equal(r.added, 1);
  assert.match(seen.url, /\/sapi\/v1\/pay\/transactions\?startTime=\d+&endTime=\d+&limit=100&recvWindow=10000&timestamp=\d+&signature=[0-9a-f]{64}$/);
  assert.equal(seen.opts.headers['X-MBX-APIKEY'], 'k');
});

// ============================== validation API ==============================
test('API rejects malformed input with per-field messages & exposes /api/payment-methods', async () => {
  const pm = await j(await fetch(base + '/api/payment-methods'));
  assert.equal(pm.ok, true);
  assert.equal(pm.methods.length, 5);

  const r = await order({ plan: '3m', region: 'BD', channel: 'skrill', phone: '123', email: 'bad', trxId: '' });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body.error.fields).sort(), ['channel', 'email', 'phone', 'plan', 'trxId']);
  const wrongTrx = await order(bd({ trxId: '12' }));
  assert.match(wrongTrx.body.error.fields.trxId, /Invalid Transaction ID/);
  const none = await order(bd());
  assert.match(none.body.error.fields.trxId, /Transaction ID or upload/);
});

test('same order submitted twice is idempotent (no duplicate row, no second code)', async () => {
  await sms('bKash', bk('BK10000020', '110'));
  const o = bd({ trxId: 'BK10000020' });
  const a = await order(o); const b = await order(o);
  assert.equal(a.status, 201); assert.equal(b.status, 200);
  assert.equal(a.body.orderId, b.body.orderId);
});

// ============================== screenshots =================================
test('screenshots: integrity, size, re-use, editor traces, and strict non-auto-verify', async () => {
  const notImage = await order(bd(), Buffer.from('<?php echo 1; ?>'.repeat(50)));
  assert.match(notImage.body.error.fields.screenshot, /real JPG, PNG or WebP/);
  const tiny = await order(bd(), makePng(20, 20));
  assert.match(tiny.body.error.fields.screenshot, /too small/);

  const img = makePng(400, 400, 7);
  const first = await order(bd({ trxId: 'BK10000030' }), img);
  assert.equal(first.status, 201);
  assert.equal(first.body.status, 'pending', 'screenshot + unmatched TrxID never auto-approves without ledger/admin');
  const reuse = await order(bd({ trxId: 'BK10000031' }), img);
  assert.equal(reuse.status, 409);
  assert.equal(reuse.body.error.code, 'screenshot_reused');

  const edited = await order(bd({ trxId: 'BK10000032' }), makePng(400, 400, 9, 'Adobe Photoshop 25.0'));
  const row = get('SELECT screenshot_flags FROM orders WHERE public_id=?', edited.body.orderId);
  assert.match(row.screenshot_flags, /edited_by:adobe photoshop/);

  const only = await order(bd(), makePng(400, 400, 11));
  assert.equal(only.body.status, 'needs_review');
  assert.equal(only.body.reason, 'screenshot_unreadable');
});

// ================================= admin ====================================
test('admin: protected; approve a needs_review order with its ledger payment; resend e-mail; reject emails customer', async () => {
  assert.equal((await fetch(base + '/api/admin/stats')).status, 401);
  assert.equal((await fetch(base + '/api/admin/stats', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  const stats = await j(await fetch(base + '/api/admin/stats', { headers: ADMIN }));
  assert.ok(stats.orders.verified >= 1);

  await sms('bKash', bk('BK10000040', '110', '01900000001'));
  const o = bd({ trxId: 'BK10000040', phone: '01712345679' });
  const r = await order(o);
  assert.equal(r.body.status, 'needs_review');
  const detail = await j(await fetch(`${base}/api/admin/orders/${r.body.orderId}`, { headers: ADMIN }));
  assert.ok(detail.ledger_id);
  const noNote = await post(`/api/admin/orders/${r.body.orderId}/approve`, {}, ADMIN);
  assert.equal(noNote.status, 200, 'pre-linked ledger payment can be approved in one click');
  await processOutbox();
  assert.ok(codeFromMail(o.email));
  const before = mailTo(o.email).length;
  assert.equal((await post(`/api/admin/orders/${r.body.orderId}/resend`, {}, ADMIN)).status, 200);
  assert.equal(mailTo(o.email).length, before + 1);

  const rejOrd = await order(intl({ trxId: '9911223344' }));
  assert.equal((await post(`/api/admin/orders/${rejOrd.body.orderId}/reject`, { reason: 'Fake TrxID' }, ADMIN)).status, 200);
  await processOutbox();
  assert.ok(mailTo(rejOrd.body.email) !== null);

  const rev = await j(await fetch(`${base}/api/admin/revenue`, { headers: ADMIN }));
  assert.equal(rev.ok, true);
  assert.ok(Array.isArray(rev.byPlan));
});

test('admin: approving with no payment on record needs a written note', async () => {
  const r = await order(intl({ trxId: '9000000099' }));
  assert.equal(r.body.status, 'pending');
  assert.equal((await post(`/api/admin/orders/${r.body.orderId}/approve`, {}, ADMIN)).status, 400);
  assert.equal((await post(`/api/admin/orders/${r.body.orderId}/approve`, { note: 'Checked Skrill dashboard: 6.00 USD received' }, ADMIN)).status, 200);
  assert.equal(get('SELECT verification_method FROM orders WHERE public_id=?', r.body.orderId).verification_method, 'manual');
});

test('admin: manual ledger entry auto-verifies a waiting order; code revoke + device reset', async () => {
  const o = intl({ trxId: '9000000100', plan: '12m' });
  assert.equal((await order(o)).body.status, 'pending');
  const add = await post('/api/admin/ledger', { channel: 'skrill', trxId: '9000000100', amount: 12 }, ADMIN);
  assert.equal(add.status, 201);
  assert.equal(get('SELECT status FROM orders WHERE email=?', o.email).status, 'verified');
  await processOutbox();
  const code = codeFromMail(o.email);
  assert.equal((await post('/api/redeem', { code, deviceId: 'device-cccccccccccccccc' })).status, 200);
  assert.equal((await post(`/api/admin/codes/${code}/reset-device`, {}, ADMIN)).status, 200);
  assert.equal((await post('/api/redeem', { code, deviceId: 'device-dddddddddddddddd' })).status, 200, 'rebinds after reset');
  assert.equal((await post(`/api/admin/codes/${code}/revoke`, {}, ADMIN)).status, 200);
  assert.equal((await post('/api/redeem', { code, deviceId: 'device-dddddddddddddddd' })).status, 403);
});

// ==================== /api/activate + extend + devices =====================
test('/api/activate extends existing active plan on same email and enforces 2-device limit with /api/devices/remove', async () => {
  const userEmail = 'vip-multi@gmail.com';
  await sms('bKash', bk('BKEXT00001', '110'));
  await sms('bKash', bk('BKEXT00002', '110'));

  await order(bd({ plan: '1m', trxId: 'BKEXT00001', email: userEmail }));
  await order(bd({ plan: '1m', trxId: 'BKEXT00002', email: userEmail }));
  await processOutbox();

  const codes = activationMailsTo(userEmail).map((m) => m.text.match(CODE_RE)?.[0]).filter(Boolean);
  assert.equal(codes.length, 2);

  // Activate code 1 on device 1
  const act1 = await j(await post('/api/activate', { code: codes[0], email: userEmail, deviceId: 'device-1111111111111111', deviceLabel: 'Living Room TV' }));
  assert.equal(act1.ok, true);
  assert.equal(act1.devices.length, 1);

  // Same account activates 2nd 1m code -> extends from existing expiry (2 months total)
  const actExt = await j(await post('/api/activate', { code: codes[1], email: userEmail, deviceId: 'device-1111111111111111', deviceLabel: 'Living Room TV' }));
  assert.equal(actExt.ok, true);
  assert.equal(actExt.extended, true);
  assert.ok(Date.parse(actExt.expiresAt) > Date.parse(act1.expiresAt) + 25 * 86400_000);

  // Device 2 succeeds (limit is 2)
  const actDev2 = await j(await post('/api/activate', { code: codes[1], email: userEmail, deviceId: 'device-2222222222222222', deviceLabel: 'iPhone' }));
  assert.equal(actDev2.ok, true);
  assert.equal(actDev2.devices.length, 2);

  // Device 3 blocked with DEVICE_LIMIT
  const actDev3Res = await post('/api/activate', { code: codes[1], email: userEmail, deviceId: 'device-3333333333333333', deviceLabel: 'Tablet' });
  assert.equal(actDev3Res.status, 409);
  const actDev3 = await j(actDev3Res);
  assert.equal(actDev3.error.code, 'DEVICE_LIMIT');

  // Remove Device 2 via /api/devices/remove then Device 3 connects
  const rem = await j(await post('/api/devices/remove', { token: actDev2.token, deviceHash: actDev2.devices[1].deviceHash }));
  assert.equal(rem.ok, true);
  const actDev3Retry = await j(await post('/api/activate', { code: codes[1], email: userEmail, deviceId: 'device-3333333333333333', deviceLabel: 'Tablet' }));
  assert.equal(actDev3Retry.ok, true);

  // GET /api/status validates token
  const st = await j(await fetch(`${base}/api/status?deviceId=device-3333333333333333`, { headers: { authorization: `Bearer ${actDev3Retry.token}` } }));
  assert.equal(st.ok, true);
  assert.equal(st.active, true);
});

// ================================= redeem ===================================
test('redeem: unsold inventory codes, junk and unknown codes are all refused', async () => {
  const unsold = get("SELECT code FROM codes WHERE status='available' LIMIT 1").code;
  const r = await post('/api/redeem', { code: unsold, deviceId: 'device-eeeeeeeeeeeeeeee' });
  assert.equal(r.status, 404, 'a leaked pool is useless until a payment is verified');
  assert.equal((await post('/api/redeem', { code: '1234567890', deviceId: 'device-eeeeeeeeeeeeeeee' })).status, 404);
  assert.equal((await post('/api/redeem', { code: 'abc', deviceId: 'device-eeeeeeeeeeeeeeee' })).status, 400);
  assert.equal((await post('/api/redeem', { code: unsold, deviceId: 'x' })).status, 400);
});

test('every plan issues a code from its own pool and pool shrinks accordingly', () => {
  const issued = all("SELECT DISTINCT plan FROM codes WHERE status IN ('issued','redeemed','revoked')").map((r) => r.plan);
  for (const id of ['1m', '2m', '6m', '12m']) assert.ok(issued.includes(id), `${id} issued at least once`);
  assert.equal(get('SELECT COUNT(*) n FROM (SELECT order_id FROM codes WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*)>1)').n, 0);
});

test('low-stock alert is queued when unused codes drop below 50; auto-refill replenishes', async () => {
  db.exec("UPDATE codes SET status='issued', order_id=-1 WHERE plan='1m' AND id NOT IN (SELECT id FROM codes WHERE plan='1m' AND status='available' LIMIT 5)");
  await sms('bKash', bk('BK10000050', '110'));
  const r = await order(bd({ trxId: 'BK10000050' }));
  assert.equal(r.body.status, 'verified');
  await processOutbox();
  assert.ok(mailTo(config.mail.adminEmail).some((m) => /Low Activation Code Stock/.test(m.subject || '')));

  db.exec("UPDATE codes SET status='issued', order_id=-1 WHERE plan='1m' AND status='available'");
  await sms('bKash', bk('BK10000051', '110'));
  const r2 = await order(bd({ trxId: 'BK10000051' }));
  assert.equal(r2.body.status, 'verified');
  assert.ok(stock()['1m'].available >= config.refillBatch - 1);
});

test('12-hour delayed trigger automatically activates unredeemed pass and sends email', async () => {
  const { triggerDelayedActivations } = await import('../src/verify.js');
  await sms('bKash', bk('BK12HAUTO1', '110'));
  const o = bd({ trxId: 'BK12HAUTO1', email: 'delayed-auto@test.com' });
  const ord = await order(o);
  assert.equal(ord.body.status, 'verified');
  await processOutbox();
  const code = codeFromMail('delayed-auto@test.com');

  const codeRow = get("SELECT * FROM codes WHERE code=?", code);
  assert.equal(codeRow.status, 'issued');

  const past = new Date(Date.now() - 1000).toISOString();
  db.prepare("UPDATE orders SET auto_activate_at=? WHERE public_id=?").run(past, ord.body.orderId);

  const activated = triggerDelayedActivations();
  assert.equal(activated >= 1, true);

  const updatedCode = get("SELECT * FROM codes WHERE code=?", code);
  assert.equal(updatedCode.status, 'redeemed');
  assert.ok(updatedCode.activated_at);
  assert.ok(updatedCode.expires_at);

  await processOutbox();
  const emails = mailTo('delayed-auto@test.com');
  assert.ok(emails.length >= 2);
  assert.match(emails[emails.length - 1].subject, /VIP Pass is Now Automatically Active/);
});

test('POST /api/orders/:id/claim binds device after 12h auto-activation and enforces single-device lock', async () => {
  const { triggerDelayedActivations } = await import('../src/verify.js');
  await sms('bKash', bk('BKCLAIM12H', '110'));
  const ord = await order(bd({ trxId: 'BKCLAIM12H', email: 'claim-12h@test.com' }));
  assert.equal(ord.body.status, 'verified');

  const early = await post(`/api/orders/${ord.body.orderId}/claim`, { deviceId: 'device-claim-first-1111' });
  assert.equal(early.status, 409);
  const earlyBody = await j(early);
  assert.equal(earlyBody.error.code, 'not_auto_activated');

  db.prepare("UPDATE orders SET auto_activate_at=? WHERE public_id=?").run(new Date(Date.now() - 2000).toISOString(), ord.body.orderId);
  assert.ok(triggerDelayedActivations() >= 1);

  const claim1 = await post(`/api/orders/${ord.body.orderId}/claim`, { deviceId: 'device-claim-first-1111' });
  assert.equal(claim1.status, 200);
  const claim1Body = await j(claim1);
  assert.equal(claim1Body.active, true);
  assert.equal(claim1Body.autoActivated, true);
  assert.ok(claim1Body.token);

  const claimSame = await post(`/api/orders/${ord.body.orderId}/claim`, { deviceId: 'device-claim-first-1111' });
  assert.equal(claimSame.status, 200);

  const claim2 = await post(`/api/orders/${ord.body.orderId}/claim`, { deviceId: 'device-claim-second-222' });
  assert.equal(claim2.status, 409);
  const claim2Body = await j(claim2);
  assert.equal(claim2Body.error.code, 'device_mismatch');
});

test('submitting payment details emails an informational record copy to customer and admin without prematurely issuing a code', async () => {
  const adminEmail = config.mail.adminEmail;
  const adminBefore = mailTo(adminEmail).length;
  const shot = makePng(410, 410, 33);
  const o = bd({ plan: '2m', trxId: 'BKCOPY2026', email: 'record-copy@test.com' });

  const r1 = await order(o, shot);
  assert.equal(r1.status, 201);
  await processOutbox();

  const custMails = mailTo('record-copy@test.com');
  const copyMail = custMails.find((m) => /Payment Received & Under Review/.test(m.subject));
  assert.ok(copyMail, 'customer received payment confirmation copy email');
  assert.ok(copyMail.text.includes(r1.body.orderId));
  assert.ok(copyMail.text.includes('BKCOPY2026'));
  assert.ok(copyMail.text.includes('2 Months'));
  assert.ok(copyMail.text.includes('210 TK'));
  assert.ok(!/Activation code:/i.test(copyMail.text), 'record copy must not include an activation code');

  const adminMails = mailTo(adminEmail).slice(adminBefore);
  const adminCopy = adminMails.find((m) => (m.subject || '').includes(r1.body.orderId));
  assert.ok(adminCopy, 'admin received submitted payment details copy');
  assert.ok(adminCopy.text.includes('record-copy@test.com'));

  const custCountBeforeRetry = mailTo('record-copy@test.com').length;
  const r2 = await order(o);
  assert.equal(r2.status, 200);
  await processOutbox();
  assert.equal(mailTo('record-copy@test.com').length, custCountBeforeRetry);

  const pendingOrd = bd({ trxId: 'PENDINGCP1', email: 'pending-copy@test.com' });
  const rp = await order(pendingOrd);
  assert.equal(rp.body.status, 'pending');
  assert.equal(rp.body.emailStatus, null);
  await processOutbox();
  const pendingStatus = await j(await fetch(`${base}/api/orders/${rp.body.orderId}`));
  assert.equal(pendingStatus.emailStatus, null);
  assert.equal(pendingStatus.copyEmailStatus, 'sent');
  assert.equal(activationMailsTo('pending-copy@test.com').length, 0);
});

test('backend AI payment verification: auto-verifies matching TrxID + PNG/PDF documents, emails exact-month code, and enforces deterministic fraud guards', async () => {
  const { setAiPaymentVerifier, reconcileAiPending } = await import('../src/verify.js');

  const sendWithMime = async (fields, buf, mime, filename) => {
    const fd = new FormData();
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) fd.append(k, val);
    if (buf) fd.append('screenshot', new Blob([buf], { type: mime }), filename);
    const r = await fetch(base + '/api/payments/submit', { method: 'POST', body: fd });
    return { status: r.status, body: await r.json() };
  };

  try {
    // 1. PDF receipt upload (no typed TrxID) for 6m Skrill -> AI extracts TrxID, verifies similarity & amount, emails MRS-6M-... code
    const samplePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n' + 'Skrill Payment Confirmed $6.00 Transaction ID: 8822334455 '.repeat(4) + '\n%%EOF');
    setAiPaymentVerifier(async (ctx) => {
      assert.equal(ctx.fileMime, 'application/pdf');
      assert.equal(ctx.order.plan, '6m');
      return {
        model: 'gemini-4-hydrogen',
        hasDocument: true,
        isPaymentDocument: true,
        detectedChannel: 'skrill',
        channelMatchesSelected: true,
        extractedTrxId: '8822334455',
        trxIdMatchesInput: true,
        trxIdLooksReal: true,
        trxIdSimilarityScore: 95,
        extractedAmount: 6,
        extractedCurrency: 'USD',
        extractedRecipient: '407108385',
        paymentStatusSuccessful: true,
        appearsAuthenticAndUnedited: true,
        overallSimilarityScore: 94,
        verdict: 'verify',
        reasonCode: 'ai_verified',
        summary: 'PDF receipt matches Skrill $6.00 transfer (TrxID 8822334455).',
      };
    });

    const pdfOrd = await sendWithMime(
      intl({ plan: '6m', channel: 'skrill', email: 'ai-pdf-6m@gmail.com' }),
      samplePdf,
      'application/pdf',
      'skrill-receipt.pdf'
    );
    assert.equal(pdfOrd.status, 201);
    assert.equal(pdfOrd.body.status, 'verified');
    assert.equal(pdfOrd.body.verificationMethod, 'ai_auto');
    assert.match(pdfOrd.body.aiSummary, /Skrill \$6\.00/);
    assert.ok(!JSON.stringify(pdfOrd.body).includes('MRS-6M-'), 'code must NEVER appear in API HTTP response');

    await processOutbox();
    const code6m = codeFromMail('ai-pdf-6m@gmail.com');
    assert.match(code6m, /^MRS-6M-/, 'must email exact 6-month plan code');

    // 2. Duplicate TrxID caught deterministically by backend even if AI approves
    setAiPaymentVerifier(async () => ({
      model: 'gemini-4-hydrogen',
      hasDocument: true,
      isPaymentDocument: true,
      detectedChannel: 'skrill',
      channelMatchesSelected: true,
      extractedTrxId: '8822334455',
      trxIdMatchesInput: true,
      trxIdLooksReal: true,
      trxIdSimilarityScore: 95,
      extractedAmount: 6,
      extractedCurrency: 'USD',
      extractedRecipient: '407108385',
      paymentStatusSuccessful: true,
      appearsAuthenticAndUnedited: true,
      overallSimilarityScore: 95,
      verdict: 'verify',
      reasonCode: 'ai_verified',
      summary: 'Duplicate TrxID test.',
    }));
    const dupTrxOrd = await sendWithMime(
      intl({ plan: '6m', channel: 'skrill', trxId: '8822334455', email: 'ai-dup@gmail.com' }),
      makePng(400, 400, 51),
      'image/png',
      'dup.png'
    );
    assert.equal(dupTrxOrd.status, 201);
    assert.equal(dupTrxOrd.body.status, 'rejected');
    assert.equal(dupTrxOrd.body.reason, 'trx_already_used');
    assert.equal(activationMailsTo('ai-dup@gmail.com').length, 0);

    // 3. Underpaid proof caught deterministically even if AI returns verdict='verify'
    setAiPaymentVerifier(async () => ({
      model: 'gemini-4-hydrogen',
      hasDocument: true,
      isPaymentDocument: true,
      detectedChannel: 'bkash',
      channelMatchesSelected: true,
      extractedTrxId: 'BKAIUNDER1',
      trxIdMatchesInput: true,
      trxIdLooksReal: true,
      trxIdSimilarityScore: 90,
      extractedAmount: 110,
      extractedCurrency: 'BDT',
      extractedRecipient: '01810853282',
      paymentStatusSuccessful: true,
      appearsAuthenticAndUnedited: true,
      overallSimilarityScore: 90,
      verdict: 'verify',
      reasonCode: 'ai_verified',
      summary: 'bKash receipt for 110 TK.',
    }));
    const underOrd = await sendWithMime(
      bd({ plan: '12m', trxId: 'BKAIUNDER1', email: 'ai-under@gmail.com' }),
      makePng(400, 400, 52),
      'image/png',
      'under.png'
    );
    assert.equal(underOrd.body.status, 'rejected');
    assert.equal(underOrd.body.reason, 'underpaid');
    assert.equal(activationMailsTo('ai-under@gmail.com').length, 0);

    // 4. TrxID-only submission for 12m Nagad verified by similarity -> issues MRS-12M-... code
    setAiPaymentVerifier(async (ctx) => ({
      model: 'gemini-4-hydrogen',
      hasDocument: false,
      isPaymentDocument: false,
      detectedChannel: 'nagad',
      channelMatchesSelected: true,
      extractedTrxId: ctx.order.trx_id,
      trxIdMatchesInput: true,
      trxIdLooksReal: true,
      trxIdSimilarityScore: 91,
      extractedAmount: 0,
      extractedCurrency: '',
      extractedRecipient: '',
      paymentStatusSuccessful: true,
      appearsAuthenticAndUnedited: true,
      overallSimilarityScore: 88,
      verdict: 'verify',
      reasonCode: 'ai_verified',
      summary: 'Nagad Transaction ID matches genuine Nagad structure.',
    }));
    const nagad12m = await sendWithMime(
      bd({ plan: '12m', channel: 'nagad', trxId: 'NG94K7P2MX', email: 'ai-nagad-12m@gmail.com' }),
      null,
      null,
      null
    );
    assert.equal(nagad12m.status, 201);
    assert.equal(nagad12m.body.status, 'verified');
    await processOutbox();
    assert.match(codeFromMail('ai-nagad-12m@gmail.com'), /^MRS-12M-/);

    // 5. Outage / quota deferral NEVER fakes approval; retries via reconcileAiPending when AI recovers
    setAiPaymentVerifier(async () => ({
      deferred: true,
      deferredReason: 'ai_quota_limit',
      model: 'gemini-4-hydrogen',
      summary: 'Temporary AI rate limit.',
    }));
    const defOrd = await sendWithMime(
      bd({ plan: '2m', channel: 'bkash', trxId: 'BKDEFER99A', email: 'ai-defer@gmail.com' }),
      null,
      null,
      null
    );
    assert.equal(defOrd.status, 201);
    assert.equal(defOrd.body.status, 'pending', 'must never fake approval when AI is deferred');
    assert.equal(activationMailsTo('ai-defer@gmail.com').length, 0);

    setAiPaymentVerifier(async (ctx) => ({
      model: 'gemini-4-hydrogen',
      hasDocument: false,
      isPaymentDocument: false,
      detectedChannel: 'bkash',
      channelMatchesSelected: true,
      extractedTrxId: ctx.order.trx_id,
      trxIdMatchesInput: true,
      trxIdLooksReal: true,
      trxIdSimilarityScore: 92,
      extractedAmount: 0,
      extractedCurrency: '',
      extractedRecipient: '',
      paymentStatusSuccessful: true,
      appearsAuthenticAndUnedited: true,
      overallSimilarityScore: 90,
      verdict: 'verify',
      reasonCode: 'ai_verified',
      summary: 'Verified on background retry.',
    }));
    const retried = await reconcileAiPending(5);
    assert.ok(retried >= 1);
    await processOutbox();
    assert.match(codeFromMail('ai-defer@gmail.com'), /^MRS-2M-/);
  } finally {
    setAiPaymentVerifier(null);
  }
});

test('checkout anti-spam shield: honeypot trap, valid SHA-256 PoW, replay block, and signature tamper protection', async () => {
  const chRes = await fetch(`${base}/api/payments/challenge`);
  assert.equal(chRes.status, 200);
  const ch = await chRes.json();
  assert.equal(ch.ok, true);
  assert.ok(ch.challengeToken);
  assert.ok(ch.nonce);

  // Solve leading-zero-bits PoW
  const hasZeroBits = (buf, bits) => {
    const full = Math.floor(bits / 8);
    const rem = bits % 8;
    for (let i = 0; i < full; i++) if (buf[i] !== 0) return false;
    if (rem > 0 && (buf[full] & (0xff << (8 - rem))) !== 0) return false;
    return true;
  };
  let solution = '';
  for (let i = 0; i < 200_000; i++) {
    const cand = i.toString(36);
    const digest = crypto.createHash('sha256').update(`${ch.nonce}:${cand}`).digest();
    if (hasZeroBits(digest, ch.difficulty)) {
      solution = cand;
      break;
    }
  }
  assert.ok(solution, 'solved checkout PoW challenge');

  // 1. Honeypot trap blocks submission
  const spamRes = await order(bd({ trxId: 'SPAMBOT991', website_url: 'https://spam-bot.example', challengeToken: ch.challengeToken, challengeSolution: solution }));
  assert.equal(spamRes.status, 400);
  assert.equal(spamRes.body.error.code, 'spam_detected');

  // 2. Valid challenge + clean honeypot passes (does NOT consume challenge until verified; spam blocked before step 3)
  const validRes = await order(bd({ trxId: 'POWVALID01', website_url: '', challengeToken: ch.challengeToken, challengeSolution: solution }));
  assert.equal(validRes.status, 201);

  // 3. Replaying the exact same single-use challenge is blocked
  const replayRes = await order(bd({ trxId: 'POWVALID02', challengeToken: ch.challengeToken, challengeSolution: solution }));
  assert.equal(replayRes.status, 400);
  assert.equal(replayRes.body.error.code, 'challenge_reused');

  // 4. Tampered signature is blocked
  const [b64] = ch.challengeToken.split('.');
  const badRes = await order(bd({ trxId: 'POWBADSIG1', challengeToken: `${b64}.tamperedSig123`, challengeSolution: solution }));
  assert.equal(badRes.status, 400);
  assert.equal(badRes.body.error.code, 'challenge_failed');

  // 5. Optional Turnstile / hCaptcha enforcement when server secret keys are configured
  const prevTurnstileSite = config.checkoutShield.turnstileSiteKey;
  const prevTurnstileSecret = config.checkoutShield.turnstileSecretKey;
  const prevHcaptchaSite = config.checkoutShield.hcaptchaSiteKey;
  const prevHcaptchaSecret = config.checkoutShield.hcaptchaSecretKey;
  try {
    config.checkoutShield.turnstileSiteKey = '1x00000000000000000000AA';
    config.checkoutShield.turnstileSecretKey = 'test-turnstile-secret';
    const tsCh = await j(await fetch(`${base}/api/payments/challenge`));
    assert.equal(tsCh.captchaProvider, 'turnstile');
    assert.equal(tsCh.turnstileSiteKey, '1x00000000000000000000AA');

    const noCap = await order(bd({ trxId: 'NOCAP00001' }));
    assert.equal(noCap.status, 400);
    assert.equal(noCap.body.error.code, 'captcha_required');

    config.checkoutShield.turnstileSiteKey = '';
    config.checkoutShield.turnstileSecretKey = '';
    config.checkoutShield.hcaptchaSiteKey = '10000000-ffff-ffff-ffff-000000000001';
    config.checkoutShield.hcaptchaSecretKey = 'test-hcaptcha-secret';
    const hcCh = await j(await fetch(`${base}/api/payments/challenge`));
    assert.equal(hcCh.captchaProvider, 'hcaptcha');
    assert.equal(hcCh.hcaptchaSiteKey, '10000000-ffff-ffff-ffff-000000000001');

    const noHCap = await order(bd({ trxId: 'NOCAP00002' }));
    assert.equal(noHCap.status, 400);
    assert.equal(noHCap.body.error.code, 'captcha_required');
  } finally {
    config.checkoutShield.turnstileSiteKey = prevTurnstileSite;
    config.checkoutShield.turnstileSecretKey = prevTurnstileSecret;
    config.checkoutShield.hcaptchaSiteKey = prevHcaptchaSite;
    config.checkoutShield.hcaptchaSecretKey = prevHcaptchaSecret;
  }
});

test('backend AI payment verifier enforces receiving account match and recent payment timestamp', async () => {
  const { setAiPaymentVerifier } = await import('../src/verify.js');

  const submitProof = async (fields, seed = 77) => {
    const fd = new FormData();
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) fd.append(k, val);
    fd.append('screenshot', new Blob([makePng(400, 400, seed)], { type: 'image/png' }), `receipt-${seed}.png`);
    const r = await fetch(base + '/api/payments/submit', { method: 'POST', body: fd });
    return { status: r.status, body: await r.json() };
  };

  try {
    // 1. Wrong receiving account -> needs_review (ai_recipient_mismatch), NO code issued
    setAiPaymentVerifier(async () => ({
      model: 'gemini-4-hydrogen',
      hasDocument: true,
      isPaymentDocument: true,
      detectedChannel: 'bkash',
      channelMatchesSelected: true,
      extractedTrxId: 'BKWRREC991',
      trxIdMatchesInput: true,
      trxIdLooksReal: true,
      trxIdSimilarityScore: 92,
      extractedAmount: 110,
      extractedCurrency: 'BDT',
      extractedRecipient: '01999999999',
      recipientMatchesAccount: false,
      extractedTimestamp: new Date().toISOString(),
      timestampLooksRecent: true,
      paymentStatusSuccessful: true,
      appearsAuthenticAndUnedited: true,
      overallSimilarityScore: 90,
      verdict: 'verify',
      reasonCode: 'ai_verified',
      summary: 'Receipt sent to another number.',
    }));
    const recErr = await submitProof(bd({ plan: '1m', trxId: 'BKWRREC991', email: 'ai-wrong-rec@gmail.com' }), 77);
    assert.equal(recErr.status, 201);
    assert.equal(recErr.body.status, 'needs_review');
    assert.equal(recErr.body.reason, 'ai_recipient_mismatch');
    assert.equal(activationMailsTo('ai-wrong-rec@gmail.com').length, 0);

    // 2. Old / stale receipt timestamp -> needs_review (payment_too_old), NO code issued
    setAiPaymentVerifier(async () => ({
      model: 'gemini-4-hydrogen',
      hasDocument: true,
      isPaymentDocument: true,
      detectedChannel: 'bkash',
      channelMatchesSelected: true,
      extractedTrxId: 'BKOLDTM991',
      trxIdMatchesInput: true,
      trxIdLooksReal: true,
      trxIdSimilarityScore: 92,
      extractedAmount: 110,
      extractedCurrency: 'BDT',
      extractedRecipient: '01810853282',
      recipientMatchesAccount: true,
      extractedTimestamp: '2025-01-01 10:00',
      timestampLooksRecent: false,
      paymentStatusSuccessful: true,
      appearsAuthenticAndUnedited: true,
      overallSimilarityScore: 90,
      verdict: 'verify',
      reasonCode: 'ai_verified',
      summary: 'Receipt date is too old.',
    }));
    const timeErr = await submitProof(bd({ plan: '1m', trxId: 'BKOLDTM991', email: 'ai-old-time@gmail.com' }), 78);
    assert.equal(timeErr.status, 201);
    assert.equal(timeErr.body.status, 'needs_review');
    assert.equal(timeErr.body.reason, 'payment_too_old');
    assert.equal(activationMailsTo('ai-old-time@gmail.com').length, 0);
  } finally {
    setAiPaymentVerifier(null);
  }
});

test('admin mail health, SMTP verification diagnostics, and outbox flush endpoints report real status', async () => {
  const stats = await j(await fetch(`${base}/api/admin/stats`, { headers: ADMIN }));
  assert.ok(stats.mail);
  assert.equal(stats.mail.mode, 'json');
  assert.equal(stats.mail.smtpConfigured, false);

  const outbox = await j(await fetch(`${base}/api/admin/outbox`, { headers: ADMIN }));
  assert.ok(outbox.mail);
  assert.equal(outbox.mail.mode, 'json');

  const verifyRes = await fetch(`${base}/api/admin/mail/verify`, {
    method: 'POST',
    headers: { ...ADMIN, 'content-type': 'application/json' },
    body: JSON.stringify({ sendTest: false }),
  });
  assert.equal(verifyRes.status, 400);
  const verifyBody = await verifyRes.json();
  assert.equal(verifyBody.ok, false);
  assert.equal(verifyBody.code, 'smtp_not_configured');

  const flushRes = await fetch(`${base}/api/admin/mail/flush`, {
    method: 'POST',
    headers: { ...ADMIN, 'content-type': 'application/json' },
  });
  assert.equal(flushRes.status, 200);
  const flushBody = await flushRes.json();
  assert.equal(flushBody.ok, true);
  assert.ok(flushBody.mail);
});


