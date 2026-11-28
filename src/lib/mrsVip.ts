// M R S IPTV – VIP Pass & Payment Client SDK (TypeScript)
// Point API_BASE_URL (or VITE_API_BASE_URL) at your backend deployment URL when hosting the frontend separately.
export const API_BASE_URL: string = (
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) ||
  ''
).replace(/\/+$/, '');

const cfg = { apiBase: API_BASE_URL };

export function configure({ apiBase }: { apiBase?: string }) {
  cfg.apiBase = String(apiBase || '').replace(/\/+$/, '');
}

// Safe storage wrapper (handles private mode / iframe restrictions)
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

/** Stable per-device id. Used for single-device & 2-device entitlement locking. */
export function getDeviceId(): string {
  const existing = store.get('mrs_device_id');
  if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) {
    return existing;
  }
  const legacy = store.get('shahintv_device_id');
  if (legacy && /^[A-Za-z0-9_-]{16,128}$/.test(legacy)) {
    store.set('mrs_device_id', legacy);
    return legacy;
  }

  let id = '';
  const c: Crypto | undefined =
    (typeof globalThis !== 'undefined' && globalThis.crypto) ||
    (typeof window !== 'undefined' && (window.crypto || (window as any).msCrypto)) ||
    undefined;

  try {
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(24);
      c.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } else if (c && typeof c.randomUUID === 'function') {
      id = c.randomUUID().replace(/-/g, '');
    }
  } catch {
    // ignore and fallback below
  }

  if (!id || id.length < 16) {
    const t = Date.now().toString(16);
    const p = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? Math.floor(performance.now() * 1000).toString(16)
      : '0';
    let pool = `${t}_${p}_`;
    while (pool.length < 32) {
      pool += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    }
    id = `dev_${pool.slice(0, 32)}`;
  }

  store.set('mrs_device_id', id);
  return id;
}

export function getDeviceLabel(): string {
  try {
    const ua = navigator.userAgent || 'Web Browser';
    if (/Android.*TV|BRAVIA|AFT|MIBOX|Shield|GoogleTV/i.test(ua)) return 'Android TV';
    if (/Android/i.test(ua)) return 'Android Mobile';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Device';
    if (/Windows/i.test(ua)) return 'Windows Browser';
    if (/Mac/i.test(ua)) return 'macOS Browser';
    return 'Web Browser';
  } catch {
    return 'Web Browser';
  }
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  fields?: Record<string, string> | null;
}

async function api(path: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(cfg.apiBase + path, init);
  } catch {
    const e = new Error('Cannot reach the server. Check your internet connection and try again.') as ApiError;
    e.code = 'network';
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.message || 'Request failed') as ApiError;
    e.status = res.status;
    e.code = data?.error?.code;
    e.fields = data?.error?.fields || null;
    throw e;
  }
  return data;
}

export function formatActivationCodeInput(raw: string): string {
  const cleaned = String(raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('MRS')) {
    const bare = cleaned.replace(/-/g, '').slice(0, 18);
    const match = bare.match(/^MRS(1M|2M|6M|12M)(.*)$/);
    if (match) {
      const plan = match[1];
      const rest = match[2];
      const parts = [rest.slice(0, 4), rest.slice(4, 8), rest.slice(8, 12)].filter(Boolean);
      return parts.length > 0 ? `MRS-${plan}-${parts.join('-')}` : `MRS-${plan}`;
    }
    return cleaned.slice(0, 22);
  }
  return cleaned.slice(0, 22);
}

export function normalizeCodeForServer(raw: string): string {
  const trimmed = String(raw || '').trim().toUpperCase();
  const bare = trimmed.replace(/[^A-Z0-9]/g, '');
  if (/^\d+$/.test(bare)) return bare;
  if (bare.startsWith('MRS')) {
    const match = bare.match(/^MRS(1M|2M|6M|12M)([A-Z0-9]{4})([A-Z0-9]{4})([A-Z0-9]{4})$/);
    if (match) return `MRS-${match[1]}-${match[2]}-${match[3]}-${match[4]}`;
  }
  return trimmed;
}

/** UI value -> API value. Plan cards: 1/2/6/12 months. Tabs: Bangladesh / International. */
export const planFromMonths = (m: number | string): '1m' | '2m' | '6m' | '12m' => {
  const map: Record<number, '1m' | '2m' | '6m' | '12m'> = {
    1: '1m',
    2: '2m',
    6: '6m',
    12: '12m',
  };
  return map[Number(m)] || '1m';
};

