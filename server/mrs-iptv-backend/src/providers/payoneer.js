import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

function verifyHmac(rawBody, sig, secret) {
  if (!secret || !sig) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''));
  const cleanSig = String(sig).replace(/^sha256=/i, '').trim();
  const expectedHex = createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(cleanSig.toLowerCase());
  const b = Buffer.from(expectedHex.toLowerCase());
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Payoneer webhook adapter (with Gmail email ingest + manual admin fallback).
 */
export function verifyPayoneerWebhook(headers, rawBody, payload = {}) {
  const { enabled, webhookSecret } = config.providers.payoneer;
  if (!enabled && !webhookSecret) {
    return { ok: false, code: 'provider_disabled', message: 'Payoneer webhook disabled; Payoneer payments are matched via Gmail ingest or Admin review.' };
  }
  const sig = headers['x-payoneer-signature'] || headers['x-webhook-signature'] || '';
  if (!verifyHmac(rawBody, sig, webhookSecret)) {
    return { ok: false, code: 'invalid_signature', message: 'Invalid Payoneer webhook signature.' };
  }

  const trxId = String(payload.paymentId || payload.transactionId || payload.trxId || '').trim().toUpperCase();
  const amountMinor = Math.round(Number.parseFloat(String(payload.amount ?? '0')) * 100);
  if (!trxId || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { ok: false, code: 'invalid_payload', message: 'Missing Payoneer paymentId or amount.' };
  }

  return {
    ok: true,
    entry: {
      channel: 'payoneer',
      trxId,
      amountMinor,
      currency: String(payload.currency || 'USD').toUpperCase(),
      sender: payload.payerEmail ? String(payload.payerEmail).toLowerCase() : (payload.payerName || null),
      receivedAt: payload.timestamp || new Date().toISOString(),
    },
  };
}
