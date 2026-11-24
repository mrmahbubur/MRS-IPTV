// The verification engine.
//
// An order is verified ONLY when a matching, unclaimed row exists in the ledger
// (i.e. the money really arrived) AND every check below passes. Otherwise the
// order waits, goes to manual review, or is rejected. Nothing is ever approved
// because a form "looked right".
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config, PLANS, CHANNELS } from './config.js';
import { get, all, run, tx, nowIso, audit, Abort } from './db.js';
import { allocateCode, addMonths } from './codes.js';
import { queueActivationEmail, queueAutoActivatedEmail, queueRejectionEmail, processOutbox } from './mailer.js';
import { last10, normalizeEmail, normalizeTrxInput } from './validators.js';

let aiPaymentVerifier = null;

export function setAiPaymentVerifier(fn) {
  aiPaymentVerifier = typeof fn === 'function' ? fn : null;
}

export function hasAiPaymentVerifier() {
  return typeof aiPaymentVerifier === 'function';
}

export const MESSAGES = {
  verified: 'Payment verified. Your activation code has been emailed to you.',
  ai_verified: 'Payment verified automatically by AI. Your exact-month VIP activation code has been emailed to you.',
  awaiting_payment: "We haven't seen this payment in our account yet. Keep this page open – it checks automatically. Confirmations can take a few minutes.",
  no_matching_payment: 'We could not find a matching payment in our account within the waiting period. Check the Transaction ID, or contact support on WhatsApp.',
  trx_already_used: 'This transaction has already been used for another order.',
  underpaid: 'The amount we received is lower than the price of this plan.',
  payment_too_old: 'This payment is older than our automatic-verification window. Our team will review it manually.',
  sender_mismatch: 'The paying number does not match the number you entered. Our team will review it manually – you can also message support on WhatsApp.',
  currency_mismatch: 'The payment was received in a different currency or asset than this plan requires. Our team will review it manually.',
  paid_for_other_plan: 'The amount you paid matches a different plan than the one selected. Our team will review it manually.',
  duplicate_submission: 'Another order was submitted with the same Transaction ID. Our team will review both manually.',
  nickname_match_needs_confirmation: 'We found a payment from that Binance nickname. Our team will confirm it shortly.',
  ambiguous_nickname: 'More than one payment matches that nickname. Please send your Binance Pay Order ID, or contact support.',
  screenshot_unreadable: 'We could not read a Transaction ID from your screenshot. Our team will review it manually.',
  ambiguous_screenshot: 'Your screenshot matches more than one payment. Our team will review it manually.',
  screenshot_edited: 'Your screenshot shows signs of editing. Our team will review it manually.',
  ai_channel_mismatch: 'The submitted proof does not match the selected payment option. Please upload confirmation for the selected method.',
  ai_trx_mismatch: 'The Transaction ID you entered does not match the Transaction ID found on your uploaded payment document.',
  ai_recipient_mismatch: 'The receiving account on your uploaded document does not match our official receiving account for this method.',
  ai_unverified_document: 'Could not confirm a clear, valid payment document for the selected payment option.',
  ai_fake_proof: 'The submitted Transaction ID or document does not appear to be a genuine payment transaction.',
  ai_needs_review: 'AI verification requires a quick check of your submitted details before releasing your code.',
  manual_reject: 'Payment verification was rejected by our team.',
  out_of_stock: 'Your payment is verified. Your code is being prepared and will be emailed shortly.',
  manual_review: 'Our team is reviewing this order.',
};

