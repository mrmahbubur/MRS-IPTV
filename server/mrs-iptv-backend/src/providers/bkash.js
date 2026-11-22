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
 * bKash merchant / tokenized checkout webhook adapter (activated via BKASH_MERCHANT_ENABLED=true + BKASH_WEBHOOK_SECRET).
 */
export function verifyBkashWebhook(headers, rawBody, payload = {}) {
  const { enabled, webhookSecret } = config.providers.bkash;
  if (!enabled && !webhookSecret) {
    return { ok: false, code: 'provider_disabled', message: 'bKash merchant API webhook is disabled. Forward official bKash SMS to /api/webhooks/sms.' };
  }
  const sig = headers['x-bkash-signature'] || headers['x-webhook-signature'] || '';
  if (!verifyHmac(rawBody, sig, webhookSecret)) {
    return { ok: false, code: 'invalid_signature', message: 'Invalid bKash webhook signature.' };
  }

  const status = String(payload.transactionStatus || payload.status || '').toLowerCase();
  if (status && !['completed', 'success', 'succeeded'].includes(status)) {
    return { ok: true, ignored: true, reason: `status_${status}` };
  }

  const trxId = String(payload.trxID || payload.trxId || payload.paymentID || '').trim().toUpperCase();
  const amountMinor = Math.round(Number.parseFloat(String(payload.amount ?? '0')) * 100);
  if (!trxId || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { ok: false, code: 'invalid_payload', message: 'Missing bKash trxID or amount.' };
  }

  return {
    ok: true,
    entry: {
      channel: 'bkash',
      trxId,
      amountMinor,
      currency: String(payload.currency || 'BDT').toUpperCase(),
      sender: payload.customerMsisdn ? String(payload.customerMsisdn).trim() : null,
      receivedAt: payload.paymentExecuteTime || new Date().toISOString(),
    },
  };
}
