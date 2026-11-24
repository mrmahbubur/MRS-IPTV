import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import fs from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

import { config, PLANS, CHANNELS, PLAN_IDS } from './config.js';
import { getTrustedClientIp } from './clientIp.js';
import { get, all, run, nowIso, audit } from './db.js';
import { createOrder, getOrderByPublicId, listOrders, publicOrder, ApiError } from './orders.js';
import { approveManually, rejectManually, verifyOrder, reconcilePending, expireOld } from './verify.js';
import {
  redeem,
  activatePass,
  getEntitlementStatus,
  removeRegisteredDevice,
  checkEntitlement,
  resetDevice,
  claimOrderVip,
  checkActivationLockout,
  recordActivationAttempt,
} from './redeem.js';
import { ingestSms, ingestEmail, pollBinance, addLedger, addManualLedger, listLedger } from './ledger.js';
import { processOutbox, requeueEmail, getMailHealth, verifySmtpConnection } from './mailer.js';
import { issueCheckoutChallenge, verifyCheckoutSubmission } from './checkoutShield.js';
import { generateCodes, stock } from './codes.js';
import { createInternalRouter } from './internal.js';
import { createApiKey, listApiKeys, revokeApiKey } from './apiKeys.js';
import { verifyBinanceWebhook } from './providers/binance.js';
import { verifySkrillWebhook } from './providers/skrill.js';
import { verifyBkashWebhook } from './providers/bkash.js';
import { verifyNagadWebhook } from './providers/nagad.js';
import { verifyPayoneerWebhook } from './providers/payoneer.js';
import { normalizeEmail } from './validators.js';

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

const verifyWebhookHmac = (rawBody, headerSig, secret) => {
  if (!secret || !headerSig) return false;
  const clean = String(headerSig).replace(/^sha256=/i, '').trim().toLowerCase();
  const expect = createHmac('sha256', secret).update(Buffer.isBuffer(rawBody) ? rawBody : String(rawBody || '')).digest('hex').toLowerCase();
  return safeEqual(clean, expect);
};