export const regionFromTab = (tab: string): 'BD' | 'INTL' => (/bangladesh/i.test(tab) || tab === 'bd' ? 'BD' : 'INTL');

export interface PaymentMethodConfig {
  id: 'bkash' | 'nagad' | 'binance' | 'skrill' | 'payoneer';
  name: string;
  currency: 'BDT' | 'USD';
  regions: ('BD' | 'INTL')[];
  accountLabel: string;
  account: string;
  secondaryAccount?: string;
  accountType?: string;
  referenceHint?: string;
  instructionsEn: string[];
  instructionsBn: string[];
}

export interface PaymentMethodsPayload {
  ok: boolean;
  methods: PaymentMethodConfig[];
  support: {
    whatsapp: string;
    telegram?: string;
    facebook?: string;
    email: string;
  };
}

export async function getPaymentMethods(): Promise<PaymentMethodsPayload> {
  return api('/api/payment-methods');
}

export interface CheckoutChallenge {
  ok: boolean;
  challengeToken: string;
  nonce: string;
  difficulty: number;
  expiresAt: string;
  turnstileSiteKey?: string | null;
  hcaptchaSiteKey?: string | null;
  captchaProvider?: 'turnstile' | 'hcaptcha' | 'pow';
}

export async function getCheckoutChallenge(): Promise<CheckoutChallenge> {
  return api('/api/payments/challenge');
}

function sha256BytesFallback(ascii: string): Uint8Array {
  const bytes = new TextEncoder().encode(ascii);
  const words: number[] = [];
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
  const rrot = (n: number, c: number) => (n >>> c) | (n << (32 - c));
  const w = new Array<number>(64);

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

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
      return new Uint8Array(digest);
    } catch {
      /* fallback below */
    }
  }
  return sha256BytesFallback(input);
}

