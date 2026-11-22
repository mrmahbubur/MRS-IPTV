import { getDeviceId, getBrowserFingerprint } from './codes';
import { ReferralStats, AdFreeState } from '../types';

const REFERRAL_CODE_KEY = 'mrs_user_referral_code';
const REFERRED_BY_KEY = 'mrs_referred_by_code';
const SERVER_SITE_ADDRESS_KEY = 'mrs_server_site_address';

/**
 * Returns the public canonical site address for generating referral URLs.
 */
export function getAppBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Check if server cached a canonical address
    try {
      const cached = localStorage.getItem(SERVER_SITE_ADDRESS_KEY);
      if (cached && cached.startsWith('http') && !cached.includes('localhost') && !cached.includes('127.0.0.1')) {
        return cached.replace(/\/+$/, '');
      }
    } catch (e) {}

    // Check window.location.origin
    try {
      if (window.location && window.location.origin && !window.location.origin.includes('about:') && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')) {
        return window.location.origin.replace(/\/+$/, '');
      }
    } catch (e) {}

    // Check window.location.host
    try {
      if (window.location && window.location.host && !window.location.host.includes('localhost')) {
        const proto = window.location.protocol || 'https:';
        return `${proto}//${window.location.host}`.replace(/\/+$/, '');
      }
    } catch (e) {}
  }

  // Deployed production cloud container URL for M R S IPTV
  return 'https://ais-pre-5jyezfwcybgi7odkwqvxt6-640543945523.asia-east1.run.app';
}

/**
 * Generates or retrieves the unique referral code for this user/device.
 * Persistently stored in localStorage and deterministic based on deviceId.
 * ALWAYS formatted with the official "MRS-IPTV-" brand prefix.
 */
export function getUserReferralCode(): string {
  try {
    const existing = localStorage.getItem(REFERRAL_CODE_KEY);
    if (existing && existing.startsWith('MRS-IPTV-') && existing.length >= 13) {
      return existing;
    }

    const deviceId = getDeviceId();
    // Derive a clean 6-character alphanumeric uppercase code
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
      hash = (hash * 31 + deviceId.charCodeAt(i)) >>> 0;
    }
    const codeSuffix = hash.toString(36).toUpperCase().padStart(6, '0').slice(-6);
    const generatedCode = `MRS-IPTV-${codeSuffix}`;
    
    localStorage.setItem(REFERRAL_CODE_KEY, generatedCode);
    return generatedCode;
  } catch (e) {
    return 'MRS-IPTV-VIP786';
  }
}

/**
 * Contacts the backend server to register and verify this user's unique AI tracking code.
 */
export async function initReferralTrackingCode(): Promise<{ referralCode: string; shareUrl: string; siteAddress: string; aiTrackingId: string }> {
  const deviceId = getDeviceId();
  const existingCode = getUserReferralCode();

  try {
    const res = await fetch(`/api/referrals/my-code?deviceId=${encodeURIComponent(deviceId)}&existingCode=${encodeURIComponent(existingCode)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.referralCode) {
        localStorage.setItem(REFERRAL_CODE_KEY, data.referralCode);
      }
      if (data.siteAddress) {
        localStorage.setItem(SERVER_SITE_ADDRESS_KEY, data.siteAddress);
      }
      return {
        referralCode: data.referralCode || existingCode,
        shareUrl: data.shareUrl || getReferralShareUrl(data.referralCode || existingCode),
        siteAddress: data.siteAddress || getAppBaseUrl(),
        aiTrackingId: data.aiTrackingId || `MRS_AI_TRK_${existingCode.replace(/[^A-Z0-9]/g, '')}`
      };
    }
  } catch (e) {
    console.warn('[Referral] Backend my-code init warning:', e);
  }

  const siteAddress = getAppBaseUrl();
  const shareUrl = `${siteAddress}/?ref=${encodeURIComponent(existingCode)}`;
  return {
    referralCode: existingCode,
    shareUrl,
    siteAddress,
    aiTrackingId: `MRS_AI_TRK_${existingCode.replace(/[^A-Z0-9]/g, '')}`
  };
}

/**
 * Builds the full shareable referral link with the site address.
 */
export function getReferralShareUrl(code?: string): string {
  const refCode = code || getUserReferralCode();
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/?ref=${encodeURIComponent(refCode)}`;
}

/**
 * Gets the code of the referrer who invited this user, if any.
 */
export function getReferredByCode(): string | null {
  try {
    const local = localStorage.getItem(REFERRED_BY_KEY);
    if (local) return local;
    const session = sessionStorage.getItem(REFERRED_BY_KEY);
    if (session) return session;

    // Check cookie fallback
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(new RegExp('(^|;\\s*)mrs_referred_by=([^;]*)'));
      if (match && match[2]) return decodeURIComponent(match[2]);
    }
  } catch (e) {}
  return null;
}

/**
 * Detects ?ref= or ?referral= in URL parameters, records it, and registers click with backend AI.
 */
export async function handleIncomingReferral(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref') || urlParams.get('referral') || urlParams.get('r');

    if (refParam && refParam.trim().length >= 4) {
      let cleanRef = refParam.trim().toUpperCase();
      if (!cleanRef.startsWith('MRS-IPTV-') && cleanRef.startsWith('REF-')) {
        cleanRef = cleanRef.replace(/^REF-/, 'MRS-IPTV-');
      }

      const currentMyCode = getUserReferralCode();

      // Avoid self-referral
      if (cleanRef !== currentMyCode) {
        localStorage.setItem(REFERRED_BY_KEY, cleanRef);
        sessionStorage.setItem(REFERRED_BY_KEY, cleanRef);

        // Store cookie (30 days persistence)
        try {
          document.cookie = `mrs_referred_by=${encodeURIComponent(cleanRef)}; max-age=2592000; path=/; SameSite=Lax`;
        } catch (e) {}

        const deviceId = getDeviceId();
        const fingerprint = getBrowserFingerprint();

        // Register referral visit with backend AI
        try {
          fetch('/api/referrals/register-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              referrerCode: cleanRef,
              deviceId,
              fingerprint,
              userAgent: navigator.userAgent || '',
            }),
          }).catch(() => {});
        } catch (e) {}

        return cleanRef;
      }
    }
  } catch (e) {
    console.warn('[Referral] Error handling incoming referral param:', e);
  }
  return null;
}