const bearer = (req) =>
  (req.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
  req.get('x-admin-token') ||
  req.get('x-ingest-key') ||
  '';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function buildPaymentMethodsPayload() {
  const acc = config.receivingAccounts;
  return [
    {
      id: 'bkash',
      name: 'bKash Personal',
      currency: 'BDT',
      regions: ['BD'],
      accountLabel: 'bKash Personal Number',
      account: acc.bkash.account,
      accountType: acc.bkash.accountType,
      referenceHint: 'VIP',
      instructionsEn: [
        `Open bKash App or dial *247# and choose "Send Money".`,
        `Send exact BDT amount to ${acc.bkash.account}.`,
        `Copy your 10-character bKash TrxID and submit the form below.`,
      ],
      instructionsBn: [
        `বিকাশ অ্যাপ বা *২৪৭# ডায়াল করে "Send Money" সিলেক্ট করুন।`,
        `${acc.bkash.account} নম্বরে সঠিক পরিমাণ টাকা (BDT) সেন্ড মানি করুন।`,
        `১০ অক্ষরের TrxID কপি করে নিচের ফর্মে জমা দিন।`,
      ],
    },
    {
      id: 'nagad',
      name: 'Nagad Personal',
      currency: 'BDT',
      regions: ['BD'],
      accountLabel: 'Nagad Personal Number',
      account: acc.nagad.account,
      accountType: acc.nagad.accountType,
      referenceHint: 'VIP',
      instructionsEn: [
        `Open Nagad App or dial *167# and select "Send Money".`,
        `Send exact BDT amount to ${acc.nagad.account}.`,
        `Enter your Nagad TxnID in the form below and submit.`,
      ],
      instructionsBn: [
        `নগদ অ্যাপ বা *১৬৭# ডায়াল করে "Send Money" সিলেক্ট করুন।`,
        `${acc.nagad.account} নম্বরে সঠিক পরিমাণ টাকা পাঠান।`,
        `আপনার নগদ TxnID দিয়ে নিচের ফর্মে জমা দিন।`,
      ],
    },
    {
      id: 'binance',
      name: 'Binance Pay',
      currency: 'USD',
      regions: ['BD', 'INTL'],
      accountLabel: 'Binance Pay UID & ID',
      account: acc.binance.uid,
      secondaryAccount: acc.binance.payId,
      accountType: acc.binance.accountType,
      instructionsEn: [
        `Open Binance App → Binance Pay → Send.`,
        `Send exact USDT/FDUSD/USDC to UID ${acc.binance.uid} (Pay ID: ${acc.binance.payId}).`,
        `Enter your Binance Pay Order ID below for verification.`,
      ],
      instructionsBn: [
        `Binance অ্যাপ থেকে Binance Pay → Send অপশনে যান।`,
        `UID ${acc.binance.uid} (Pay ID: ${acc.binance.payId})-এ সঠিক পরিমাণ USDT পাঠান।`,
        `Binance Pay Order ID নিচে সাবমিট করুন।`,
      ],
    },
    {
      id: 'skrill',
      name: 'Skrill',
      currency: 'USD',
      regions: ['INTL'],
      accountLabel: 'Skrill Customer ID',
      account: acc.skrill.account,
      accountType: acc.skrill.accountType,
      instructionsEn: [
        `Log into Skrill and choose Money Transfer.`,
        `Send exact USD amount to Skrill ID ${acc.skrill.account}.`,
        `Paste the numeric Skrill Transaction ID below.`,
      ],
      instructionsBn: [
        `Skrill অ্যাকাউন্ট থেকে Money Transfer-এ যান।`,
        `Skrill ID ${acc.skrill.account}-এ সঠিক USD পাঠান।`,
        `ট্রানজেকশন আইডি নিচে জমা দিন।`,
      ],
    },
    {
      id: 'payoneer',
      name: 'Payoneer',
      currency: 'USD',
      regions: ['INTL'],
      accountLabel: 'Payoneer Customer ID',
      account: acc.payoneer.account,
      accountType: acc.payoneer.accountType,
      instructionsEn: [
        `Log into Payoneer → Pay → Make a Payment.`,
        `Send exact USD amount to Customer ID ${acc.payoneer.account}.`,
        `Submit your Payoneer Payment ID and optional screenshot below.`,
      ],
      instructionsBn: [
        `Payoneer থেকে Make a Payment সিলেক্ট করুন।`,
        `Customer ID ${acc.payoneer.account}-এ সঠিক USD পাঠান।`,
        `Payment ID ও স্ক্রিনশট সহ নিচে জমা দিন।`,
      ],
    },
  ];
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const ok = config.siteOrigins.includes(origin) || (!config.production && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
      cb(null, ok);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({
    limit: '250kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxScreenshotBytes, files: 1, fields: 24 } });
  const limiter = (windowMs, max, extra = {}) => rateLimit({
    windowMs, limit: max, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getTrustedClientIp(req)),
    message: { error: { code: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.' } }, ...extra,
  });

  // ------------------------------ public ----------------------------------
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: nowIso() }));

  app.get('/api/plans', (_req, res) => res.json({
    plans: Object.values(PLANS),
    channels: Object.values(CHANNELS).map(({ id, label, currency, regions }) => ({ id, label, currency, regions })),
  }));

  app.get('/api/payment-methods', (_req, res) => res.json({
    ok: true,
    methods: buildPaymentMethodsPayload(),
    support: {
      whatsapp: config.brand.supportWhatsApp,
      telegram: config.brand.supportTelegram,
      facebook: config.brand.supportFacebook,
      email: config.mail.adminEmail,
    },
  }));

  app.get('/api/payments/challenge', limiter(60_000, 120), (_req, res) => {
    res.set('Cache-Control', 'no-store').json(issueCheckoutChallenge());
  });

  const submitOrderHandler = wrap(async (req, res) => {
    const clientIp = getTrustedClientIp(req);
    const shield = await verifyCheckoutSubmission(req.body || {}, clientIp);
    if (!shield.ok) {
      audit('shield', 'checkout_blocked', null, { code: shield.code, ip: clientIp });
      return res.status(shield.status || 400).json({
        error: {
          code: shield.code,
          message: shield.message,
        },
      });
    }
    const { order, created } = await createOrder(req.body || {}, req.file, { ip: clientIp, userAgent: req.get('user-agent') });
    res.status(created ? 201 : 200).json(publicOrder(order));
  });

  app.post('/api/orders', limiter(3600_000, config.production ? 12 : 1000), upload.single('screenshot'), submitOrderHandler);
  app.post('/api/payments/submit', limiter(3600_000, config.production ? 12 : 1000), upload.single('screenshot'), submitOrderHandler);

  app.get('/api/orders/:id', limiter(60_000, 120), (req, res) => {
    const order = getOrderByPublicId(req.params.id);
    if (!order) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    res.json(publicOrder(order));
  });

  app.get('/api/orders/:ref/status', limiter(60_000, 120), (req, res) => {
    const order = getOrderByPublicId(req.params.ref);
    if (!order) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Order not found' } });
    const pub = publicOrder(order);
    const step = order.status === 'verified' ? 3 : order.status === 'needs_review' ? 2 : order.status === 'pending' ? 1 : 0;
    res.json({ ok: true, step, ...pub });
  });

  app.post('/api/orders/:id/claim', limiter(60_000, 60), (req, res) => {
    const r = claimOrderVip({ orderId: req.params.id, deviceId: req.body?.deviceId });
    if (!r.ok) return res.status(r.status).json({ error: { code: r.code, message: r.message } });
    const { ok, ...rest } = r;
    res.json(rest);
  });

  app.post('/api/redeem', limiter(15 * 60_000, config.production ? 10 : 1000, { skipSuccessfulRequests: true }), (req, res) => {
    const lockKey = `${getTrustedClientIp(req)}:redeem`;
    const lock = checkActivationLockout(lockKey);
    if (lock.blocked) {
      return res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: `Too many failed attempts. Try again in ${lock.retryAfterSeconds}s.` } });
    }
    const r = redeem({ code: req.body?.code, deviceId: req.body?.deviceId });
    recordActivationAttempt(lockKey, r.ok);
    if (!r.ok) return res.status(r.status).json({ error: { code: r.code, friendlyCode: r.friendlyCode, message: r.message } });
    const { ok, ...rest } = r;
    res.json(rest);
  });

  app.post('/api/activate', limiter(15 * 60_000, config.production ? 12 : 1000, { skipSuccessfulRequests: true }), (req, res) => {
    const lockKey = `${getTrustedClientIp(req)}:${String(req.body?.email || '').toLowerCase()}`;
    const lock = checkActivationLockout(lockKey);
    if (lock.blocked) {
      return res.status(429).json({ ok: false, error: { code: 'TOO_MANY_ATTEMPTS', message: `Too many failed code attempts. Try again in ${lock.retryAfterSeconds}s.` } });
    }
    const r = activatePass({
      code: req.body?.code,
      email: req.body?.email,
      deviceId: req.body?.deviceId,
      deviceLabel: req.body?.deviceLabel || req.get('user-agent')?.slice(0, 48),
    });
    recordActivationAttempt(lockKey, r.ok);
    if (!r.ok) return res.status(r.status).json({ ok: false, error: { code: r.code, message: r.message } });
    res.json({ ok: true, data: r, ...r });
  });

  app.get('/api/status', limiter(60_000, 120), (req, res) => {
    const token = bearer(req) || String(req.query.token || '');
    const deviceId = String(req.get('x-device-id') || req.query.deviceId || '');
    const r = getEntitlementStatus({ token, deviceId });
    if (!r.ok) return res.status(r.status).json({ ok: false, active: false, error: { code: r.code, message: r.message } });
    res.json({ ok: true, data: r, ...r });
  });

  app.post('/api/entitlement', limiter(60_000, 120), (req, res) => {
    const r = checkEntitlement({ token: req.body?.token || bearer(req), deviceId: req.body?.deviceId });
    if (!r.ok) return res.status(r.status).json({ active: false, error: { code: r.code, message: r.message } });
    const { ok, ...rest } = r;
    res.json(rest);
  });

  app.post('/api/devices/remove', limiter(60_000, 30), (req, res) => {
    const token = bearer(req) || req.body?.token;
    const r = removeRegisteredDevice({ token, deviceHash: req.body?.deviceHash, deviceId: req.body?.deviceId });
    if (!r.ok) return res.status(r.status).json({ ok: false, error: { code: r.code, message: r.message } });
    res.json({ ok: true, data: r });
  });

  app.post('/api/support/contact', limiter(3600_000, config.production ? 8 : 200), (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const emailCheck = normalizeEmail(req.body?.email);
    const subject = String(req.body?.subject || 'General Support').trim().slice(0, 120);
    const message = String(req.body?.message || '').trim().slice(0, 2000);
    if (!name || !emailCheck.ok || message.length < 10) {
      return res.status(400).json({ ok: false, error: { code: 'validation_failed', message: 'Please enter your name, a valid email, and a message (10+ characters).' } });
    }
    const ins = run(
      `INSERT INTO support_messages(name, email, subject, message, status, ip, created_at) VALUES (?,?,?,?,'open',?,?)`,
      name, emailCheck.value, subject, message, getTrustedClientIp(req) || null, nowIso()
    );
    audit('user', 'support_contact', null, { id: Number(ins.lastInsertRowid), email: emailCheck.value, subject });
    res.status(201).json({ ok: true, data: { ticketId: Number(ins.lastInsertRowid), message: 'Support inquiry received. Our team will reply shortly.' } });
  });

  // ------------------------------ ingest & webhooks ------------------------
  const ingestAuth = (req, res, next) => {
    const tok = bearer(req);
    const sig = req.get('x-webhook-signature') || req.get('x-signature');
    if (safeEqual(tok, config.ingestKey) || safeEqual(tok, config.smsWebhookSecret)) return next();
    if (sig && verifyWebhookHmac(req.rawBody || JSON.stringify(req.body || {}), sig, config.smsWebhookSecret)) return next();
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Bad ingest key or HMAC signature' } });
  };

  const handleSms = (req, res) => {
    const { from, sender, body, message, text, receivedAt } = req.body || {};
    const resolvedFrom = from || sender;
    const resolvedBody = body || message || text;
    if (!resolvedFrom || !resolvedBody) return res.status(400).json({ error: { code: 'bad_request', message: 'from and body are required' } });
    const r = ingestSms({ from: resolvedFrom, body: resolvedBody, receivedAt });
    res.status(r.ok ? 200 : r.code === 'untrusted_sender' ? 403 : 422).json(r);
  };

  app.post('/api/ingest/sms', limiter(60_000, 120), ingestAuth, handleSms);
  app.post('/api/webhooks/sms', limiter(60_000, 120), ingestAuth, handleSms);

  app.post('/api/ingest/email', limiter(60_000, 120), ingestAuth, (req, res) => {
    const { from, subject, body, receivedAt, dkimPass } = req.body || {};
    if (!from || !body) return res.status(400).json({ error: { code: 'bad_request', message: 'from and body are required' } });
    const r = ingestEmail({ from, subject, body, receivedAt, dkimPass: dkimPass === true });
    res.status(r.ok ? 200 : r.code === 'unparsed' ? 422 : 403).json(r);
  });

  const handleProviderWebhook = (providerName, verifier) => (req, res) => {
    const r = verifier(req.headers, req.rawBody || JSON.stringify(req.body || {}), req.body || {});
    if (!r.ok) {
      audit('webhook', `${providerName}_rejected`, null, { code: r.code, ip: getTrustedClientIp(req) });
      const status = r.code === 'provider_disabled' ? 501 : r.code === 'invalid_payload' ? 400 : 401;
      return res.status(status).json({ ok: false, error: { code: r.code, message: r.message } });
    }
    if (r.ignored) return res.json({ ok: true, ignored: true, reason: r.reason });
    const added = addLedger(r.entry, `${providerName}_webhook`, JSON.stringify(req.body || {}));
    if (!added.duplicate) reconcilePending();
    res.json({ ok: true, duplicate: added.duplicate, trxId: r.entry.trxId });
  };

  app.post('/api/webhooks/binance', limiter(60_000, 120), handleProviderWebhook('binance', (h, raw) => verifyBinanceWebhook(h, raw)));
  app.post('/api/webhooks/skrill', limiter(60_000, 120), handleProviderWebhook('skrill', (_h, _raw, body) => verifySkrillWebhook(body)));
  app.post('/api/webhooks/bkash', limiter(60_000, 120), handleProviderWebhook('bkash', verifyBkashWebhook));
  app.post('/api/webhooks/nagad', limiter(60_000, 120), handleProviderWebhook('nagad', verifyNagadWebhook));
  app.post('/api/webhooks/payoneer', limiter(60_000, 120), handleProviderWebhook('payoneer', verifyPayoneerWebhook));

  // ------------------------------- admin ----------------------------------
  const admin = express.Router();
  admin.use(limiter(60_000, 120));
  admin.use((req, res, next) => (safeEqual(bearer(req), config.adminToken) ? next() : res.status(401).json({ error: { code: 'unauthorized', message: 'Admin token required' } })));

  admin.get('/stats', (_req, res) => res.json({
    orders: Object.fromEntries(all('SELECT status, COUNT(*) n FROM orders GROUP BY status').map((r) => [r.status, r.n])),
    stock: stock(),
    outbox: Object.fromEntries(all('SELECT status, COUNT(*) n FROM email_outbox GROUP BY status').map((r) => [r.status, r.n])),
    unclaimedPayments: get('SELECT COUNT(*) n FROM ledger WHERE claimed_by_order IS NULL').n,
    mail: getMailHealth(),
  }));

  admin.get('/outbox', (req, res) => {
    const limit = Math.min(+req.query.limit || 50, 200);
    const rows = all('SELECT id, order_id, to_email, mail_kind, subject, status, attempts, last_error, sent_at, created_at FROM email_outbox ORDER BY id DESC LIMIT ?', limit);
    res.json({ emails: rows, mail: getMailHealth() });
  });

  admin.post('/mail/verify', wrap(async (req, res) => {
    const testRecipient = req.body?.sendTest ? (String(req.body?.to || '').trim() || config.mail.adminEmail) : null;
    const result = await verifySmtpConnection(testRecipient);
    res.status(result.ok ? 200 : 400).json(result);
  }));

  admin.post('/mail/flush', wrap(async (_req, res) => {
    run("UPDATE email_outbox SET status='queued', next_attempt_at=? WHERE status='failed'", nowIso());
    const sent = await processOutbox();
    res.json({ ok: true, sent, mail: getMailHealth() });
  }));

  admin.get('/codes/stats', (_req, res) => res.json({ ok: true, stock: stock(), threshold: config.lowStockThreshold }));

  admin.get('/revenue', (_req, res) => {
    const byPlan = all("SELECT plan, currency, COUNT(*) AS orders, SUM(expected_minor) AS total_minor FROM orders WHERE status='verified' GROUP BY plan, currency");
    const byMethod = all("SELECT channel, currency, COUNT(*) AS orders, SUM(expected_minor) AS total_minor FROM orders WHERE status='verified' GROUP BY channel, currency");
    const byDay = all("SELECT substr(COALESCE(verified_at, created_at), 1, 10) AS day, currency, COUNT(*) AS orders, SUM(expected_minor) AS total_minor FROM orders WHERE status='verified' GROUP BY day, currency ORDER BY day DESC LIMIT 30");
    res.json({ ok: true, byPlan, byMethod, byDay });
  });

  admin.get('/audit', (req, res) => {
    const limit = Math.min(+req.query.limit || 100, 300);
    const rows = all('SELECT id, at, actor, action, order_id, detail FROM audit_log ORDER BY id DESC LIMIT ?', limit);
    res.json({ ok: true, logs: rows });
  });

  admin.get('/orders', (req, res) => res.json(listOrders({
    status: req.query.status,
    q: req.query.q,
    limit: Math.min(+req.query.limit || 50, 200),
    offset: +req.query.offset || 0,
  })));
  admin.get('/orders/:id', (req, res) => {
    const o = get('SELECT * FROM orders WHERE id=? OR public_id=?', +req.params.id || -1, req.params.id);
    if (!o) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    const { screenshot_path, ...rest } = o;
    res.json({ ...rest, has_screenshot: !!screenshot_path, ledger: o.ledger_id ? get('SELECT * FROM ledger WHERE id=?', o.ledger_id) : null,
      audit: all('SELECT at, actor, action, detail FROM audit_log WHERE order_id=? ORDER BY id', o.id) });
  });
  admin.get('/orders/:id/screenshot', (req, res) => {
    const o = get('SELECT screenshot_path FROM orders WHERE id=?', +req.params.id);
    if (!o?.screenshot_path || !fs.existsSync(o.screenshot_path)) return res.status(404).end();
    res.set('Cache-Control', 'no-store').sendFile(fs.realpathSync(o.screenshot_path));
  });
  const orderId = (req) => get('SELECT id FROM orders WHERE id=? OR public_id=?', +req.params.id || -1, req.params.id)?.id;
  admin.post('/orders/:id/approve', (req, res) => {
    const id = orderId(req); if (!id) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    res.json(publicOrder(approveManually(id, { ledgerId: req.body?.ledgerId, note: req.body?.note })));
  });
  admin.post('/orders/:id/reject', (req, res) => {
    const id = orderId(req); if (!id) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    res.json(publicOrder(rejectManually(id, { reason: req.body?.reason })));
  });
  admin.post('/orders/:id/recheck', (req, res) => {
    const id = orderId(req); if (!id) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    res.json(publicOrder(verifyOrder(id, { force: true })));
  });
  admin.post('/orders/:id/resend', wrap(async (req, res) => {
    const id = orderId(req);
    if (!id || !requeueEmail(id)) return res.status(409).json({ error: { code: 'not_verified', message: 'Only verified orders can be re-sent' } });
    await processOutbox();
    res.json({ ok: true });
  }));

  admin.get('/ledger', (req, res) => res.json(listLedger({ claimed: req.query.claimed === undefined ? undefined : req.query.claimed === '1', limit: Math.min(+req.query.limit || 100, 500) })));
  admin.post('/ledger', (req, res) => {
    const b = req.body || {};
    if (!CHANNELS[b.channel] || !b.trxId || !(+b.amount > 0)) return res.status(400).json({ error: { code: 'bad_request', message: 'channel, trxId and amount are required' } });
    const r = addManualLedger({ channel: b.channel, trxId: b.trxId, amountMinor: Math.round(+b.amount * 100), currency: (b.currency || CHANNELS[b.channel].currency).toUpperCase(),
      sender: b.sender ?? null, receivedAt: b.receivedAt ? new Date(b.receivedAt).toISOString() : nowIso() });
    res.status(r.duplicate ? 200 : 201).json({ duplicate: r.duplicate, id: r.row.id });
  });

  admin.post('/codes/generate', (req, res) => {
    const { plan, count } = req.body || {};
    if (!PLAN_IDS.includes(plan) || !(count >= 1 && count <= 5000)) return res.status(400).json({ error: { code: 'bad_request', message: `plan (${PLAN_IDS.join('/')}) and count (1-5000) required` } });
    generateCodes(plan, count, `admin-${Date.now()}`);
    audit('admin', 'codes_generated', null, { plan, count });
    res.status(201).json({ created: count, stock: stock() });
  });
  admin.get('/codes/export', (req, res) => {
    const { plan, status = 'available' } = req.query;
    const rows = all(`SELECT code, plan, status, batch FROM codes WHERE status=? ${plan ? 'AND plan=?' : ''} ORDER BY id`, status, ...(plan ? [plan] : []));
    res.type('text/csv').send(['code,plan,months,status,batch', ...rows.map((r) => `${r.code},${r.plan},${PLANS[r.plan].months},${r.status},${r.batch ?? ''}`)].join('\n'));
  });
  admin.post('/codes/:code/reset-device', (req, res) => {
    const row = resetDevice(String(req.params.code));
    if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'Code not found' } });
    res.json({ ok: true, status: row.status });
  });
  admin.post('/codes/:code/revoke', (req, res) => {
    const r = get('SELECT id, order_id FROM codes WHERE code=?', String(req.params.code));
    if (!r) return res.status(404).json({ error: { code: 'not_found', message: 'Code not found' } });
    run("UPDATE codes SET status='revoked' WHERE id=?", r.id);
    audit('admin', 'code_revoked', r.order_id, { code: `…${String(req.params.code).slice(-4)}` });
    res.json({ ok: true });
  });

  admin.get('/api-keys', (_req, res) => res.json({ keys: listApiKeys() }));
  admin.post('/api-keys', (req, res) => {
    const { name, scopes } = req.body || {};
    if (!name) return res.status(400).json({ error: { code: 'bad_request', message: 'name is required' } });
    const key = createApiKey(name, scopes);
    res.status(201).json(key);
  });
  admin.post('/api-keys/:id/revoke', (req, res) => {
    const revoked = revokeApiKey(req.params.id);
    if (!revoked) return res.status(404).json({ error: { code: 'not_found', message: 'Key not found' } });
    res.json({ ok: true, revoked });
  });

  app.use('/api/admin', admin);
  app.use('/api/internal', createInternalRouter());

  // ------------------------------ errors ----------------------------------
  app.use((req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found' } }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    if (err?.name === 'MulterError') return res.status(400).json({ error: { code: 'upload_failed', message: err.code === 'LIMIT_FILE_SIZE' ? 'Screenshot is too large (max 3 MB)' : 'Upload failed', fields: { screenshot: 'Upload failed' } } });
    if (err?.status && err.status < 500) return res.status(err.status).json({ error: { code: 'bad_request', message: err.message } });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'bad_json', message: 'Invalid JSON' } });
    console.error('[error]', err);
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
  });
  return app;
}

/** Background jobs: reconcile, expire, poll Binance, deliver e-mail. */
export function startJobs() {
  const every = (ms, fn, label) => setInterval(async () => { try { await fn(); } catch (e) { console.error(`[job:${label}]`, e.message); } }, ms).unref();
  every(30_000, () => { reconcilePending(); expireOld(); }, 'reconcile');
  every(20_000, () => processOutbox(), 'outbox');
  if (config.binance.key && config.binance.secret) every(config.binance.pollSeconds * 1000, () => pollBinance(), 'binance');
  else console.warn('[binance] BINANCE_API_KEY/SECRET not set – Binance Pay orders will wait for manual ledger entry');
}

const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectMain = entryArg.endsWith(`${path.sep}mrs-iptv-backend${path.sep}src${path.sep}server.js`);

if (isDirectMain) {
  const app = createApp();
  const have = stock();
  const total = PLAN_IDS.reduce((n, p) => n + have[p].available, 0);
  if (!total) console.warn(`[codes] No unused codes in the database. Run: node scripts/generate-codes.js 1200`);
  startJobs();
  app.listen(config.port, config.host, () => console.log(`M R S payment backend listening on :${config.port} (${config.production ? 'production' : 'development'})`));
}