function hasLeadingZeroBits(buf: Uint8Array, bits: number): boolean {
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

export async function solveCheckoutChallenge(preloaded?: CheckoutChallenge | null): Promise<{
  challengeToken: string;
  challengeSolution: string;
}> {
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

export interface SubmitOrderParams {
  plan: '1m' | '2m' | '6m' | '12m';
  region: 'BD' | 'INTL';
  channel: 'bkash' | 'nagad' | 'binance' | 'skrill' | 'payoneer';
  phone: string;
  email: string;
  name?: string;
  trxId?: string;
  screenshot?: File | Blob | null;
  website_url?: string;
  captchaToken?: string;
  challenge?: CheckoutChallenge | null;
}

export interface OrderResponse {
  orderId: string;
  ref?: string;
  status: 'pending' | 'verified' | 'needs_review' | 'rejected' | 'expired';
  step?: number;
  reason: string | null;
  message: string;
  verificationMethod?: string | null;
  aiSummary?: string | null;
  email: string;
  channel?: string;
  plan?: string;
  planLabel?: string;
  emailStatus?: string | null;
  copyEmailStatus?: string | null;
  autoActivateAt?: string | null;
  autoActivatedAt?: string | null;
  createdAt?: string;
}

const LAST_ORDER_KEY = 'mrs_last_order_id';

export function getLastOrderId(): string | null {
  return store.get(LAST_ORDER_KEY);
}

/**
 * Submit the checkout form to POST /api/payments/submit.
 * Solves a lightweight single-use HMAC Proof-of-Work challenge automatically.
 * Throws an Error with `.fields` ({email:'…', trxId:'…'}) on validation problems.
 */
export async function submitOrder({
  plan,
  region,
  channel,
  phone,
  email,
  name,
  trxId,
  screenshot,
  website_url,
  captchaToken,
  challenge,
}: SubmitOrderParams): Promise<OrderResponse> {
  const solved = await solveCheckoutChallenge(challenge).catch(() => null);
  const fd = new FormData();
  fd.append('plan', plan);
  fd.append('region', region);
  fd.append('channel', channel);
  fd.append('method', channel);
  fd.append('phone', phone);
  fd.append('sender_account', phone);
  fd.append('email', email);
  fd.append('website_url', website_url || '');
  if (solved) {
    fd.append('challengeToken', solved.challengeToken);
    fd.append('challengeSolution', solved.challengeSolution);
  }
  if (captchaToken && String(captchaToken).trim()) {
    fd.append('captchaToken', String(captchaToken).trim());
  }
  if (name && String(name).trim()) fd.append('name', String(name).trim());
  if (trxId && String(trxId).trim()) fd.append('trxId', String(trxId).trim());
  if (screenshot) {
    const fallbackName = screenshot.type === 'application/pdf' ? 'payment.pdf' : 'payment.png';
    fd.append('screenshot', screenshot, (screenshot as File).name || fallbackName);
  }
  const order: OrderResponse = await api('/api/payments/submit', { method: 'POST', body: fd });
  if (order?.orderId) {
    store.set(LAST_ORDER_KEY, order.orderId);
  }
  return order;
}

export async function getOrderStatus(ref: string): Promise<OrderResponse> {
  return api(`/api/orders/${encodeURIComponent(ref)}/status`);
}

export interface WaitForVerificationOptions {
  onUpdate?: (order: OrderResponse) => void;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Poll until the order leaves "pending" (verified / needs_review / rejected / expired) or the timeout hits. */
export async function waitForVerification(
  orderId: string,
  { onUpdate, intervalMs = 5000, timeoutMs = 10 * 60_000, signal }: WaitForVerificationOptions = {}
): Promise<OrderResponse> {
  const t0 = Date.now();
  for (;;) {
    const o: OrderResponse = await getOrderStatus(orderId);
    onUpdate?.(o);
    if (o.status !== 'pending' || signal?.aborted || Date.now() - t0 > timeoutMs) return o;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ---------------------------- redeem / activate + entitlement ---------------------------
const KEY = 'mrs_vip_entitlement';
const ADS_HINT_KEY = 'mrs_vip_ads_hint';

export interface RegisteredDeviceInfo {
  deviceHash: string;
  label: string;
  lastSeen: string;
  isCurrent: boolean;
}

export interface EntitlementData {
  active: boolean;
  plan?: string;
  planLabel?: string;
  months?: number;
  durationDays?: number;
  daysRemaining?: number;
  activatedAt?: string;
  expiresAt?: string;
  deviceLimit?: number;
  devices?: RegisteredDeviceInfo[];
  email?: string;
  token?: string;
  offline?: boolean;
  reason?: string;
}

const save = (e: any) => {
  store.set(
    KEY,
    JSON.stringify({
      plan: e.plan,
      planLabel: e.planLabel,
      months: e.months,
      durationDays: e.durationDays,
      daysRemaining: e.daysRemaining,
      activatedAt: e.activatedAt,
      expiresAt: e.expiresAt,
      deviceLimit: e.deviceLimit,
      devices: e.devices,
      email: e.email,
      token: e.token,
    })
  );
  if (e?.token && e?.expiresAt) {
    store.set(ADS_HINT_KEY, JSON.stringify({ expiresAt: e.expiresAt }));
    store.del('mrs_ads_expired_notice');
  }
};

export function getCachedEntitlement(): EntitlementData | null {
  try {
    const raw = store.get(KEY);
    if (!raw) return null;
    const e = JSON.parse(raw);
    if (e && Date.parse(e.expiresAt) > Date.now()) {
      return { active: true, ...e };
    }
    return null;
  } catch {
    return null;
  }
}

/** Synchronous VIP flag checked cleanly against cached token; server verification runs via refreshEntitlement(). */
export const isVip = (): boolean => !!getCachedEntitlement();

export async function finalizeVipActivationReload(expiresAt?: string): Promise<void> {
  if (expiresAt) {
    store.set(ADS_HINT_KEY, JSON.stringify({ expiresAt }));
  }
  store.del('mrs_ads_expired_notice');
  try {
    const gate = typeof window !== 'undefined' ? (window as any).MRS_ADS : null;
    if (gate && typeof gate.enterVipMode === 'function') {
      await gate.enterVipMode(expiresAt);
    }
  } catch {}
  try {
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
      window.location.reload();
    }
  } catch {}
}

export function clearVipSession() {
  store.del(KEY);
  store.del(ADS_HINT_KEY);
  store.del('shahintv_adfree_activation');
  try {
    document.cookie = 'mrs_vip_active=0; max-age=0; path=/; SameSite=Lax';
    if (typeof window !== 'undefined') {
      (window as any).__MRS_IS_VIP = false;
      (window as any).MRS_ADS?.refresh?.();
    }
  } catch {}
}

export interface RedeemResponse {
  ok?: boolean;
  plan: string;
  planLabel: string;
  months?: number;
  durationDays?: number;
  daysRemaining?: number;
  activatedAt?: string;
  expiresAt: string;
  deviceLimit?: number;
  devices?: RegisteredDeviceInfo[];
  email?: string;
  token: string;
}

/** Activate using /api/activate (supports MRS-<PLAN>-XXXX-XXXX-XXXX & legacy codes, email extension, 2-device tracking). */
export async function activatePass({
  code,
  email,
  deviceId,
  deviceLabel,
}: {
  code: string;
  email?: string;
  deviceId?: string;
  deviceLabel?: string;
}): Promise<RedeemResponse> {
  const cleanCode = normalizeCodeForServer(code);
  const r: RedeemResponse = await api('/api/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: cleanCode,
      email: email?.trim() || undefined,
      deviceId: deviceId || getDeviceId(),
      deviceLabel: deviceLabel || getDeviceLabel(),
    }),
  });
  save(r);
  return r;
}

/** Quick activation using /api/redeem (single-device code endpoint). */
export async function redeemCode(code: string): Promise<RedeemResponse> {
  const cleanCode = normalizeCodeForServer(code);
  const r: RedeemResponse = await api('/api/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: cleanCode, deviceId: getDeviceId() }),
  });
  save(r);
  return r;
}

