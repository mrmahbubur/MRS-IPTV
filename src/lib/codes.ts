import { AdFreeState } from '../types';
import {
  activatePass,
  getCachedEntitlement,
  normalizeCodeForServer,
  redeemCode,
} from './mrsVip';

export function getBrowserFingerprint(): string {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : ({} as any);
    const scr = typeof screen !== 'undefined' ? screen : ({} as any);

    const components = [
      nav.userAgent || '',
      nav.language || nav.userLanguage || '',
      nav.platform || '',
      nav.hardwareConcurrency || '',
      nav.deviceMemory || '',
      scr.width || '',
      scr.height || '',
      scr.colorDepth || '',
      Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone || '',
    ];

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 30;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#f60';
        ctx.fillRect(10, 2, 60, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('MrsTV-VIP', 4, 12);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('MrsTV-VIP', 6, 14);
        components.push(canvas.toDataURL());
      }
    } catch {}

    const rawString = components.join('||');
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
      const char = rawString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(36);
  } catch {
    return 'fp_default';
  }
}

function generateCryptoToken(byteCount = 16): string {
  const c: Crypto | undefined =
    (typeof globalThis !== 'undefined' && globalThis.crypto) ||
    (typeof window !== 'undefined' && (window.crypto || (window as any).msCrypto)) ||
    undefined;

  try {
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(byteCount);
      c.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID().replace(/-/g, '');
    }
  } catch {}

  let pool = Date.now().toString(16);
  while (pool.length < byteCount * 2) {
    pool += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  }
  return pool.slice(0, byteCount * 2);
}

export function getDeviceId(): string {
  try {
    let sessionId = sessionStorage.getItem('shahintv_session_id');
    if (!sessionId || !/^[A-Za-z0-9_-]{12,128}$/.test(sessionId)) {
      sessionId = `sess_${generateCryptoToken(12)}`;
      sessionStorage.setItem('shahintv_session_id', sessionId);
    }

    let persistentId = localStorage.getItem('shahintv_device_id');
    if (!persistentId || !/^[A-Za-z0-9_-]{12,128}$/.test(persistentId)) {
      persistentId = `dev_${generateCryptoToken(16)}`;
      localStorage.setItem('shahintv_device_id', persistentId);
    }

    const fpHash = getBrowserFingerprint();
    const compositeDeviceId = `STV_${fpHash}_${persistentId}`;
    sessionStorage.setItem('shahintv_device_id', compositeDeviceId);

    return compositeDeviceId;
  } catch {
    return 'STV_fp_fallback_device';
  }
}

export function parseDurationFromCode(codeRaw: string): 1 | 2 | 6 | 12 | null {
  const norm = normalizeCodeForServer(codeRaw);
  const mrsMatch = norm.match(/^MRS-(1M|2M|6M|12M)-/);
  if (mrsMatch) {
    const planNum = Number(mrsMatch[1].replace('M', ''));
    if (planNum === 1 || planNum === 2 || planNum === 6 || planNum === 12) return planNum;
  }
  const digitsOnly = norm.replace(/[^0-9]/g, '');
  if (!digitsOnly) return null;
  if (digitsOnly.endsWith('12')) return 12;
  if (digitsOnly.endsWith('6')) return 6;
  if (digitsOnly.endsWith('2')) return 2;
  if (digitsOnly.endsWith('1')) return 1;
  return null;
}

export function isValidCodeFormat(codeRaw: string): boolean {
  const norm = normalizeCodeForServer(codeRaw);
  if (/^MRS-(1M|2M|6M|12M)-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(norm)) return true;
  if (/^\d{10,12}$/.test(norm)) return true;
  return false;
}

export function calculateExpiryDate(startDate: Date, durationMonths: number): Date {
  const expiry = new Date(startDate.getTime());
  expiry.setMonth(expiry.getMonth() + durationMonths);
  return expiry;
}

