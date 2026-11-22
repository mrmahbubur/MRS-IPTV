import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

function safeUpperEqual(a, b) {
  const x = Buffer.from(String(a || '').trim().toUpperCase());
  const y = Buffer.from(String(b || '').trim().toUpperCase());
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Verify Skrill Quick Checkout status URL callback using md5sig or sha256sig.
 * Spec: MD5(merchant_id + transaction_id + UPPER(MD5(secret_word)) + mb_amount + mb_currency + status)
 */
export function verifySkrillWebhook(payload = {}) {
  const { merchantId, secretWord, payToEmail, enabled } = config.providers.skrill;
  if (!enabled && !secretWord) {
    return { ok: false, code: 'provider_disabled', message: 'Skrill webhook verification is not configured.' };
  }
  if (!secretWord) {
    return { ok: false, code: 'missing_secret', message: 'SKRILL_SECRET_WORD is not configured.' };
  }

  const mId = String(payload.merchant_id || merchantId || '');
  const trxId = String(payload.mb_transaction_id || payload.transaction_id || '').trim();
  const mbAmount = String(payload.mb_amount ?? payload.amount ?? '');
  const mbCurrency = String(payload.mb_currency || payload.currency || '').toUpperCase();
  const status = String(payload.status ?? '');
  const payTo = String(payload.pay_to_email || '').toLowerCase();

  if (merchantId && mId !== String(merchantId)) {
    return { ok: false, code: 'merchant_mismatch', message: 'Skrill merchant_id mismatch.' };
  }
  if (payToEmail && payTo && payTo !== String(payToEmail).toLowerCase()) {
    return { ok: false, code: 'recipient_mismatch', message: 'Skrill pay_to_email mismatch.' };
  }

  const secretMd5 = createHash('md5').update(secretWord).digest('hex').toUpperCase();
  const concat = `${mId}${String(payload.transaction_id || trxId)}${secretMd5}${mbAmount}${mbCurrency}${status}`;
  const expectedMd5 = createHash('md5').update(concat).digest('hex').toUpperCase();
  const expectedSha256 = createHash('sha256').update(concat).digest('hex').toUpperCase();

  const gotMd5 = String(payload.md5sig || '');
  const gotSha256 = String(payload.sha256sig || '');

  const sigValid =
    (gotSha256 && safeUpperEqual(gotSha256, expectedSha256)) ||
    (gotMd5 && safeUpperEqual(gotMd5, expectedMd5));

  if (!sigValid) {
    return { ok: false, code: 'invalid_signature', message: 'Invalid Skrill md5sig/sha256sig signature.' };
  }

  if (status !== '2') {
    return { ok: true, ignored: true, reason: `status_${status}` };
  }

  const amountMinor = Math.round(Number.parseFloat(mbAmount) * 100);
  if (!trxId || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { ok: false, code: 'invalid_payload', message: 'Missing transaction ID or amount.' };
  }

  return {
    ok: true,
    entry: {
      channel: 'skrill',
      trxId: trxId.toUpperCase(),
      amountMinor,
      currency: mbCurrency || 'USD',
      sender: payload.pay_from_email ? String(payload.pay_from_email).toLowerCase() : null,
      receivedAt: new Date().toISOString(),
    },
  };
}
