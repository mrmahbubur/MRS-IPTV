import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Import from the payment backend engine
import { config, PLANS, CHANNELS, PLAN_IDS } from './mrs-iptv-backend/src/config.js';
import { get, all, run, nowIso, tx, db, audit } from './mrs-iptv-backend/src/db.js';
import { createOrder, getOrderByPublicId, listOrders, publicOrder } from './mrs-iptv-backend/src/orders.js';
import { approveManually, rejectManually, verifyOrder, verifyOrderWithAi, setAiPaymentVerifier, hasAiPaymentVerifier, reconcilePending, reconcileAiPending, expireOld, triggerDelayedActivations } from './mrs-iptv-backend/src/verify.js';
import { verifyPaymentWithAi } from './aiPaymentVerifier.js';
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
} from './mrs-iptv-backend/src/redeem.js';
import { ingestSms, ingestEmail, pollBinance, addLedger, addManualLedger, listLedger } from './mrs-iptv-backend/src/ledger.js';
import { processOutbox, requeueEmail, getMailHealth, verifySmtpConnection } from './mrs-iptv-backend/src/mailer.js';
import { issueCheckoutChallenge, verifyCheckoutSubmission } from './mrs-iptv-backend/src/checkoutShield.js';
import { generateCodes, ensureStock, stock } from './mrs-iptv-backend/src/codes.js';
import { createInternalRouter } from './mrs-iptv-backend/src/internal.js';
import { createApiKey, listApiKeys, revokeApiKey } from './mrs-iptv-backend/src/apiKeys.js';
import { buildPaymentMethodsPayload } from './mrs-iptv-backend/src/server.js';
import { verifyBinanceWebhook } from './mrs-iptv-backend/src/providers/binance.js';
import { verifySkrillWebhook } from './mrs-iptv-backend/src/providers/skrill.js';
import { verifyBkashWebhook } from './mrs-iptv-backend/src/providers/bkash.js';
import { verifyNagadWebhook } from './mrs-iptv-backend/src/providers/nagad.js';
import { verifyPayoneerWebhook } from './mrs-iptv-backend/src/providers/payoneer.js';
import { normalizeEmail } from './mrs-iptv-backend/src/validators.js';
import { adminAuth } from '../src/lib/firebase-admin.js';

const safeEqual = (a: any, b: any) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

const verifyWebhookHmac = (rawBody: any, headerSig: any, secret: string) => {
  if (!secret || !headerSig) return false;
  const clean = String(headerSig).replace(/^sha256=/i, '').trim().toLowerCase();
  const expect = createHmac('sha256', secret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : String(rawBody || ''))
    .digest('hex')
    .toLowerCase();
  return safeEqual(clean, expect);
};

