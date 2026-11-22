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
 * Nagad merchant checkout webhook adapter (activated via NAGAD_MERCHANT_ENABLED=true + NAGAD_WEBHOOK_SECRET).
 */
export function verifyNagadWebhook(headers, rawBody, payload = {}) {
  const { enabled, webhookSecret } = config.providers.nagad;
  if (!enabled && !webhookSecret) {
    return { ok: false, code: 'provider_disabled', message: 'Nagad merchant API webhook is disabled. Forward official Nagad SMS to /api/webhooks/sms.' };
  }
  const sig = headers['x-nagad-signature'] || headers['x-webhook-signature'] || '';
  if (!verifyHmac(rawBody, sig, webhookSecret)) {
    return { ok: false, code: 'invalid_signature', message: 'Invalid Nagad webhook signature.' };
  }

  const status = String(payload.status || payload.paymentStatus || '').toLowerCase();
  if (status && !['success', 'completed', 'succeeded'].includes(status)) {
    return { ok: true, ignored: true, reason: `status_${status}` };
  }

  const trxId = String(payload.issuerPaymentRefNo || payload.trxId || payload.orderId || '').trim().toUpperCase();
  const amountMinor = Math.round(Number.parseFloat(String(payload.amount ?? '0')) * 100);
  if (!trxId || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { ok: false, code: 'invalid_payload', message: 'Missing Nagad trxId or amount.' };
  }

  return {
    ok: true,
    entry: {
      channel: 'nagad',
      trxId,
      amountMinor,
      currency: String(payload.currency || 'BDT').toUpperCase(),
      sender: payload.clientMobileNo ? String(payload.clientMobileNo).trim() : null,
      receivedAt: payload.issuerPaymentDateTime || new Date().toISOString(),
    },
  };
}
