// Order creation: validate every field, inspect the proof, then hand the order to the verifier.
import { randomBytes } from 'node:crypto';
import { config, PLANS, CHANNELS } from './config.js';
import { get, run, all, nowIso, audit } from './db.js';
import { normalizeEmail, emailDomainCanReceive, normalizePhone, normalizeTrxInput, maskEmail } from './validators.js';
import { inspectUpload, saveUpload, readText, ledgerIdsInText } from './screenshot.js';
import { verifyOrder, verifyOrderWithAi, hasAiPaymentVerifier, userMessage } from './verify.js';
import { queuePaymentSubmissionCopy, processOutbox } from './mailer.js';

export class ApiError extends Error {
  constructor(status, code, message, fields) { super(message); this.status = status; this.code = code; this.fields = fields; }
}

export function publicOrder(order) {
  let detail = null;
  if (order.status_detail) {
    try { detail = JSON.parse(order.status_detail); } catch { detail = null; }
  }
  return {
    orderId: order.public_id,
    ref: order.public_id,
    status: order.status,
    reason: order.status_reason || null,
    message: userMessage(order),
    verificationMethod: order.verification_method || null,
    aiSummary: detail?.aiVerification?.summary || null,
    plan: order.plan,
    channel: order.channel,
    method: order.channel,
    name: order.customer_name || null,
    email: maskEmail(order.email),
    emailStatus: order.status === 'verified' ? order.email_status : null,
    copyEmailStatus: order.copy_email_status || null,
    autoActivateAt: order.auto_activate_at || null,
    autoActivatedAt: order.auto_activated_at || null,
    createdAt: order.created_at,
    updatedAt: order.updated_at || order.created_at,
  };
}

function normalizePlanKey(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '1') return '1m';
  if (s === '2') return '2m';
  if (s === '6') return '6m';
  if (s === '12') return '12m';
  return s;
}