const bearer = (req: Request) =>
  (req.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
  (req.get('x-admin-token') as string) ||
  (req.get('x-ingest-key') as string) ||
  '';

const wrap = (fn: any) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch((err: any) => {
    if (err && typeof err.status === 'number') {
      return res.status(err.status).json({
        error: {
          code: err.code || 'bad_request',
          message: err.message || 'Validation error',
          fields: err.fields || null,
        },
      });
    }
    if (err?.name === 'MulterError') {
      return res.status(400).json({
        error: {
          code: 'upload_failed',
          message: err.code === 'LIMIT_FILE_SIZE' ? 'Screenshot is too large (max 3 MB)' : 'Upload failed',
          fields: { screenshot: 'Upload failed' },
        },
      });
    }
    next(err);
  });

export function createPaymentRouter(options: { channelLookup?: (targetUrl: string) => boolean } = {}) {
  const router = express.Router();

  if (process.env.NODE_ENV !== 'test') {
    setAiPaymentVerifier(verifyPaymentWithAi);
  }

  // Auto-ensure minimum 1200 available codes per plan on boot
  try {
    const created = ensureStock(1200, `boot-${Date.now()}`);
    const totalCreated = Object.values(created).reduce((s: number, arr: any) => s + arr.length, 0);
    if (totalCreated > 0) {
      console.log(`[Payment] Topped up ${totalCreated} activation codes (1200+ target per plan).`);
    }
  } catch (err: any) {
    console.error('[Payment] Code stock initialization error:', err?.message || err);
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxScreenshotBytes, files: 1, fields: 24 },
  });

  const limiter = (windowMs: number, max: number, extra: Record<string, any> = {}) =>
    rateLimit({
      windowMs,
      limit: max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.' } },
      ...extra,
    });

  // -------------------------------------------------------------------------
  // 1. PUBLIC PAYMENT, ORDER, ACTIVATION & ACCOUNT ENDPOINTS
  // -------------------------------------------------------------------------
  router.get('/health', (_req, res) => res.json({ ok: true, time: nowIso(), stock: stock() }));

  router.get('/plans', (_req, res) =>
    res.json({
      plans: Object.values(PLANS),
      channels: Object.values(CHANNELS).map(({ id, label, currency, regions }: any) => ({
        id,
        label,
        currency,
        regions,
      })),
    })
  );

  router.get('/payment-methods', (_req, res) =>
    res.json({
      ok: true,
      methods: buildPaymentMethodsPayload(),
      support: {
        whatsapp: config.brand.supportWhatsApp,
        telegram: config.brand.supportTelegram,
        facebook: config.brand.supportFacebook,
        email: config.mail.adminEmail,
      },
    })
  );

  router.get('/payments/challenge', limiter(60_000, 120), (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store').json(issueCheckoutChallenge());
  });

  const submitOrderHandler = wrap(async (req: any, res: any) => {
    const shield = await verifyCheckoutSubmission(req.body || {}, req.ip || '');
    if (!shield.ok) {
      audit('shield', 'checkout_blocked', null, { code: shield.code, ip: req.ip });
      return res.status(shield.status || 400).json({
        error: {
          code: shield.code,
          message: shield.message,
        },
      });
    }
    const { order, created } = await createOrder(req.body || {}, req.file, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(created ? 201 : 200).json(publicOrder(order));
  });

  router.post('/orders', limiter(3600_000, config.production ? 20 : 1000), upload.single('screenshot'), submitOrderHandler);
  router.post('/payments/submit', limiter(3600_000, config.production ? 20 : 1000), upload.single('screenshot'), submitOrderHandler);

  router.get('/orders/:id', limiter(60_000, 120), (req: Request, res: Response) => {
    const order = getOrderByPublicId(req.params.id);
    if (!order) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    res.json(publicOrder(order));
  });

  router.get('/orders/:ref/status', limiter(60_000, 120), (req: Request, res: Response) => {
    const order = getOrderByPublicId(req.params.ref);
    if (!order) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Order not found' } });
    const pub = publicOrder(order);
    const step = order.status === 'verified' ? 3 : order.status === 'needs_review' ? 2 : order.status === 'pending' ? 1 : 0;
    res.json({ ok: true, step, ...pub });
  });

  router.post('/orders/:id/claim', limiter(60_000, 60), (req: Request, res: Response) => {
    const r = claimOrderVip({ orderId: req.params.id, deviceId: req.body?.deviceId });
    if (!r.ok) return res.status(r.status).json({ error: { code: r.code, message: r.message } });
    const { ok, ...rest } = r;
    res.json(rest);
  });

  router.post('/redeem', limiter(15 * 60_000, config.production ? 12 : 1000, { skipSuccessfulRequests: true }), (req: Request, res: Response) => {
    const lockKey = `${req.ip}:redeem`;
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

  router.post('/activate', limiter(15 * 60_000, config.production ? 12 : 1000, { skipSuccessfulRequests: true }), (req: Request, res: Response) => {
    const lockKey = `${req.ip}:${String(req.body?.email || '').toLowerCase()}`;
    const lock = checkActivationLockout(lockKey);
    if (lock.blocked) {
      return res.status(429).json({ ok: false, error: { code: 'TOO_MANY_ATTEMPTS', message: `Too many failed attempts. Try again in ${lock.retryAfterSeconds}s.` } });
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

  router.get('/status', limiter(60_000, 120), (req: Request, res: Response) => {
    const token = bearer(req) || String(req.query.token || '');
    const deviceId = String(req.get('x-device-id') || req.query.deviceId || '');
    const r = getEntitlementStatus({ token, deviceId });
    if (!r.ok) return res.status(r.status).json({ ok: false, active: false, error: { code: r.code, message: r.message } });
    res.json({ ok: true, data: r, ...r });
  });

  router.post('/entitlement', limiter(60_000, 120), (req: Request, res: Response) => {
    const r = checkEntitlement({ token: req.body?.token || bearer(req), deviceId: req.body?.deviceId });
    if (!r.ok) return res.status(r.status).json({ active: false, error: { code: r.code, message: r.message } });
    const { ok, ...rest } = r;
    res.json(rest);
  });

  router.post('/devices/remove', limiter(60_000, 30), (req: Request, res: Response) => {
    const token = bearer(req) || req.body?.token;
    const r = removeRegisteredDevice({ token, deviceHash: req.body?.deviceHash, deviceId: req.body?.deviceId });
    if (!r.ok) return res.status(r.status).json({ ok: false, error: { code: r.code, message: r.message } });
    res.json({ ok: true, data: r });
  });

  router.post('/support/contact', limiter(3600_000, config.production ? 8 : 200), (req: Request, res: Response) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const emailCheck = normalizeEmail(req.body?.email);
    const subject = String(req.body?.subject || 'General Support').trim().slice(0, 120);
    const message = String(req.body?.message || '').trim().slice(0, 2000);
    if (!name || !emailCheck.ok || message.length < 10) {
      return res.status(400).json({ ok: false, error: { code: 'validation_failed', message: 'Please enter your name, a valid email, and a message (10+ characters).' } });
    }
    const ins = run(
      `INSERT INTO support_messages(name, email, subject, message, status, ip, created_at) VALUES (?,?,?,?,'open',?,?)`,
      name,
      emailCheck.value,
      subject,
      message,
      req.ip || null,
      nowIso()
    );
    audit('user', 'support_contact', null, { id: Number(ins.lastInsertRowid), email: emailCheck.value, subject });
    res.status(201).json({ ok: true, data: { ticketId: Number(ins.lastInsertRowid), message: 'Support inquiry received. Our team will reply shortly.' } });
  });

  // -------------------------------------------------------------------------
  // 2. INGEST & PROVIDER WEBHOOK ENDPOINTS
  // -------------------------------------------------------------------------
  const ingestAuth = (req: Request, res: Response, next: NextFunction) => {
    const tok = bearer(req);
    const sig = req.get('x-webhook-signature') || req.get('x-signature');
    if (safeEqual(tok, config.ingestKey) || safeEqual(tok, config.smsWebhookSecret)) return next();
    if (sig && verifyWebhookHmac((req as any).rawBody || JSON.stringify(req.body || {}), sig, config.smsWebhookSecret)) return next();
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Bad ingest key or HMAC signature' } });
  };

  const handleSms = (req: Request, res: Response) => {
    const { from, sender, body, message, text, receivedAt } = req.body || {};
    const resolvedFrom = from || sender;
    const resolvedBody = body || message || text;
    if (!resolvedFrom || !resolvedBody) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'from and body are required' } });
    }
    const r = ingestSms({ from: resolvedFrom, body: resolvedBody, receivedAt });
    res.status(r.ok ? 200 : r.code === 'untrusted_sender' ? 403 : 422).json(r);
  };

  router.post('/ingest/sms', ingestAuth, handleSms);
  router.post('/webhooks/sms', ingestAuth, handleSms);

  router.post('/ingest/email', ingestAuth, (req: Request, res: Response) => {
    const { from, subject, body, receivedAt, dkimPass } = req.body || {};
    if (!from || !body)
      return res.status(400).json({ error: { code: 'bad_request', message: 'from and body are required' } });
    const r = ingestEmail({ from, subject, body, receivedAt, dkimPass: dkimPass === true });
    res.status(r.ok ? 200 : r.code === 'unparsed' ? 422 : 403).json(r);
  });

  const handleProviderWebhook = (providerName: string, verifier: any) => (req: Request, res: Response) => {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body || {});
    const r = verifier(req.headers, rawBody, req.body || {});
    if (!r.ok) {
      audit('webhook', `${providerName}_rejected`, null, { code: r.code, ip: req.ip });
      const status = r.code === 'provider_disabled' ? 501 : r.code === 'invalid_payload' ? 400 : 401;
      return res.status(status).json({ ok: false, error: { code: r.code, message: r.message } });
    }
    if (r.ignored) return res.json({ ok: true, ignored: true, reason: r.reason });
    const added = addLedger(r.entry, `${providerName}_webhook`, JSON.stringify(req.body || {}));
    if (!added.duplicate) reconcilePending();
    res.json({ ok: true, duplicate: added.duplicate, trxId: r.entry.trxId });
  };

  router.post('/webhooks/binance', handleProviderWebhook('binance', (h: any, raw: any) => verifyBinanceWebhook(h, raw)));
  router.post('/webhooks/skrill', handleProviderWebhook('skrill', (_h: any, _raw: any, body: any) => verifySkrillWebhook(body)));
  router.post('/webhooks/bkash', handleProviderWebhook('bkash', verifyBkashWebhook));
  router.post('/webhooks/nagad', handleProviderWebhook('nagad', verifyNagadWebhook));
  router.post('/webhooks/payoneer', handleProviderWebhook('payoneer', verifyPayoneerWebhook));

  // -------------------------------------------------------------------------
  // 3. ADMIN MANAGEMENT ENDPOINTS
  // -------------------------------------------------------------------------
  const admin = express.Router();
  admin.use(async (req: Request, res: Response, next: NextFunction) => {
    const tok = bearer(req);
    if (tok && safeEqual(tok, config.adminToken)) return next();
    if (tok) {
      try {
        const decoded = await adminAuth.verifyIdToken(tok);
        const configuredAdminEmail = process.env.ADMIN_EMAIL || 'mr216873@gmail.com';
        const isAdmin = Boolean(decoded.admin) || (Boolean(decoded.email) && decoded.email!.toLowerCase() === configuredAdminEmail.toLowerCase());
        if (isAdmin) return next();
      } catch {}
    }
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Admin token required' } });
  });

  admin.get('/stats', (_req, res) =>
    res.json({
      orders: Object.fromEntries(all('SELECT status, COUNT(*) n FROM orders GROUP BY status').map((r: any) => [r.status, r.n])),
      stock: stock(),
      outbox: Object.fromEntries(all('SELECT status, COUNT(*) n FROM email_outbox GROUP BY status').map((r: any) => [r.status, r.n])),
      unclaimedPayments: get('SELECT COUNT(*) n FROM ledger WHERE claimed_by_order IS NULL').n,
      mail: getMailHealth(),
    })
  );

  admin.get('/codes/stats', (_req, res) => res.json({ ok: true, stock: stock(), threshold: config.lowStockThreshold }));

  admin.get('/revenue', (_req, res) => {
    const byPlan = all("SELECT plan, currency, COUNT(*) AS orders, SUM(expected_minor) AS total_minor FROM orders WHERE status='verified' GROUP BY plan, currency");
    const byMethod = all("SELECT channel, currency, COUNT(*) AS orders, SUM(expected_minor) AS total_minor FROM orders WHERE status='verified' GROUP BY channel, currency");
    const byDay = all("SELECT substr(COALESCE(verified_at, created_at), 1, 10) AS day, currency, COUNT(*) AS orders, SUM(expected_minor) AS total_minor FROM orders WHERE status='verified' GROUP BY day, currency ORDER BY day DESC LIMIT 30");
    res.json({ ok: true, byPlan, byMethod, byDay });
  });

  admin.get('/audit', (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const rows = all('SELECT id, at, actor, action, order_id, detail FROM audit_log ORDER BY id DESC LIMIT ?', limit);
    res.json({ ok: true, logs: rows });
  });

  admin.get('/orders', (req: Request, res: Response) =>
    res.json(
      listOrders({
        status: req.query.status as string,
        q: req.query.q as string,
        limit: Math.min(Number(req.query.limit) || 50, 200),
        offset: Number(req.query.offset) || 0,
      })
    )
  );

  admin.get('/orders/:id', (req: Request, res: Response) => {
    const o = get('SELECT * FROM orders WHERE id=? OR public_id=?', Number(req.params.id) || -1, req.params.id);
    if (!o) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    const { screenshot_path, ...rest } = o;
    res.json({
      ...rest,
      has_screenshot: !!screenshot_path,
      ledger: o.ledger_id ? get('SELECT * FROM ledger WHERE id=?', o.ledger_id) : null,
      audit: all('SELECT at, actor, action, detail FROM audit_log WHERE order_id=? ORDER BY id', o.id),
    });
  });

  admin.get('/orders/:id/screenshot', (req: Request, res: Response) => {
    const o = get('SELECT screenshot_path FROM orders WHERE id=?', Number(req.params.id));
    if (!o?.screenshot_path || !fs.existsSync(o.screenshot_path)) return res.status(404).end();
    res.set('Cache-Control', 'no-store').sendFile(fs.realpathSync(o.screenshot_path));
  });

  const orderId = (req: Request) => get('SELECT id FROM orders WHERE id=? OR public_id=?', Number(req.params.id) || -1, req.params.id)?.id;

  admin.post('/orders/:id/approve', (req: Request, res: Response) => {
    const id = orderId(req);
    if (!id) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    res.json(publicOrder(approveManually(id, { ledgerId: req.body?.ledgerId, note: req.body?.note })));
  });

  admin.post('/orders/:id/reject', (req: Request, res: Response) => {
    const id = orderId(req);
    if (!id) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    res.json(publicOrder(rejectManually(id, { reason: req.body?.reason })));
  });

  admin.post('/orders/:id/recheck', wrap(async (req: Request, res: Response) => {
    const id = orderId(req);
    if (!id) return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    let result = verifyOrder(id, { force: true });
    if (result.status !== 'verified' && hasAiPaymentVerifier()) {
      result = await verifyOrderWithAi(id, { force: true });
    }
    res.json(publicOrder(result));
  }));

  admin.post('/orders/:id/resend', wrap(async (req: Request, res: Response) => {
    const id = orderId(req);
    if (!id || !requeueEmail(id))
      return res.status(409).json({ error: { code: 'not_verified', message: 'Only verified orders can be re-sent' } });
    await processOutbox();
    res.json({ ok: true });
  }));

  admin.get('/ledger', (req: Request, res: Response) =>
    res.json(listLedger({ claimed: req.query.claimed === undefined ? undefined : req.query.claimed === '1', limit: Math.min(Number(req.query.limit) || 100, 500) }))
  );

  admin.post('/ledger', (req: Request, res: Response) => {
    const b = req.body || {};
    if (!CHANNELS[b.channel] || !b.trxId || !(Number(b.amount) > 0))
      return res.status(400).json({ error: { code: 'bad_request', message: 'channel, trxId and amount are required' } });
    const r = addManualLedger({
      channel: b.channel,
      trxId: b.trxId,
      amountMinor: Math.round(Number(b.amount) * 100),
      currency: (b.currency || CHANNELS[b.channel].currency).toUpperCase(),
      sender: b.sender ?? null,
      receivedAt: b.receivedAt ? new Date(b.receivedAt).toISOString() : nowIso(),
    });
    res.status(r.duplicate ? 200 : 201).json({ duplicate: r.duplicate, id: r.row.id });
  });

  admin.post('/codes/generate', (req: Request, res: Response) => {
    const { plan, count } = req.body || {};
    if (!PLAN_IDS.includes(plan) || !(count >= 1 && count <= 5000))
      return res.status(400).json({ error: { code: 'bad_request', message: `plan (${PLAN_IDS.join('/')}) and count (1-5000) required` } });
    generateCodes(plan, count, `admin-${Date.now()}`);
    audit('admin', 'codes_generated', null, { plan, count });
    res.status(201).json({ created: count, stock: stock() });
  });

  admin.get('/codes/export', (req: Request, res: Response) => {
    const { plan, status = 'available' } = req.query;
    const rows = all(`SELECT code, plan, status, batch FROM codes WHERE status=? ${plan ? 'AND plan=?' : ''} ORDER BY id`, status, ...(plan ? [plan] : []));
    res.type('text/csv').send(['code,plan,months,status,batch', ...rows.map((r: any) => `${r.code},${r.plan},${PLANS[r.plan].months},${r.status},${r.batch ?? ''}`)].join('\n'));
  });

  admin.post('/codes/:code/reset-device', (req: Request, res: Response) => {
    const row = resetDevice(String(req.params.code));
    if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'Code not found' } });
    res.json({ ok: true, status: row.status });
  });

  admin.post('/codes/:code/revoke', (req: Request, res: Response) => {
    const r = get('SELECT id, order_id FROM codes WHERE code=?', String(req.params.code));
    if (!r) return res.status(404).json({ error: { code: 'not_found', message: 'Code not found' } });
    run("UPDATE codes SET status='revoked' WHERE id=?", r.id);
    audit('admin', 'code_revoked', r.order_id, { code: `…${String(req.params.code).slice(-4)}` });
    res.json({ ok: true });
  });

  admin.get('/api-keys', (_req: Request, res: Response) => res.json({ keys: listApiKeys() }));
  admin.post('/api-keys', (req: Request, res: Response) => {
    const { name, scopes } = req.body || {};
    if (!name) return res.status(400).json({ error: { code: 'bad_request', message: 'name is required' } });
    const key = createApiKey(name, scopes);
    res.status(201).json(key);
  });
  admin.post('/api-keys/:id/revoke', (req: Request, res: Response) => {
    const revoked = revokeApiKey(req.params.id);
    if (!revoked) return res.status(404).json({ error: { code: 'not_found', message: 'Key not found' } });
    res.json({ ok: true, revoked });
  });

  admin.get('/codes', (req: Request, res: Response) => {
    const { status, plan, q, limit = 100 } = req.query;
    const conds: string[] = [];
    const args: any[] = [];
    if (status) { conds.push('c.status=?'); args.push(String(status)); }
    if (plan) { conds.push('c.plan=?'); args.push(String(plan)); }
    if (q) { conds.push('(c.code LIKE ? OR o.email LIKE ? OR o.public_id LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = all(
      `SELECT c.code, c.plan, c.status, c.device_id, c.batch, c.issued_at, c.activated_at, c.expires_at, o.public_id AS order_id, o.email AS order_email
       FROM codes c
       LEFT JOIN orders o ON c.order_id = o.id
       ${where}
       ORDER BY c.id DESC
       LIMIT ?`,
      ...args,
      Math.min(Number(limit) || 100, 300)
    );
    res.json({ codes: rows, stock: stock() });
  });

  admin.get('/outbox', (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = all(
      `SELECT id, order_id, to_email, mail_kind, subject, status, attempts, last_error, sent_at, created_at
       FROM email_outbox
       ORDER BY id DESC
       LIMIT ?`,
      limit
    );
    res.json({ emails: rows, mail: getMailHealth() });
  });

  admin.post('/mail/verify', wrap(async (req: Request, res: Response) => {
    const testRecipient = req.body?.sendTest ? (String(req.body?.to || '').trim() || config.mail.adminEmail) : null;
    const result = await verifySmtpConnection(testRecipient);
    res.status(result.ok ? 200 : 400).json(result);
  }));

  admin.post('/mail/flush', wrap(async (_req: Request, res: Response) => {
    run("UPDATE email_outbox SET status='queued', next_attempt_at=? WHERE status='failed'", nowIso());
    const sent = await processOutbox();
    res.json({ ok: true, sent, mail: getMailHealth() });
  }));

  admin.post('/auto-activate/run', (_req: Request, res: Response) => {
    const activated = triggerDelayedActivations();
    res.json({ ok: true, activatedCount: activated, time: nowIso() });
  });

  admin.post('/backup', (_req: Request, res: Response) => {
    const result = runDatabaseBackup();
    res.status(result.ok ? 200 : 500).json(result);
  });

  router.use('/admin', admin);
  router.use('/internal', createInternalRouter(options.channelLookup));
  startPaymentBackgroundJobs();

  return router;
}