/**
 * Sends a heartbeat to track site stay/watch engagement time for referral milestones.
 */
export function sendReferralHeartbeat(timeDeltaSec: number = 60): void {
  try {
    const deviceId = getDeviceId();
    const referredBy = getReferredByCode();

    fetch('/api/referrals/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        referredBy: referredBy || undefined,
        timeDeltaSec,
      }),
    }).catch(() => {});
  } catch (e) {}
}

/**
 * Checks if the backend AI has granted an automatic 1-Week or 1-Month VIP reward to this device.
 * Automatically synchronizes with local AdFreeState without requiring any promo code.
 */
export async function syncReferralVipReward(onUpdate?: (state: AdFreeState) => void): Promise<AdFreeState | null> {
  try {
    const deviceId = getDeviceId();
    const myCode = getUserReferralCode();

    const res = await fetch(`/api/referrals/check-device-vip?deviceId=${encodeURIComponent(deviceId)}&code=${encodeURIComponent(myCode)}`);
    if (!res.ok) return null;

    const data = await res.json();

    if (data.hasActiveReward && data.reward) {
      const now = new Date();
      const expiry = new Date(data.reward.expiryDate);

      if (now < expiry) {
        const rawLocal = localStorage.getItem('shahintv_adfree_activation');
        let currentLocal: AdFreeState | null = null;
        if (rawLocal) {
          try {
            currentLocal = JSON.parse(rawLocal);
          } catch (e) {}
        }

        // Only override if current local pass is inactive or expires sooner than the referral reward
        const currentExp = currentLocal?.expiryDate ? new Date(currentLocal.expiryDate).getTime() : 0;
        const newExp = expiry.getTime();

        if (!currentLocal?.isActive || newExp > currentExp) {
          const newState: AdFreeState = {
            isActive: true,
            isAdFree: true,
            code: `CAMELLIA-REWARD-${data.reward.rewardType}`,
            deviceId,
            activatedAt: data.reward.grantedAt || new Date().toISOString(),
            expiryDate: data.reward.expiryDate,
            durationMonths: data.reward.rewardType === '1_MONTH_VIP' ? 1 : 1,
          };

          localStorage.setItem('shahintv_adfree_activation', JSON.stringify(newState));
          if (onUpdate) onUpdate(newState);
          return newState;
        }
      }
    }
  } catch (e) {
    console.warn('[Referral] Failed to check backend VIP rewards:', e);
  }
  return null;
}

/**
 * Fetches real-time referral statistics and AI confirmation status for the user.
 */
export async function fetchReferralStats(code?: string): Promise<ReferralStats | null> {
  try {
    const refCode = code || getUserReferralCode();
    const deviceId = getDeviceId();

    const res = await fetch(`/api/referrals/stats?code=${encodeURIComponent(refCode)}&deviceId=${encodeURIComponent(deviceId)}`);
    if (!res.ok) return null;

    return await res.json();
  } catch (e) {
    console.warn('[Referral] Failed to fetch stats:', e);
    return null;
  }
}