export interface ClaimOrderResponse extends RedeemResponse {
  autoActivated?: boolean;
}

/** Claim a 12-hour automatically activated order pass and bind it to this device. */
export async function claimAutoActivatedOrder(orderId: string): Promise<ClaimOrderResponse> {
  const r: ClaimOrderResponse = await api(`/api/orders/${encodeURIComponent(orderId)}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: getDeviceId() }),
  });
  save(r);
  return r;
}

export async function syncPendingOrderVip(): Promise<{
  claimed: boolean;
  entitlement?: EntitlementData;
  order?: OrderResponse;
}> {
  const lastId = store.get(LAST_ORDER_KEY);
  if (!lastId) return { claimed: false };
  try {
    const order: OrderResponse = await getOrderStatus(lastId);
    if (order.status === 'verified' && order.autoActivatedAt) {
      const claimRes = await claimAutoActivatedOrder(lastId);
      return { claimed: true, entitlement: { active: true, ...claimRes }, order };
    }
    if (order.status === 'rejected' || order.status === 'expired') {
      store.del(LAST_ORDER_KEY);
    }
    return { claimed: false, order };
  } catch {
    return { claimed: false };
  }
}

/** Server-verified status via GET /api/status (includes registered devices & remaining days). */
export async function getVipStatus(): Promise<EntitlementData> {
  const cached = getCachedEntitlement();
  if (!cached || !cached.token) return { active: false };
  try {
    const r = await api(`/api/status?deviceId=${encodeURIComponent(getDeviceId())}`, {
      headers: {
        Authorization: `Bearer ${cached.token}`,
        'x-device-id': getDeviceId(),
      },
    });
    const payload = r?.data || r;
    const merged = { ...cached, ...payload, plan: payload?.planCode || payload?.plan || cached.plan };
    save(merged);
    return { ...merged, active: true };
  } catch (e: any) {
    if (e.code === 'network' || !e.status || e.status >= 500) {
      return { ...cached, active: true, offline: true };
    }
    store.del(KEY);
    return { active: false, reason: e.code };
  }
}

/** Remove a registered device from the active entitlement via POST /api/devices/remove. */
export async function removeDevice(deviceHash: string): Promise<boolean> {
  const cached = getCachedEntitlement();
  if (!cached || !cached.token) throw new Error('No active session token');
  await api('/api/devices/remove', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${cached.token}`,
    },
    body: JSON.stringify({ deviceHash }),
  });
  return true;
}

/** Ask the server whether this device's pass is still valid (revoked / expired / moved). */
export async function refreshEntitlement(): Promise<EntitlementData> {
  const cached = getCachedEntitlement();
  if (!cached || !cached.token) return { active: false };
  try {
    const r = await api('/api/status?deviceId=' + encodeURIComponent(getDeviceId()), {
      headers: {
        Authorization: `Bearer ${cached.token}`,
        'x-device-id': getDeviceId(),
      },
    });
    const payload = r?.data || r;
    const merged = { ...cached, ...payload, plan: payload?.planCode || payload?.plan || cached.plan };
    save(merged);
    return { ...merged, active: true };
  } catch (e: any) {
    if (e.code === 'network' || !e.status || e.status >= 500) {
      return { ...cached, active: true, offline: true };
    }
    store.del(KEY); // 401/403/410: revoked, expired or tied to another device
    return { active: false, reason: e.code };
  }
}

export async function submitSupportContact(payload: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<{ ticketId: number; message: string }> {
  const res = await api('/api/support/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res?.data || res;
}
