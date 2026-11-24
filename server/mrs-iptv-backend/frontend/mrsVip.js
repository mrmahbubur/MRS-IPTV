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

export function getCheckoutChallenge() {
  return api('/api/payments/challenge');
}

function sha256BytesFallback(ascii) {
  const bytes = new TextEncoder().encode(ascii);
  const words = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8));
  }
  const bitLen = bytes.length * 8;
  words[bitLen >> 5] = (words[bitLen >> 5] || 0) | (0x80 << (24 - (bitLen % 32)));
  words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;

  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rrot = (n, c) => (n >>> c) | (n << (32 - c));
  const w = new Array(64);

  for (let j = 0; j < words.length; j += 16) {
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      if (i < 16) {
        w[i] = words[j + i] || 0;
      } else {
        const s0 = rrot(w[i - 15], 7) ^ rrot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rrot(w[i - 2], 17) ^ rrot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (H[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i] >>> 8) & 0xff;
    out[i * 4 + 3] = H[i] & 0xff;
  }
  return out;
}

async function sha256Bytes(input) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
      return new Uint8Array(digest);
    } catch { /* fallback */ }
  }
  return sha256BytesFallback(input);
}

function hasLeadingZeroBits(buf, bits) {
  const fullBytes = Math.floor(bits / 8);
  const remBits = bits % 8;
  for (let i = 0; i < fullBytes; i++) {
    if (buf[i] !== 0) return false;
  }
  if (remBits > 0) {
    const mask = 0xff << (8 - remBits);
    if ((buf[fullBytes] & mask) !== 0) return false;
  }
  return true;
}

export async function solveCheckoutChallenge(preloaded) {
  const ch = preloaded?.challengeToken && preloaded?.nonce ? preloaded : await getCheckoutChallenge();
  const difficulty = Math.max(4, Math.min(16, Number(ch.difficulty) || 10));
  for (let counter = 0; counter < 250_000; counter++) {
    const candidate = counter.toString(36);
    const digest = await sha256Bytes(`${ch.nonce}:${candidate}`);
    if (hasLeadingZeroBits(digest, difficulty)) {
      return { challengeToken: ch.challengeToken, challengeSolution: candidate };
    }
  }
  throw new Error('Could not complete checkout security verification.');
}

/**
 * Submit the checkout form.
 * Automatically solves single-use HMAC Proof-of-Work challenge and supports optional Turnstile/hCaptcha tokens.
 * @param {{plan:'1m'|'2m'|'6m'|'12m', region:'BD'|'INTL', channel:'bkash'|'nagad'|'binance'|'skrill'|'payoneer',
 *          phone:string, email:string, trxId?:string, screenshot?:File|Blob, website_url?:string, captchaToken?:string, challenge?:object}} o
 * @returns {Promise<{orderId:string,status:string,reason:string|null,message:string,email:string}>}
 * Throws an Error with `.fields` ({email:'…', trxId:'…'}) on validation problems – show them under the inputs.
 */
export async function submitOrder({ plan, region, channel, phone, email, trxId, screenshot, website_url, captchaToken, challenge }) {
  const solved = await solveCheckoutChallenge(challenge).catch(() => null);
  const fd = new FormData();
  fd.append('plan', plan); fd.append('region', region); fd.append('channel', channel);
  fd.append('phone', phone); fd.append('email', email);
  fd.append('website_url', website_url || '');
  if (solved) {
    fd.append('challengeToken', solved.challengeToken);
    fd.append('challengeSolution', solved.challengeSolution);
  }
  if (captchaToken && String(captchaToken).trim()) fd.append('captchaToken', String(captchaToken).trim());
  if (trxId && String(trxId).trim()) fd.append('trxId', String(trxId).trim());
  if (screenshot) fd.append('screenshot', screenshot, screenshot.name || 'payment.png');
  return api('/api/payments/submit', { method: 'POST', body: fd });
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
