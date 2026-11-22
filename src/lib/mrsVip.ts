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
  let id = store.get('mrs_device_id');
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    const bytes = new Uint8Array(16);
    (globalThis.crypto || (window as any).crypto).getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    store.set('mrs_device_id', id);
  }
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

export interface SubmitOrderParams {
  plan: '1m' | '2m' | '6m' | '12m';
  region: 'BD' | 'INTL';
  channel: 'bkash' | 'nagad' | 'binance' | 'skrill' | 'payoneer';
  phone: string;
  email: string;
  name?: string;
  trxId?: string;
  screenshot?: File | Blob | null;
}

export interface OrderResponse {
  orderId: string;
  ref?: string;
  status: 'pending' | 'verified' | 'needs_review' | 'rejected' | 'expired';
  step?: number;
  reason: string | null;
  message: string;
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
}: SubmitOrderParams): Promise<OrderResponse> {
  const fd = new FormData();
  fd.append('plan', plan);
  fd.append('region', region);
  fd.append('channel', channel);
  fd.append('method', channel);
  fd.append('phone', phone);
  fd.append('sender_account', phone);
  fd.append('email', email);
  if (name && String(name).trim()) fd.append('name', String(name).trim());
  if (trxId && String(trxId).trim()) fd.append('trxId', String(trxId).trim());
  if (screenshot) fd.append('screenshot', screenshot, (screenshot as File).name || 'payment.png');
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

const save = (e: any) =>
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

export function clearVipSession() {
  store.del(KEY);
  store.del('shahintv_adfree_activation');
  try {
    document.cookie = 'mrs_vip_active=0; max-age=0; path=/; SameSite=Lax';
    if (typeof window !== 'undefined') (window as any).__MRS_IS_VIP = false;
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
    save({ ...cached, ...r });
    return { ...cached, ...r, active: true };
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
    save({ ...cached, ...r });
    return { ...cached, ...r, active: true };
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