export function runDatabaseBackup(keepCount = 14): { ok: boolean; file?: string; pruned?: number; reason?: string } {
  try {
    if (!config.dbPath || config.dbPath === ':memory:') {
      return { ok: false, reason: 'in_memory_db' };
    }
    const backupDir = path.resolve(path.dirname(config.dbPath), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destPath = path.join(backupDir, `site-${stamp}.db`);
    const escapedPath = destPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedPath}'`);

    const files = fs.readdirSync(backupDir)
      .filter((f) => f.startsWith('site-') && f.endsWith('.db'))
      .sort()
      .reverse();

    let pruned = 0;
    for (const stale of files.slice(keepCount)) {
      try {
        fs.unlinkSync(path.join(backupDir, stale));
        pruned++;
      } catch {}
    }

    return { ok: true, file: destPath, pruned };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'backup_failed' };
  }
}

let backgroundJobsStarted = false;
export function startPaymentBackgroundJobs() {
  if (backgroundJobsStarted) return;
  backgroundJobsStarted = true;

  const every = (ms: number, fn: () => any, label: string) =>
    setInterval(async () => {
      try {
        await fn();
      } catch (e: any) {
        console.error(`[job:${label}]`, e?.message || e);
      }
    }, ms).unref();

  every(30_000, async () => {
    reconcilePending();
    await reconcileAiPending(3);
    expireOld();
    triggerDelayedActivations();
  }, 'reconcile-and-auto-activate');

  every(20_000, () => processOutbox(), 'outbox');

  every(24 * 60 * 60 * 1000, () => {
    const res = runDatabaseBackup(14);
    if (res.ok) console.log(`[backup] Created SQLite backup: ${res.file}`);
  }, 'nightly-backup');

  if (config.binance.key && config.binance.secret) {
    every(config.binance.pollSeconds * 1000, () => pollBinance(), 'binance');
  }
}