function safeDetail(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function userMessage(order) {
  const detail = safeDetail(order.status_detail);
  if (order.status === 'verified') {
    return order.verification_method === 'ai_auto' ? MESSAGES.ai_verified : MESSAGES.verified;
  }
  if (order.status_reason === 'underpaid' && detail) return `${MESSAGES.underpaid} We received ${detail.paid}, but this plan costs ${detail.expected}. Contact support on WhatsApp to top up the difference.`;
  if (order.status_reason === 'manual_reject' && detail?.note) return `Order rejected: ${detail.note}`;
  if (order.status === 'rejected' && detail?.aiVerification?.summary && !MESSAGES[order.status_reason]) {
    return `Order rejected: ${detail.aiVerification.summary}`;
  }
  if (order.status === 'pending') return MESSAGES.awaiting_payment;
  if (order.status === 'expired') return MESSAGES.no_matching_payment;
  if (order.status === 'needs_review' && detail?.aiVerification?.summary && !MESSAGES[order.status_reason]) {
    return detail.aiVerification.summary;
  }
  return MESSAGES[order.status_reason] || MESSAGES.manual_review;
}

const money = (minor, cur) => `${cur === 'BDT' ? '' : '$'}${(minor / 100).toFixed(2).replace(/\.00$/, '')}${cur === 'BDT' ? ' TK' : ''}`;
const hours = (h) => h * 3600_000;

function normCurrency(channel, cur) {
  const c = String(cur || '').trim().toUpperCase();
  if (!c) return '';
  if (channel === 'bkash' || channel === 'nagad') {
    if (['BDT', 'TK', 'TAKA', '৳'].includes(c)) return 'BDT';
  }
  if (channel === 'binance') return config.binance.stableAssets.includes(c) || c === '$' ? 'USD' : c;
  if (channel === 'skrill' || channel === 'payoneer') {
    if (['USD', '$', 'US$'].includes(c)) return 'USD';
  }
  return c;
}

function setOutcome(order, status, reason, detail, ledgerId) {
  run('UPDATE orders SET status=?, status_reason=?, status_detail=?, ledger_id=COALESCE(?, ledger_id), updated_at=? WHERE id=?',
    status, reason, detail ? JSON.stringify(detail) : null, ledgerId ?? null, nowIso(), order.id);
  audit('system', `order_${status}`, order.id, { reason, ...(detail || {}) });
  const fresh = get('SELECT * FROM orders WHERE id=?', order.id);
  if (status === 'rejected') {
    try {
      const reasonMsg = detail?.note || detail?.aiVerification?.summary || userMessage(fresh);
      queueRejectionEmail(fresh, reasonMsg);
      processOutbox().catch(() => {});
    } catch {}
  }
  return fresh;
}

/** Decide what should happen to this order *right now*. Pure read – no writes. */
function evaluate(order) {
  const ch = CHANNELS[order.channel];
  const flags = JSON.parse(order.screenshot_flags || '[]');
  const wait = { decision: 'wait', reason: 'awaiting_payment' };
  const review = (reason, extra = {}) => ({ decision: 'review', reason, ...extra });
  const reject = (reason, detail) => ({ decision: 'reject', reason, detail });

  // 1. Find the candidate payment in the REAL ledger (never verify from client proof alone) ---
  let ledger = null;
  if (order.trx_id && order.trx_kind === 'id') {
    ledger = get('SELECT * FROM ledger WHERE channel=? AND trx_id=?', order.channel, order.trx_id);
  } else if (order.trx_id && order.trx_kind === 'nickname') {
    const cands = all(
      `SELECT * FROM ledger WHERE channel=? AND claimed_by_order IS NULL AND LOWER(sender)=? AND amount_minor>=? AND received_at>=?`,
      order.channel, order.trx_id, order.expected_minor, new Date(Date.parse(order.created_at) - hours(config.paymentMaxAgeHours)).toISOString());
    if (cands.length > 1) return review('ambiguous_nickname');
    if (cands.length === 1) {
      ledger = cands[0];
      if (!config.binance.nicknameAuto) return review('nickname_match_needs_confirmation', { ledgerId: ledger.id });
    }
  } else {
    const ids = JSON.parse(order.ocr_candidates || '[]');
    const found = ids.map((t) => get('SELECT * FROM ledger WHERE channel=? AND trx_id=?', order.channel, t)).filter(Boolean);
    if (!found.length) return review('screenshot_unreadable');
    if (found.length > 1) return review('ambiguous_screenshot');
    ledger = found[0];
    if (flags.some((f) => f.startsWith('edited_by'))) return review('screenshot_edited', { ledgerId: ledger.id });
  }
  if (!ledger) {
    return wait;
  }

  // 2. Has the payment already been used? ----------------------------------------
  if (ledger.claimed_by_order && ledger.claimed_by_order !== order.id) return reject('trx_already_used');

  // 3. Currency / asset ----------------------------------------------------------
  if (normCurrency(order.channel, ledger.currency) !== order.currency) return review('currency_mismatch', { ledgerId: ledger.id });

  // 4. Amount --------------------------------------------------------------------
  const floor = Math.floor(order.expected_minor * (1 - config.amountTolerancePct / 100));
  if (ledger.amount_minor < floor) {
    return reject('underpaid', { paid: money(ledger.amount_minor, order.currency), expected: money(order.expected_minor, order.currency) });
  }
  if (ledger.amount_minor > order.expected_minor) {
    const exactOther = Object.values(PLANS).find((p) => p.id !== order.plan && Math.round(p.prices[order.currency] * 100) === ledger.amount_minor);
    if (exactOther) return review('paid_for_other_plan', { ledgerId: ledger.id, paidFor: exactOther.id });
  }

  // 5. Payment must not be stale relative to the order ---------------------------
  if (Date.parse(ledger.received_at) < Date.parse(order.created_at) - hours(config.paymentMaxAgeHours)) {
    return review('payment_too_old', { ledgerId: ledger.id });
  }

  // 6. Paying number must match the number typed in the form (bKash / Nagad) -----
  let senderOk = false;
  if (ch.senderMatch) {
    senderOk = !!ledger.sender && last10(ledger.sender) === last10(order.phone);
    if (!senderOk) return review('sender_mismatch', { ledgerId: ledger.id });
  }

  // 7. Somebody else claiming the very same transaction? -------------------------
  if (order.trx_id && order.trx_kind === 'id') {
    const rivals = all(
      `SELECT id, phone FROM orders WHERE channel=? AND trx_id=? AND id<>? AND email<>? AND status IN ('pending','needs_review','verified')`,
      order.channel, order.trx_id, order.id, order.email);
    if (rivals.length && !(ch.senderMatch && senderOk && rivals.every((r) => last10(r.phone) !== last10(ledger.sender)))) {
      return review('duplicate_submission', { ledgerId: ledger.id });
    }
  }

  return { decision: 'verify', ledger, overpaid: ledger.amount_minor > order.expected_minor };
}

/** Claim the payment + issue a code + queue the e-mail – atomically. */
function finalize(order, ledger, method, actor) {
  const result = tx(() => {
    if (ledger) {
      const claim = run('UPDATE ledger SET claimed_by_order=? WHERE id=? AND claimed_by_order IS NULL', order.id, ledger.id);
      if (claim.changes === 0 && get('SELECT claimed_by_order FROM ledger WHERE id=?', ledger.id).claimed_by_order !== order.id) throw new Abort('trx_already_used');
    }
    const code = allocateCode(order.plan, order.id);
    if (!code) throw new Abort('out_of_stock');

    // 12-hour delayed trigger for automatic VIP activation if no manual redemption is received
    const autoActivateAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

    run(`UPDATE orders SET status='verified', status_reason=?, status_detail=NULL, ledger_id=?, code_id=?, auto_activate_at=?, verified_at=?, verification_method=?, updated_at=? WHERE id=?`,
      ledger && ledger.amount_minor > order.expected_minor ? 'overpaid' : null, ledger?.id ?? null, code.id, autoActivateAt, nowIso(), method, nowIso(), order.id);
    run(`UPDATE codes SET auto_activate_at=? WHERE id=?`, autoActivateAt, code.id);

    const fresh = get('SELECT * FROM orders WHERE id=?', order.id);
    queueActivationEmail(fresh, code.code);
    audit(actor, 'order_verified', order.id, { method, ledgerId: ledger?.id ?? null, plan: order.plan, autoActivateAt });
    return fresh;
  });
  processOutbox().catch(() => {}); // fire-and-forget; the timer retries on failure
  return result;
}

/** Evaluate one order and apply the outcome. */
export function verifyOrder(orderId, { force = false } = {}) {
  const order = get('SELECT * FROM orders WHERE id=?', orderId);
  if (!order) throw new Error('order not found');
  if (order.status === 'verified') return order;
  if (!force && order.status !== 'pending') return order;

  const res = evaluate(order);
  if (res.decision === 'wait') return order;
  if (res.decision === 'reject') return setOutcome(order, 'rejected', res.reason, res.detail);
  if (res.decision === 'review') return setOutcome(order, 'needs_review', res.reason, res.paidFor ? { paidFor: res.paidFor } : null, res.ledgerId);
  try {
    return finalize(order, res.ledger, 'auto', 'system');
  } catch (err) {
    if (err instanceof Abort) {
      if (err.reason === 'out_of_stock') return setOutcome(order, 'needs_review', 'out_of_stock', null, res.ledger?.id);
      return setOutcome(order, 'rejected', err.reason);
    }
    throw err;
  }
}

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function readOrderUploadSafe(order) {
  if (!order?.screenshot_path) return null;
  const uploadRoot = path.resolve(config.uploadDir);
  const resolved = path.resolve(order.screenshot_path);
  if (!resolved.startsWith(uploadRoot + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;
  return { buffer: fs.readFileSync(resolved), mime, name: path.basename(resolved) };
}

/**
 * Evaluate an unverified order using the Backend AI Payment Verifier (when configured).
 * Applies strict server-side duplicate/amount/channel/similarity enforcement before
 * atomically issuing the exact-month activation code and queueing the email.
 */
export async function verifyOrderWithAi(orderId, { force = false } = {}) {
  const order = get('SELECT * FROM orders WHERE id=?', orderId);
  if (!order) throw new Error('order not found');
  if (order.status === 'verified') return order;
  if (!force && order.status === 'rejected') return order;
  if (!hasAiPaymentVerifier()) return order;

  const ch = CHANNELS[order.channel];
  const plan = PLANS[order.plan];
  if (!ch || !plan) return order;

  const flags = safeDetail(order.screenshot_flags) || [];
  if (Array.isArray(flags) && flags.some((f) => String(f).startsWith('edited_by'))) {
    return setOutcome(order, 'needs_review', 'screenshot_edited', {
      aiVerification: {
        status: 'needs_review',
        summary: MESSAGES.screenshot_edited,
        checkedAt: nowIso(),
      },
    }, order.ledger_id);
  }

  const upload = readOrderUploadSafe(order);
  const hasDocument = Boolean(upload && upload.buffer?.length > 0);
  if (!hasDocument && !order.trx_id) return order;

  const aiRes = await aiPaymentVerifier({
    order,
    fileBuffer: upload?.buffer ?? null,
    fileMime: upload?.mime ?? null,
    fileName: upload?.name ?? null,
    channelConfig: ch,
    planConfig: plan,
    receivingAccount: config.receivingAccounts?.[order.channel] || {},
  });

  if (!aiRes || aiRes.deferred) {
    const existingDetail = safeDetail(order.status_detail) || {};
    run('UPDATE orders SET status_detail=?, updated_at=? WHERE id=?', JSON.stringify({
      ...existingDetail,
      aiVerification: {
        status: 'deferred',
        reason: aiRes?.deferredReason || 'ai_temporarily_unavailable',
        summary: aiRes?.summary || 'Automated AI verification will retry shortly.',
        checkedAt: nowIso(),
      },
    }), nowIso(), order.id);
    return get('SELECT * FROM orders WHERE id=?', order.id);
  }

  const aiMeta = {
    status: aiRes.verdict,
    model: aiRes.model || 'gemini-4-hydrogen',
    hasDocument,
    detectedChannel: aiRes.detectedChannel || 'unknown',
    channelMatchesSelected: Boolean(aiRes.channelMatchesSelected),
    extractedTrxId: aiRes.extractedTrxId || '',
    trxIdMatchesInput: Boolean(aiRes.trxIdMatchesInput),
    trxIdLooksReal: Boolean(aiRes.trxIdLooksReal),
    trxIdSimilarityScore: Number(aiRes.trxIdSimilarityScore || 0),
    extractedAmount: Number(aiRes.extractedAmount || 0),
    extractedCurrency: aiRes.extractedCurrency || '',
    extractedRecipient: aiRes.extractedRecipient || '',
    recipientMatchesAccount: aiRes.recipientMatchesAccount !== false,
    extractedTimestamp: aiRes.extractedTimestamp || '',
    timestampLooksRecent: aiRes.timestampLooksRecent !== false,
    overallSimilarityScore: Number(aiRes.overallSimilarityScore || 0),
    reasonCode: aiRes.reasonCode || 'ai_needs_review',
    summary: aiRes.summary || '',
    checkedAt: nowIso(),
  };

  let effectiveTrxId = order.trx_id || null;
  let effectiveTrxKind = order.trx_kind || null;
  if (!effectiveTrxId && aiRes.extractedTrxId) {
    const norm = normalizeTrxInput(order.channel, aiRes.extractedTrxId);
    if (norm.ok && !norm.empty) {
      effectiveTrxId = norm.value;
      effectiveTrxKind = norm.kind;
    }
  }

  // Deterministic duplicate check across both ledger & already-verified orders
  if (effectiveTrxId && effectiveTrxKind === 'id') {
    const claimedLedger = get(
      'SELECT id FROM ledger WHERE channel=? AND trx_id=? AND claimed_by_order IS NOT NULL AND claimed_by_order<>?',
      order.channel, effectiveTrxId, order.id
    );
    const verifiedOrder = get(
      "SELECT id FROM orders WHERE channel=? AND trx_id=? AND status='verified' AND id<>?",
      order.channel, effectiveTrxId, order.id
    );
    if (claimedLedger || verifiedOrder) {
      return setOutcome(order, 'rejected', 'trx_already_used', { aiVerification: aiMeta });
    }
  }

  if (hasDocument) {
    if (!aiRes.isPaymentDocument || !aiRes.appearsAuthenticAndUnedited) {
      if (aiRes.verdict === 'reject') {
        return setOutcome(order, 'rejected', aiRes.reasonCode || 'ai_fake_proof', { aiVerification: aiMeta });
      }
      return setOutcome(order, 'needs_review', 'ai_unverified_document', { aiVerification: aiMeta });
    }
    if (!aiRes.channelMatchesSelected) {
      return setOutcome(order, 'needs_review', 'ai_channel_mismatch', { aiVerification: aiMeta });
    }
    if (aiRes.recipientMatchesAccount === false) {
      return setOutcome(order, 'needs_review', 'ai_recipient_mismatch', { aiVerification: aiMeta });
    }
    if (aiRes.timestampLooksRecent === false) {
      return setOutcome(order, 'needs_review', 'payment_too_old', { aiVerification: aiMeta });
    }
    if (order.trx_id && order.trx_kind === 'id' && aiRes.extractedTrxId && aiRes.trxIdMatchesInput === false) {
      return setOutcome(order, 'needs_review', 'ai_trx_mismatch', { aiVerification: aiMeta });
    }
    if (Number(aiRes.extractedAmount) > 0) {
      const paidCurrency = normCurrency(order.channel, aiRes.extractedCurrency || order.currency);
      if (paidCurrency && paidCurrency !== order.currency) {
        return setOutcome(order, 'needs_review', 'currency_mismatch', { aiVerification: aiMeta });
      }
      const paidMinor = Math.round(Number(aiRes.extractedAmount) * 100);
      const floor = Math.floor(order.expected_minor * (1 - config.amountTolerancePct / 100));
      if (paidMinor < floor) {
        return setOutcome(order, 'rejected', 'underpaid', {
          paid: money(paidMinor, order.currency),
          expected: money(order.expected_minor, order.currency),
          aiVerification: aiMeta,
        });
      }
      if (paidMinor > order.expected_minor) {
        const exactOther = Object.values(PLANS).find(
          (p) => p.id !== order.plan && Math.round(p.prices[order.currency] * 100) === paidMinor
        );
        if (exactOther) {
          return setOutcome(order, 'needs_review', 'paid_for_other_plan', {
            paidFor: exactOther.id,
            aiVerification: aiMeta,
          });
        }
      }
    }
    if (!aiRes.paymentStatusSuccessful) {
      return setOutcome(
        order,
        aiRes.verdict === 'reject' ? 'rejected' : 'needs_review',
        aiRes.reasonCode || 'ai_needs_review',
        { aiVerification: aiMeta }
      );
    }
  }

  if (!aiRes.channelMatchesSelected) {
    return setOutcome(order, 'needs_review', 'ai_channel_mismatch', { aiVerification: aiMeta });
  }
  if (aiRes.verdict === 'reject') {
    return setOutcome(order, 'rejected', aiRes.reasonCode || 'ai_fake_proof', { aiVerification: aiMeta });
  }
  if (
    aiRes.verdict !== 'verify' ||
    !aiRes.trxIdLooksReal ||
    Number(aiRes.overallSimilarityScore) < 75 ||
    Number(aiRes.trxIdSimilarityScore) < 70
  ) {
    return setOutcome(order, 'needs_review', aiRes.reasonCode || 'ai_needs_review', { aiVerification: aiMeta });
  }

  // All AI similarity & deterministic server checks passed: atomically issue the exact-month code and email it
  try {
    const finalized = tx(() => {
      const current = get('SELECT status FROM orders WHERE id=?', order.id);
      if (current?.status === 'verified') return get('SELECT * FROM orders WHERE id=?', order.id);

      if (effectiveTrxId && effectiveTrxKind === 'id') {
        const dup = get(
          "SELECT id FROM orders WHERE channel=? AND trx_id=? AND status='verified' AND id<>?",
          order.channel, effectiveTrxId, order.id
        );
        if (dup) throw new Abort('trx_already_used');
      }

      const code = allocateCode(order.plan, order.id);
      if (!code) throw new Abort('out_of_stock');

      const autoActivateAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
      const now = nowIso();
      run(
        `UPDATE orders
            SET status='verified',
                status_reason='ai_verified',
                status_detail=?,
                trx_id=COALESCE(trx_id, ?),
                trx_kind=COALESCE(trx_kind, ?),
                code_id=?,
                auto_activate_at=?,
                verified_at=?,
                verification_method='ai_auto',
                updated_at=?
          WHERE id=?`,
        JSON.stringify({ aiVerification: aiMeta }),
        effectiveTrxId,
        effectiveTrxKind,
        code.id,
        autoActivateAt,
        now,
        now,
        order.id
      );
      run('UPDATE codes SET auto_activate_at=? WHERE id=?', autoActivateAt, code.id);

      const fresh = get('SELECT * FROM orders WHERE id=?', order.id);
      queueActivationEmail(fresh, code.code);
      audit('ai_verifier', 'order_verified_ai', order.id, {
        plan: order.plan,
        channel: order.channel,
        similarity: aiRes.overallSimilarityScore,
        trxSimilarity: aiRes.trxIdSimilarityScore,
        hasDocument,
        autoActivateAt,
      });
      return fresh;
    });

    processOutbox().catch(() => {});
    return finalized;
  } catch (err) {
    if (err instanceof Abort) {
      if (err.reason === 'out_of_stock') return setOutcome(order, 'needs_review', 'out_of_stock', { aiVerification: aiMeta });
      return setOutcome(order, 'rejected', err.reason, { aiVerification: aiMeta });
    }
    throw err;
  }
}

/** Re-run every pending order – called after each ledger ingest and by the timer. */
export function reconcilePending() {
  const ids = all("SELECT id FROM orders WHERE status='pending' ORDER BY id").map((r) => r.id);
  let verified = 0;
  for (const id of ids) if (verifyOrder(id).status === 'verified') verified++;
  return verified;
}

/** Retry any pending or deferred AI-verification orders in the background. */
export async function reconcileAiPending(limit = 10) {
  if (!hasAiPaymentVerifier()) return 0;
  const rows = all(
    `SELECT id FROM orders
      WHERE status='pending'
         OR (status='needs_review' AND status_detail LIKE '%"status":"deferred"%')
      ORDER BY id DESC LIMIT ?`,
    limit
  );
  let verified = 0;
  for (const r of rows) {
    try {
      const updated = await verifyOrderWithAi(r.id);
      if (updated?.status === 'verified') verified++;
    } catch {
      // Keep non-blocking in background loop
    }
  }
  return verified;
}

export function expireOld() {
  const cutoff = new Date(Date.now() - hours(config.pendingTtlHours)).toISOString();
  const rows = all("SELECT id FROM orders WHERE status='pending' AND created_at < ?", cutoff);
  for (const r of rows) {
    run("UPDATE orders SET status='expired', status_reason='no_matching_payment', updated_at=? WHERE id=?", nowIso(), r.id);
    audit('system', 'order_expired', r.id);
  }
  return rows.length;
}

/** Human approval from the admin API. Optionally link a ledger row; otherwise an explicit written override is required. */
export function approveManually(orderId, { ledgerId, note, actor = 'admin' }) {
  const order = get('SELECT * FROM orders WHERE id=?', orderId);
  if (!order) throw Object.assign(new Error('order not found'), { status: 404 });
  if (order.status === 'verified') return order;
  const lid = ledgerId ?? order.ledger_id;
  const ledger = lid ? get('SELECT * FROM ledger WHERE id=?', lid) : null;
  if (lid && !ledger) throw Object.assign(new Error('ledger row not found'), { status: 404 });
  if (!ledger && (!note || note.trim().length < 10)) {
    throw Object.assign(new Error('Approving without a ledger payment needs a written note (10+ characters) explaining how you confirmed the money.'), { status: 400 });
  }
  if (ledger && ledger.claimed_by_order && ledger.claimed_by_order !== order.id) throw Object.assign(new Error('That payment is already claimed by another order'), { status: 409 });
  if (ledger && ledger.channel !== order.channel) throw Object.assign(new Error('Ledger payment is on a different channel'), { status: 400 });
  try {
    const out = finalize(order, ledger, 'manual', actor);
    audit(actor, 'manual_approve', order.id, { note: note || null, ledgerId: ledger?.id ?? null });
    return out;
  } catch (err) {
    if (err instanceof Abort) throw Object.assign(new Error(err.reason), { status: 409 });
    throw err;
  }
}

export function rejectManually(orderId, { reason, actor = 'admin' }) {
  const order = get('SELECT * FROM orders WHERE id=?', orderId);
  if (!order) throw Object.assign(new Error('order not found'), { status: 404 });
  if (order.status === 'verified') throw Object.assign(new Error('Order is already verified'), { status: 409 });
  const out = setOutcome(order, 'rejected', 'manual_reject', { note: reason || null });
  audit(actor, 'manual_reject', order.id, { reason });
  return out;
}

/**
 * 12-hour delayed trigger for automatic activation.
 * Automatically activates VIP access for unredeemed orders after 12 hours from verification.
 */
export function triggerDelayedActivations() {
  const now = nowIso();
  const dueOrders = all(
    `SELECT o.*, c.code, c.id AS code_pk, c.status AS code_status, c.device_id AS code_device_id
     FROM orders o
     JOIN codes c ON o.code_id = c.id
     WHERE o.status = 'verified'
       AND o.auto_activate_at IS NOT NULL
       AND o.auto_activate_at <= ?
       AND o.auto_activated_at IS NULL
       AND c.status = 'issued'`,
    now
  );

  let activatedCount = 0;
  for (const order of dueOrders) {
    try {
      const plan = PLANS[order.plan];
      if (!plan) continue;

      const actNow = new Date();
      const expires = addMonths(actNow, plan.months).toISOString();

      tx(() => {
        // Ensure canonical user account exists so internal /verify and /entitlement lookups succeed
        const cleanEmail = normalizeEmail(order.email).value || String(order.email || '').trim().toLowerCase();
        let userRow = get('SELECT * FROM users WHERE email=?', cleanEmail);
        if (!userRow) {
          const uid = `usr_${randomBytes(6).toString('hex')}`;
          run("INSERT INTO users(id, email, role, status, created_at) VALUES (?, ?, 'customer', 'active', ?)", uid, cleanEmail, now);
          userRow = get('SELECT * FROM users WHERE id=?', uid);
        }

        // Mark code redeemed without device lock so user's first device binds cleanly on load
        run(
          "UPDATE codes SET status='redeemed', device_id=NULL, activated_at=?, expires_at=? WHERE id=?",
          actNow.toISOString(),
          expires,
          order.code_pk
        );

        // Record active entitlement keyed by canonical userRow.id
        run(
          `INSERT INTO entitlements (user_id, order_id, code_id, plan, active, device_limit, starts_at, ends_at, created_at)
           VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)`,
          userRow.id,
          order.id,
          order.code_pk,
          order.plan,
          actNow.toISOString(),
          expires,
          now
        );

        // Update order status
        run(
          "UPDATE orders SET auto_activated_at=?, status_reason='auto_activated_after_12h', updated_at=? WHERE id=?",
          now,
          now,
          order.id
        );

        // Queue auto-activation notification email
        queueAutoActivatedEmail(order, order.code, expires);
        audit('system', 'order_auto_activated_12h', order.id, {
          plan: order.plan,
          code: order.code,
          expiresAt: expires,
        });
      });

      activatedCount++;
    } catch (err) {
      console.error(`[AutoActivate] Error activating order ${order.public_id}:`, err?.message || err);
    }
  }

  if (activatedCount > 0) {
    processOutbox().catch(() => {});
  }

  return activatedCount;
}

