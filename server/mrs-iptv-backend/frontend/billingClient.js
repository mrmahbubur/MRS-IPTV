// billingClient.js - Universal client for M R S IPTV billing & proxy gate
// No dependencies (Node 18+ native fetch and crypto)
import crypto from 'node:crypto';

export class BillingClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.BILLING_URL || 'http://127.0.0.1:3000';
    this.payKey = options.payKey || process.env.BILLING_PAY_KEY || '';
    this.readKey = options.readKey || process.env.BILLING_READ_KEY || '';
    this.webhookSecret = options.webhookSecret || process.env.INTERNAL_WEBHOOK_SECRET || '';
    this.timeoutMs = options.timeoutMs || 4000;
  }

  async call(endpointPath, { method = 'GET', body = null, key = null } = {}) {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    const effectiveKey = key || this.readKey;

    if (effectiveKey) {
      headers['authorization'] = `Bearer ${effectiveKey}`;
    }

    if (payload) {
      headers['content-type'] = 'application/json';
      if (this.webhookSecret) {
        headers['x-signature'] = 'sha256=' + crypto.createHmac('sha256', this.webhookSecret).update(payload).digest('hex');
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${endpointPath}`, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        err.status = res.status;
        err.code = data?.error?.code;
        err.details = data?.error?.details;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // 1. Create order
  createOrder(email, planCode) {
    return this.call('/api/internal/orders', {
      method: 'POST',
      key: this.payKey,
      body: { email, planCode },
    });
  }

  // 2. Confirm payment
  confirmPayment(orderPayload) {
    return this.call('/api/internal/payment-confirmed', {
      method: 'POST',
      key: this.payKey,
      body: orderPayload,
    });
  }

  // 3. Check entitlement
  checkEntitlement(userIdOrEmail) {
    const param = String(userIdOrEmail).includes('@') ? `email=${encodeURIComponent(userIdOrEmail)}` : `userId=${encodeURIComponent(userIdOrEmail)}`;
    return this.call(`/api/internal/entitlement?${param}`, {
      method: 'GET',
      key: this.readKey,
    });
  }

  // 4. Proxy gate: fail-closed verification
  async mayWatch(userId, targetUrl) {
    try {
      const q = new URLSearchParams({ userId: String(userId || ''), target: targetUrl });
      const r = await this.call(`/api/internal/verify?${q}`, {
        method: 'GET',
        key: this.readKey,
      });
      return r.entitled === true;
    } catch {
      return false; // Fail closed: never open gate on billing failure
    }
  }

  // 5. Ping
  ping() {
    return this.call('/api/internal/ping', { method: 'GET' });
  }
}
