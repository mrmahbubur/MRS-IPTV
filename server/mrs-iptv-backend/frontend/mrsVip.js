// M R S IPTV – VIP Pass client. Drop this file into your site (e.g. src/lib/mrsVip.js).
// Framework-agnostic ES module: works in React/Vite (AI Studio), plain HTML, and the Median WebView.
//
//   import { configure, submitOrder, waitForVerification, redeemCode, refreshEntitlement, isVip } from './lib/mrsVip.js';
//   configure({ apiBase: 'https://YOUR-BACKEND-URL' });

const cfg = { apiBase: '' };
export function configure({ apiBase }) { cfg.apiBase = String(apiBase || '').replace(/\/+$/, ''); }

// -- tiny safe storage (localStorage can throw in private mode / WebViews) -----
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Stable per-device id. A code binds to the first device that redeems it. */
export function getDeviceId() {
  let id = store.get('mrs_device_id');
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    const bytes = new Uint8Array(16);
    (globalThis.crypto || window.crypto).getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    store.set('mrs_device_id', id);
  }
  return id;
}

async function api(path, init) {
  let res;
  try { res = await fetch(cfg.apiBase + path, init); }
  catch { const e = new Error('Cannot reach the server. Check your internet connection and try again.'); e.code = 'network'; throw e; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.message || 'Request failed');
    e.status = res.status; e.code = data?.error?.code; e.fields = data?.error?.fields || null;
    throw e;
  }
  return data;
}

/** UI value → API value. Plan cards: 1/2/6/12 months. Tabs: Bangladesh / International. */
export const planFromMonths = (m) => ({ 1: '1m', 2: '2m', 6: '6m', 12: '12m' })[Number(m)];
export const regionFromTab = (tab) => (/bangladesh/i.test(tab) ? 'BD' : 'INTL');

/**
 * Submit the checkout form.
 * @param {{plan:'1m'|'2m'|'6m'|'12m', region:'BD'|'INTL', channel:'bkash'|'nagad'|'binance'|'skrill'|'payoneer',
 *          phone:string, email:string, trxId?:string, screenshot?:File|Blob}} o
 * @returns {Promise<{orderId:string,status:string,reason:string|null,message:string,email:string}>}
 * Throws an Error with `.fields` ({email:'…', trxId:'…'}) on validation problems – show them under the inputs.
 */
export function submitOrder({ plan, region, channel, phone, email, trxId, screenshot }) {
  const fd = new FormData();
  fd.append('plan', plan); fd.append('region', region); fd.append('channel', channel);
  fd.append('phone', phone); fd.append('email', email);
  if (trxId && String(trxId).trim()) fd.append('trxId', String(trxId).trim());
  if (screenshot) fd.append('screenshot', screenshot, screenshot.name || 'payment.png');
  return api('/api/orders', { method: 'POST', body: fd });
}

/** Poll until the order leaves "pending" (verified / needs_review / rejected / expired) or the timeout hits. */
export async function waitForVerification(orderId, { onUpdate, intervalMs = 5000, timeoutMs = 10 * 60_000, signal } = {}) {
  const t0 = Date.now();
  for (;;) {
    const o = await api(`/api/orders/${encodeURIComponent(orderId)}`);
    onUpdate?.(o);
    if (o.status !== 'pending' || signal?.aborted || Date.now() - t0 > timeoutMs) return o;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ---------------------------- redeem + entitlement ---------------------------
const KEY = 'mrs_vip_entitlement';
const save = (e) => store.set(KEY, JSON.stringify({ plan: e.plan, planLabel: e.planLabel, expiresAt: e.expiresAt, token: e.token }));

export function getCachedEntitlement() {
  try { const e = JSON.parse(store.get(KEY) || 'null'); return e && Date.parse(e.expiresAt) > Date.now() ? { active: true, ...e } : null; }
  catch { return null; }
}
/** Synchronous VIP flag for gating ads / 4K streams. Call refreshEntitlement() on startup to keep it honest. */
export const isVip = () => !!getCachedEntitlement();

/** "ACTIVATE PASS NOW". Throws Error(message) – show `err.message`. */
export async function redeemCode(code) {
  const r = await api('/api/redeem', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: String(code).replace(/\D/g, ''), deviceId: getDeviceId() }),
  });
  save(r);
  return r;
}

/** Ask the server whether this device's pass is still valid (revoked / expired / moved). Offline → trust the cache until expiry. */
export async function refreshEntitlement() {
  const cached = getCachedEntitlement();
  if (!cached) return { active: false };
  try {
    const r = await api('/api/entitlement', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: cached.token, deviceId: getDeviceId() }),
    });
    save(r);
    return r;
  } catch (e) {
    if (e.code === 'network' || !e.status || e.status >= 500) return { ...cached, offline: true };
    store.del(KEY); // 401/403/410: revoked, expired or tied to another device
    return { active: false, reason: e.code };
  }
}