export function getStoredAdFreeState(): AdFreeState {
  const deviceId = getDeviceId();
  const emptyState: AdFreeState = {
    isActive: false,
    code: '',
    deviceId,
    activatedAt: '',
    expiryDate: '',
    durationMonths: 1,
  };

  try {
    const entitlement = getCachedEntitlement();
    if (entitlement && entitlement.active && entitlement.expiresAt && Date.parse(entitlement.expiresAt) > Date.now()) {
      try {
        document.cookie = `mrs_vip_active=1; max-age=2592000; path=/; SameSite=Lax`;
        if (typeof window !== 'undefined') (window as any).__MRS_IS_VIP = true;
      } catch {}
      const isReward1h =
        entitlement.plan === 'reward1h' ||
        entitlement.plan === 'sponsor_reward' ||
        (entitlement as any).kind === 'reward' ||
        (entitlement as any).kind === 'sponsor_reward';
      const durMonths = isReward1h
        ? 0
        : entitlement.plan === '12m'
          ? 12
          : entitlement.plan === '6m'
            ? 6
            : entitlement.plan === '2m'
              ? 2
              : 1;
      return {
        isActive: true,
        isAdFree: true,
        code: isReward1h ? 'REWARD_1H_VIP' : 'VIP_PASS',
        deviceId,
        activatedAt: entitlement.activatedAt || new Date().toISOString(),
        expiryDate: entitlement.expiresAt,
        durationMonths: durMonths,
      };
    }

    // Legacy referral / server-backed state (never honor click-reward SPONSOR_REWARD_VIP)
    const raw = localStorage.getItem('shahintv_adfree_activation');
    if (!raw) return emptyState;

    const data: AdFreeState & { revoked?: boolean; status?: string } = JSON.parse(raw);
    if (!data || !data.code || !data.expiryDate || data.isActive === false || data.revoked === true) {
      return emptyState;
    }
    const statusLower = String(data.status || '').trim().toLowerCase();
    if (statusLower === 'revoked' || statusLower === 'expired') {
      localStorage.removeItem('shahintv_adfree_activation');
      return emptyState;
    }
    if (data.code === 'SPONSOR_REWARD_VIP') {
      localStorage.removeItem('shahintv_adfree_activation');
      return emptyState;
    }

    if (data.deviceId && data.deviceId !== deviceId) {
      localStorage.removeItem('shahintv_adfree_activation');
      return emptyState;
    }

    const now = new Date();
    const expiry = new Date(data.expiryDate);

    if (!Number.isNaN(expiry.getTime()) && now < expiry) {
      // Honor explicit referral / Camellia reward passes or server-backed sponsor/VIP passes paired with cached entitlement
      const upperCode = String(data.code || '').trim().toUpperCase();
      const isReferralReward =
        upperCode.startsWith('REFERRAL_') ||
        upperCode.startsWith('REF-WELCOME-') ||
        upperCode.startsWith('CAMELLIA-REWARD-');
      if (!isReferralReward && !entitlement) {
        return emptyState;
      }
      if (!isReferralReward && entitlement?.token) {
        try {
          document.cookie = `mrs_vip_active=1; max-age=2592000; path=/; SameSite=Lax`;
          if (typeof window !== 'undefined') (window as any).__MRS_IS_VIP = true;
        } catch {}
      }
      return {
        ...data,
        deviceId,
        isActive: true,
        isAdFree: true,
      };
    }

    localStorage.removeItem('shahintv_adfree_activation');
    try {
      document.cookie = 'mrs_vip_active=0; max-age=0; path=/; SameSite=Lax';
      if (typeof window !== 'undefined') (window as any).__MRS_IS_VIP = false;
    } catch {}
    return emptyState;
  } catch {
    try {
      document.cookie = 'mrs_vip_active=0; max-age=0; path=/; SameSite=Lax';
      if (typeof window !== 'undefined') (window as any).__MRS_IS_VIP = false;
    } catch {}
    return emptyState;
  }
}

/**
 * Strict server-verified VIP activation via POST /api/activate (and fallback to POST /api/redeem).
 * Never falls back to hardcoded offline codes.
 */
export async function activateAdFreeCode(
  codeRaw: string,
  email?: string
): Promise<{ success: boolean; message: string; state?: AdFreeState }> {
  const cleanCode = normalizeCodeForServer(codeRaw);
  if (!cleanCode || !isValidCodeFormat(cleanCode)) {
    return {
      success: false,
      message: 'Please enter a valid VIP activation code (e.g. MRS-1M-XXXX-XXXX-XXXX).',
    };
  }

  const deviceId = getDeviceId();

  try {
    let redeemRes: any;
    try {
      redeemRes = await activatePass({ code: cleanCode, email });
    } catch (err: any) {
      if (err?.status === 404 && !err?.code) {
        redeemRes = await redeemCode(cleanCode);
      } else {
        throw err;
      }
    }

    if (redeemRes && redeemRes.expiresAt) {
      const duration =
        redeemRes.plan === '12m' ? 12 : redeemRes.plan === '6m' ? 6 : redeemRes.plan === '2m' ? 2 : 1;
      const newState: AdFreeState = {
        isActive: true,
        isAdFree: true,
        code: cleanCode,
        deviceId,
        activatedAt: redeemRes.activatedAt || new Date().toISOString(),
        expiryDate: redeemRes.expiresAt,
        durationMonths: duration,
      };
      localStorage.setItem('shahintv_adfree_activation', JSON.stringify(newState));
      try {
        const expMs = new Date(redeemRes.expiresAt).getTime();
        const maxAgeSec = Math.max(3600, Math.round((expMs - Date.now()) / 1000));
        document.cookie = `mrs_vip_active=1; max-age=${maxAgeSec}; path=/; SameSite=Lax`;
        if (typeof window !== 'undefined') (window as any).__MRS_IS_VIP = true;
      } catch {}
      return {
        success: true,
        message: `VIP mode activated (${redeemRes.planLabel || `${duration} Month`}). Expires on ${new Date(redeemRes.expiresAt).toLocaleDateString()}.`,
        state: newState,
      };
    }

    return { success: false, message: 'Server did not return a valid VIP entitlement.' };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Invalid, revoked, expired, or already redeemed activation code.',
    };
  }
}