export async function createOrder(body, file, meta = {}) {
  const fields = {};
  const plan = PLANS[normalizePlanKey(body.plan)];
  if (!plan) fields.plan = 'Choose a plan';
  const rawChannel = String(body.channel ?? body.method ?? '').trim().toLowerCase();
  const channel = CHANNELS[rawChannel];
  if (!channel) fields.channel = 'Choose a payment method';

  const inferredRegion = channel
    ? (channel.id === 'bkash' || channel.id === 'nagad' ? 'BD' : channel.id === 'binance' ? 'BD' : 'INTL')
    : '';
  const region = String(body.region || inferredRegion || '').toUpperCase();
  if (!['BD', 'INTL'].includes(region)) fields.region = 'Region must be BD or INTL';
  else if (channel && !channel.regions.includes(region)) fields.channel = `${channel.label} is not available for this region`;

  const email = normalizeEmail(body.email);
  if (!email.ok) fields.email = email.error;
  const phone = normalizePhone(body.phone ?? body.senderAccount ?? body.sender_account);
  if (!phone.ok) fields.phone = phone.error;

  const customerName = String(body.name ?? body.customerName ?? '').trim().slice(0, 80) || null;

  let trx = { ok: true, empty: true };
  if (channel) {
    trx = normalizeTrxInput(channel.id, body.trxId ?? body.trx_id);
    if (!trx.ok) fields.trxId = trx.error;
  }
  if (trx.ok && trx.empty && !file) fields.trxId = 'Enter the Transaction ID or upload your payment screenshot (or both)';

  let shot = null;
  if (file) {
    shot = inspectUpload(file.buffer, file.mimetype);
    if (!shot.ok) fields.screenshot = shot.error;
  }
  if (Object.keys(fields).length) throw new ApiError(400, 'validation_failed', 'Please fix the highlighted fields', fields);

  if (config.emailMxCheck && !(await emailDomainCanReceive(email.domain))) {
    throw new ApiError(400, 'validation_failed', 'Please fix the highlighted fields', { email: 'That email domain cannot receive mail. Check for typos.' });
  }

  // Idempotency: double-click / retry of the same order returns the existing one.
  if (trx.ok && !trx.empty) {
    const dup = get(`SELECT * FROM orders WHERE email=? AND channel=? AND trx_id=? AND plan=? AND status IN ('pending','needs_review','verified')`,
      email.value, channel.id, trx.value, plan.id);
    if (dup) {
      let existing = verifyOrder(dup.id);
      if (existing.status !== 'verified' && existing.status !== 'rejected' && hasAiPaymentVerifier()) {
        existing = await verifyOrderWithAi(existing.id);
      }
      return { order: existing, created: false };
    }
  }

  const perDay = get('SELECT COUNT(*) n FROM orders WHERE email=? AND created_at > ?', email.value, new Date(Date.now() - 86400_000).toISOString()).n;
  if (perDay >= config.maxOrdersPerEmailPerDay) throw new ApiError(429, 'too_many_orders', 'Too many orders for this email today. Contact support if you need help.');

  if (shot) {
    const reused = get("SELECT id FROM orders WHERE screenshot_sha256=? AND status IN ('pending','needs_review','verified')", shot.sha256);
    if (reused) throw new ApiError(409, 'screenshot_reused', 'This screenshot was already submitted with another order.', { screenshot: 'This screenshot was already used' });
  }

  // OCR is only needed when there is no typed id.
  let ocrIds = [];
  if (shot && trx.empty) ocrIds = ledgerIdsInText(channel.id, await readText(file.buffer));

  const publicId = `MRS-${randomBytes(6).toString('hex').toUpperCase()}`;
  const now = nowIso();
  const path = shot ? saveUpload(file.buffer, shot.ext) : null;
  let id;
  try {
    id = run(
      `INSERT INTO orders(public_id, status, plan, region, channel, currency, expected_minor, customer_name, email, phone, trx_id, trx_kind,
                          screenshot_path, screenshot_sha256, screenshot_flags, ocr_candidates, ip, user_agent, created_at, updated_at)
       VALUES (?, 'pending', ?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?, ?,?)`,
      publicId, plan.id, region, channel.id, channel.currency, Math.round(plan.prices[channel.currency] * 100),
      customerName, email.value, phone.e164, trx.empty ? null : trx.value, trx.empty ? null : trx.kind,
      path, shot?.sha256 ?? null, shot ? JSON.stringify(shot.flags) : null, JSON.stringify(ocrIds),
      meta.ip ?? null, (meta.userAgent ?? '').slice(0, 200), now, now).lastInsertRowid;
  } catch (e) {
    if (/UNIQUE/.test(String(e.message))) throw new ApiError(409, 'screenshot_reused', 'This screenshot was already submitted with another order.', { screenshot: 'This screenshot was already used' });
    throw e;
  }
  audit('user', 'order_created', Number(id), { plan: plan.id, channel: channel.id, hasTrx: !trx.empty, hasShot: !!shot, flags: shot?.flags });
  const createdOrder = get('SELECT * FROM orders WHERE id=?', Number(id));
  queuePaymentSubmissionCopy(createdOrder);
  let verified = verifyOrder(Number(id));
  if (verified.status !== 'verified' && verified.status !== 'rejected' && hasAiPaymentVerifier()) {
    verified = await verifyOrderWithAi(verified.id);
  }
  await Promise.race([
    processOutbox().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 2500))
  ]);
  return { order: get('SELECT * FROM orders WHERE id=?', verified.id) || verified, created: true };
}

export const getOrderByPublicId = (pid) => get('SELECT * FROM orders WHERE public_id=?', String(pid).trim().toUpperCase());
export const listOrders = ({ status, q, limit = 50, offset = 0 }) => {
  const conds = [];
  const args = [];
  if (status) { conds.push('o.status=?'); args.push(status); }
  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    conds.push('(o.email LIKE ? OR o.trx_id LIKE ? OR o.public_id LIKE ? OR o.phone LIKE ? OR c.code LIKE ?)');
    args.push(like, like, like, like, like);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return all(
    `SELECT o.id, o.public_id, o.status, o.status_reason, o.status_detail, o.plan, o.channel, o.expected_minor, o.currency,
            o.customer_name, o.email, o.phone, o.trx_id, o.trx_kind, o.screenshot_flags, o.ledger_id, o.code_id,
            o.verification_method, o.email_status, o.created_at, o.updated_at, o.verified_at,
            (o.screenshot_path IS NOT NULL) AS has_screenshot
       FROM orders o
       LEFT JOIN codes c ON o.code_id = c.id
       ${where}
       ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    ...args, limit, offset
  );
};
