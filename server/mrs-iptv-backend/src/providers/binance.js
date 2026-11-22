import { createHmac, createVerify, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { parseBinanceTx } from '../parsers.js';

function safeHexOrBase64Equal(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Verify Binance Pay webhook signature and normalize payment into ledger entry.
 * Supports HMAC-SHA256 (BINANCE_WEBHOOK_SECRET) or RSA-SHA256 (BINANCE_WEBHOOK_PUBLIC_KEY).
 */
export function verifyBinanceWebhook(headers, rawBody) {
  const { webhookSecret, webhookPublicKey, enabled } = config.providers.binance;
  const sig = headers['binancepay-signature'] || headers['x-binance-signature'] || '';
  const ts = headers['binancepay-timestamp'] || headers['x-binance-timestamp'] || '';
  const nonce = headers['binancepay-nonce'] || headers['x-binance-nonce'] || '';
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');

  if (!enabled && !webhookSecret && !webhookPublicKey) {
    return { ok: false, code: 'provider_disabled', message: 'Binance webhook verification is not configured.' };
  }

  const payloadToSign = ts && nonce ? `${ts}\n${nonce}\n${bodyStr}\n` : bodyStr;

  if (webhookPublicKey) {
    try {
      const verifier = createVerify('RSA-SHA256');
      verifier.update(payloadToSign);
      verifier.end();
      const verified = verifier.verify(webhookPublicKey, String(sig), 'base64');
      if (!verified) return { ok: false, code: 'invalid_signature', message: 'Invalid Binance Pay RSA signature.' };
    } catch {
      return { ok: false, code: 'invalid_signature', message: 'Binance Pay signature check failed.' };
    }
  } else if (webhookSecret) {
    if (!sig) return { ok: false, code: 'missing_signature', message: 'Missing BinancePay-Signature header.' };
    const expectedHex = createHmac('sha256', webhookSecret).update(payloadToSign).digest('hex');
    const expectedB64 = createHmac('sha256', webhookSecret).update(payloadToSign).digest('base64');
    if (!safeHexOrBase64Equal(sig, expectedHex) && !safeHexOrBase64Equal(sig, expectedB64)) {
      return { ok: false, code: 'invalid_signature', message: 'Invalid Binance Pay HMAC signature.' };
    }
  } else {
    return { ok: false, code: 'missing_secret', message: 'BINANCE_WEBHOOK_SECRET or BINANCE_WEBHOOK_PUBLIC_KEY not configured.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyStr || '{}');
  } catch {
    return { ok: false, code: 'invalid_json', message: 'Malformed Binance webhook JSON.' };
  }

  const data = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : (parsed.data || parsed);
  const status = String(parsed.bizStatus || data.bizStatus || data.status || '').toUpperCase();
  if (status && !['PAY_SUCCESS', 'SUCCESS', 'PAID', 'COMPLETED'].includes(status)) {
    return { ok: true, ignored: true, reason: `status_${status}` };
  }

  const entry = parseBinanceTx({
    orderType: data.orderType || 'PAY',
    transactionId: data.transactionId || data.prepayId || data.merchantTradeNo || parsed.bizIdStr || parsed.bizId,
    transactionTime: data.transactTime || data.transactionTime || Date.now(),
    amount: data.orderAmount ?? data.amount ?? data.totalFee,
    currency: data.currency || 'USDT',
    payerInfo: data.payerInfo || { name: data.payerName || data.buyerName || null, binanceId: data.buyerId || null },
  });

  if (!entry) {
    return { ok: true, ignored: true, reason: 'unparsed_or_non_incoming' };
  }

  return { ok: true, entry };
}