/**
 * Manually applies a friend's referral code, credits the referrer on the backend,
 * and unlocks an instant 2-Hour Ad-Free VIP Welcome Bonus for the user on this device.
 */
export async function applyReferralCodeManually(
  inputCode: string
): Promise<{ success: boolean; message: string; referrerCode?: string; newState?: AdFreeState }> {
  const raw = (inputCode || '').trim().toUpperCase();
  if (!raw || raw.length < 4) {
    return { success: false, message: 'Please enter a valid friend referral code (e.g., MRS-IPTV-VIP786).' };
  }

  let formattedCode = raw;
  if (!formattedCode.startsWith('MRS-IPTV-')) {
    formattedCode = formattedCode.replace(/^REF-/, '');
    formattedCode = `MRS-IPTV-${formattedCode.replace(/[^A-Z0-9]/g, '')}`;
  }

  const myCode = getUserReferralCode();
  if (formattedCode === myCode) {
    return { success: false, message: 'You cannot apply your own personal referral code.' };
  }

  const existingReferred = getReferredByCode();
  if (existingReferred) {
    return {
      success: false,
      referrerCode: existingReferred,
      message: `Referral code ${existingReferred} is already active on this device.`
    };
  }

  const deviceId = getDeviceId();

  try {
    const res = await fetch('/api/referrals/apply-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referrerCode: formattedCode,
        deviceId,
        myCode,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (data?.alreadyApplied && data?.referrerCode) {
        localStorage.setItem(REFERRED_BY_KEY, data.referrerCode);
      }
      return {
        success: false,
        message: data?.message || 'Unable to apply referral code.'
      };
    }

    const appliedCode = data.referrerCode || formattedCode;
    localStorage.setItem(REFERRED_BY_KEY, appliedCode);
    sessionStorage.setItem(REFERRED_BY_KEY, appliedCode);
    try {
      document.cookie = `mrs_referred_by=${encodeURIComponent(appliedCode)}; max-age=2592000; path=/; SameSite=Lax`;
    } catch {}

    // Grant 2-Hour Welcome Ad-Free VIP Bonus locally
    const now = Date.now();
    const expiryIso = data.welcomeExpiry || new Date(now + 2 * 60 * 60 * 1000).toISOString();
    const welcomeState: AdFreeState = {
      isActive: true,
      isAdFree: true,
      code: `REF-WELCOME-${appliedCode}`,
      deviceId,
      activatedAt: new Date(now).toISOString(),
      expiryDate: expiryIso,
      durationMonths: 2 / (24 * 30)
    };

    localStorage.setItem('shahintv_adfree_activation', JSON.stringify(welcomeState));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shahintv_adfree_updated', { detail: welcomeState }));
    }

    return {
      success: true,
      referrerCode: appliedCode,
      newState: welcomeState,
      message: data.message || `Success! Code ${appliedCode} applied & 2 Hours Free VIP unlocked!`
    };
  } catch {
    return {
      success: false,
      message: 'Network error while verifying referral code. Please try again.'
    };
  }
}

function triggerExternalLink(url: string) {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 200);
}

/**
 * Helper to share referral link to social media platforms.
 */
export function shareToSocial(platform: 'whatsapp' | 'telegram' | 'facebook' | 'twitter' | 'messenger' | 'native', customUrl?: string): boolean {
  const shareUrl = customUrl || getReferralShareUrl();
  const shareText = `Watch 8,890+ Live IPTV Channels, Live Sports (Cricket, Football, F1) & 4K Entertainment on M R S IPTV! Use my referral code ${getUserReferralCode()} for 2 Hours Free VIP or join via link:`;

  switch (platform) {
    case 'whatsapp':
      triggerExternalLink(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`);
      return true;
    case 'telegram':
      triggerExternalLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`);
      return true;
    case 'facebook':
      triggerExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`);
      return true;
    case 'twitter':
      triggerExternalLink(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`);
      return true;
    case 'messenger':
      triggerExternalLink(`https://www.facebook.com/dialog/send?link=${encodeURIComponent(shareUrl)}&app_id=291494419107518&redirect_uri=${encodeURIComponent(shareUrl)}`);
      return true;
    case 'native':
      if (navigator.share) {
        navigator.share({
          title: 'M R S IPTV - Live TV & Sports Streaming',
          text: shareText,
          url: shareUrl,
        }).catch(() => {});
        return true;
      }
      return false;
    default:
      return false;
  }
}
