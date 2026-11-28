import { useState, useEffect } from 'react';
import { AdFreeState } from '../types';
import { getDeviceId, getStoredAdFreeState } from './codes';
export { getDeviceId, getStoredAdFreeState } from './codes';

export interface AdZoneConfig {
  id: string;
  url: string;
  network: 'Monetag Direct';
  zoneId: string;
  estimatedCpmUsd: number;
  label: string;
  subtitle: string;
  ctaText: string;
  badge: string;
  accentColor?: 'amber' | 'cyan' | 'emerald' | 'purple' | 'rose';
  imageUrl?: string;
  isMidnightOnly?: boolean;
  showAllTime?: boolean;
  category?: 'social' | 'adult' | 'sports' | 'vip' | 'cinema';
}

// Official Stored Partner Smartlink Zones (Active 24/7 All-Time)
export const STORED_AD_ZONES: AdZoneConfig[] = [
  {
    id: 'uplcm-11226634',
    url: 'https://uplcm.com/4/11226634',
    network: 'Monetag Direct',
    zoneId: '11226634',
    estimatedCpmUsd: 4.20,
    label: 'Ultra-HD Sports & Match Priority Line',
    subtitle: 'High-speed sports streaming partner · Unlock 1 hour of ad-free HD TV now',
    ctaText: 'Unlock 1h Ad-Free VIP Pass',
    badge: '24/7 FEATURED',
    accentColor: 'amber',
    imageUrl: '/midnight_cinema_banner.jpg',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'sports'
  },
  {
    id: 'uplcm-11683565',
    url: 'https://uplcm.com/4/11683565',
    network: 'Monetag Direct',
    zoneId: '11683565',
    estimatedCpmUsd: 4.35,
    label: 'Live Sports Score & Goal Alert Feed',
    subtitle: 'Real-time match notifications, cricket updates & high-bitrate streaming line',
    ctaText: 'Activate Live Sports Pass',
    badge: 'LIVE SPORTS',
    accentColor: 'cyan',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'sports'
  },
  {
    id: 'uplcm-11242745',
    url: 'https://uplcm.com/4/11242745',
    network: 'Monetag Direct',
    zoneId: '11242745',
    estimatedCpmUsd: 4.10,
    label: 'Sports Highlight & Match Replay Hub',
    subtitle: 'Trending goals, viral sports clips & global Monetag partner line',
    ctaText: 'Visit Hub · 1h Free VIP',
    badge: 'TRENDING',
    accentColor: 'emerald',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'social'
  },
  {
    id: 'uplcm-11242069',
    url: 'https://uplcm.com/4/11242069',
    network: 'Monetag Direct',
    zoneId: '11242069',
    estimatedCpmUsd: 4.25,
    label: 'VIP Sports Fans Community Lounge',
    subtitle: 'Live fan chats, trending highlights & match stream discussions · 1h Free VIP',
    ctaText: 'Open Feed & Watch Ad-Free',
    badge: 'FAN CLUB',
    accentColor: 'purple',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'social'
  },
  {
    id: 'uplcm-11242067',
    url: 'https://uplcm.com/4/11242067',
    network: 'Monetag Direct',
    zoneId: '11242067',
    estimatedCpmUsd: 5.50,
    label: '24/7 Exclusive HD Cinema & Live Broadcasts',
    subtitle: 'Always-on spotlight partner · Tap to unlock 60 minutes of zero-ad streaming',
    ctaText: 'Enter Spotlight · 1h VIP',
    badge: '24/7 SPOTLIGHT',
    accentColor: 'rose',
    imageUrl: '/midnight_cinema_banner.jpg',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'cinema'
  },
  {
    id: 'uplcm-11242742',
    url: 'https://uplcm.com/4/11242742',
    network: 'Monetag Direct',
    zoneId: '11242742',
    estimatedCpmUsd: 4.15,
    label: 'Global Sports Discussion & Fixture Hub',
    subtitle: 'Verified Monetag broadcast line unlocking 60 minutes of uninterrupted TV',
    ctaText: 'Claim 1-Hour Free VIP',
    badge: 'VERIFIED',
    accentColor: 'amber',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'social'
  },
  {
    id: 'uplcm-11230440',
    url: 'https://uplcm.com/4/11230440',
    network: 'Monetag Direct',
    zoneId: '11230440',
    estimatedCpmUsd: 4.30,
    label: 'High-Speed Global IPTV Mirror Support',
    subtitle: 'Instant sports updates and Monetag direct line keeping 8,890+ channels free',
    ctaText: 'Support Server & Unlock VIP',
    badge: 'FAST LINE',
    accentColor: 'cyan',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'vip'
  },
  {
    id: 'uplcm-11683560',
    url: 'https://uplcm.com/4/11683560',
    network: 'Monetag Direct',
    zoneId: '11683560',
    estimatedCpmUsd: 4.45,
    label: 'Prime Broadcast CDN & Zero-Lag Relay',
    subtitle: 'Top-tier partner network supporting zero-buffer TV & cinema streams',
    ctaText: 'Activate High-Speed Line',
    badge: 'PRIME CDN',
    accentColor: 'emerald',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'sports'
  },
  {
    id: 'uplcm-9912130',
    url: 'https://uplcm.com/4/9912130',
    network: 'Monetag Direct',
    zoneId: '9912130',
    estimatedCpmUsd: 4.50,
    label: 'All-Day Cinema, Reels & Sports Lounge',
    subtitle: 'Claim 1 full hour of zero ads across all live TV & sports feeds right now',
    ctaText: 'Unlock 1-Hour VIP Now',
    badge: 'TOP ZONE',
    accentColor: 'purple',
    imageUrl: '/midnight_cinema_banner.jpg',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'cinema'
  },
  {
    id: 'uplcm-11242744',
    url: 'https://uplcm.com/4/11242744',
    network: 'Monetag Direct',
    zoneId: '11242744',
    estimatedCpmUsd: 4.60,
    label: 'International Match Stream Partner Network',
    subtitle: 'Official 24/7 global Monetag line unlocking 60-min VIP streaming',
    ctaText: 'Visit Partner & Watch Ad-Free',
    badge: 'GLOBAL VIP',
    accentColor: 'rose',
    showAllTime: true,
    isMidnightOnly: false,
    category: 'vip'
  }
];

export const MONETAG_DIRECT_LINKS: string[] = STORED_AD_ZONES.map(z => z.url);

export const BACKUP_AD_LINKS: string[] = [
  'https://uplcm.com/4/11226634',
  'https://uplcm.com/4/11683565'
];

export const AD_LINKS: string[] = STORED_AD_ZONES.map(z => z.url);

export const MONETAG_TAG_ZONES = {
  directZone: {
    zoneId: '11226634',
    domain: 'uplcm.com',
    url: 'https://uplcm.com/4/11226634',
    network: 'Monetag Direct',
    estimatedCpmUsd: 3.80,
    label: 'Monetag Direct Ad'
  }
};

export interface LocalAdStats {
  totalImpressions: number;
  totalClicks: number;
  estimatedRevenueUsd: number;
  byZone: Record<string, { impressions: number; clicks: number; revenueUsd: number; lastTriggered: string }>;
}

// Dedicated Storage Keys for Guaranteed Sequential Rotation
const AD_STATS_STORAGE_KEY = 'mrs_iptv_ad_revenue_stats_v2';
const AD_CYCLE_INDEX_KEY = 'mrs_ad_current_cycle_index_v6';
const AD_OPENED_HISTORY_KEY = 'mrs_ad_opened_history_v6';
const LAST_CLICKED_AD_URL_KEY = 'mrs_iptv_last_clicked_ad_url_v6';
const LAST_INTERSTITIAL_KEY = 'mrs_last_interstitial_shown_at';
const LAST_AD_CLICK_KEY = 'mrs_last_ad_click_at';

// Minimum cooldown between full-screen interstitial / popup modals (3 minutes)
const INTERSTITIAL_COOLDOWN_MS = 3 * 60 * 1000;

// In-memory cache synced with localStorage
let memoryCycleIndex: number | null = null;
let memoryOpenedUrls: string[] | null = null;

function withSequenceMeta(zone: AdZoneConfig, _idx: number): AdZoneConfig {
  return { ...zone };
}

/**
 * Returns the current sequential index (0 to 10).
 * Defaults strictly to 0 (the very 1st stored ad link).
 */
export function getCurrentAdIndex(): number {
  if (memoryCycleIndex !== null && memoryCycleIndex >= 0 && memoryCycleIndex < STORED_AD_ZONES.length) {
    return memoryCycleIndex;
  }
  try {
    const raw = localStorage.getItem(AD_CYCLE_INDEX_KEY);
    const parsed = raw !== null ? parseInt(raw, 10) : 0;
    const safeIdx = Number.isInteger(parsed) && parsed >= 0 ? parsed % STORED_AD_ZONES.length : 0;
    memoryCycleIndex = safeIdx;
    return safeIdx;
  } catch {
    memoryCycleIndex = 0;
    return 0;
  }
}

/**
 * Sets the sequential index strictly to a given position (0 to 10).
 */
export function setAdCycleIndex(idx: number): number {
  const safeIdx = ((idx % STORED_AD_ZONES.length) + STORED_AD_ZONES.length) % STORED_AD_ZONES.length;
  memoryCycleIndex = safeIdx;
  try {
    localStorage.setItem(AD_CYCLE_INDEX_KEY, String(safeIdx));
  } catch {}
  notifyRotation();
  return safeIdx;
}

/**
 * Resets the cycle completely back to Index 0 (Link #1).
 */
export function resetAdCycle(): AdZoneConfig {
  memoryCycleIndex = 0;
  memoryOpenedUrls = [];
  try {
    localStorage.setItem(AD_CYCLE_INDEX_KEY, '0');
    localStorage.removeItem(AD_OPENED_HISTORY_KEY);
  } catch {}
  notifyRotation();
  return getCurrentAdZone();
}

/**
 * Returns the array of URLs opened during the current 11-ad cycle.
 */
export function getOpenedAdHistory(): string[] {
  if (memoryOpenedUrls !== null) return memoryOpenedUrls;
  try {
    const raw = localStorage.getItem(AD_OPENED_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryOpenedUrls = parsed.filter((u): u is string => typeof u === 'string');
        return memoryOpenedUrls;
      }
    }
  } catch {}
  memoryOpenedUrls = [];
  return memoryOpenedUrls;
}

function recordOpenedUrl(url: string) {
  const history = getOpenedAdHistory();
  if (!history.includes(url)) {
    history.push(url);
  }
  // If cycle reached full length of stored links, reset history for the next cycle
  if (history.length >= STORED_AD_ZONES.length) {
    memoryOpenedUrls = [];
    try {
      localStorage.removeItem(AD_OPENED_HISTORY_KEY);
    } catch {}
  } else {
    memoryOpenedUrls = history;
    try {
      localStorage.setItem(AD_OPENED_HISTORY_KEY, JSON.stringify(history));
    } catch {}
  }
}

/**
 * Returns the exact current AdZoneConfig to be opened next (starts at #1).
 */
export function getCurrentAdZone(): AdZoneConfig {
  const idx = getCurrentAdIndex();
  return withSequenceMeta(STORED_AD_ZONES[idx], idx);
}

/**
 * Returns any AdZoneConfig by its index.
 */
export function getAdZoneByIndex(idx: number): AdZoneConfig {
  const safeIdx = ((idx % STORED_AD_ZONES.length) + STORED_AD_ZONES.length) % STORED_AD_ZONES.length;
  return withSequenceMeta(STORED_AD_ZONES[safeIdx], safeIdx);
}

/**
 * Peeks at the next ad to open.
 */
export function peekNextAdToOpen(_excludeUrl?: string): AdZoneConfig {
  return getCurrentAdZone();
}

export function getNextAdZone(excludeUrl?: string): AdZoneConfig {
  return peekNextAdToOpen(excludeUrl);
}

export function getAllAdZones(): AdZoneConfig[] {
  return STORED_AD_ZONES.map((z, idx) => withSequenceMeta(z, idx));
}

export function isClientMidnightHour(): boolean {
  // Updated rule: Ads from stored links show 24/7 ALL THE TIME (no midnight-only cutoff)
  return true;
}

export function isClientDaytimeHour(): boolean {
  return true;
}

export const MONETAG_MIDNIGHT_VIGNETTE = {
  zoneId: '11242067',
  url: 'https://uplcm.com/4/11242067',
  links: STORED_AD_ZONES
};

/**
 * Returns an AdZone from all 10 stored ad links (24/7 All-Time rule).
 */
export function getRandomAdZone(_allowMidnight: boolean = true): AdZoneConfig {
  const randIdx = Math.floor(Math.random() * STORED_AD_ZONES.length);
  return withSequenceMeta(STORED_AD_ZONES[randIdx], randIdx);
}

export function peekAdZone(offset: number = 0): AdZoneConfig {
  const currentIdx = getCurrentAdIndex();
  const targetIdx = (currentIdx + offset) % STORED_AD_ZONES.length;
  return getAdZoneByIndex(targetIdx);
}

/**
 * Dispatches an event across the app so all buttons, modals, and player overlays update simultaneously.
 */
function notifyRotation() {
  const currentZone = getCurrentAdZone();
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('mrs_ad_zone_rotated', {
          detail: {
            currentZone,
            nextZone: currentZone
          }
        })
      );
    }
  } catch {}
}

/**
 * Generates the direct backend ad redirect URL with optional specific zoneId, device ID, placement, and reward parameters.
 * When opened, the backend serves the requested stored link (or rotates 1 -> 10) and redirects seamlessly.
 */
export function getBackendAdRedirectUrl(placement: string = 'direct-button', zoneId?: string): string {
  const devId = typeof window !== 'undefined' ? getDeviceId() : '';
  let country = '';
  try {
    country = localStorage.getItem('shahintv_user_country_code') || '';
  } catch {}
  return `/api/ads/redirect?device=${encodeURIComponent(devId)}&placement=${encodeURIComponent(placement)}${zoneId ? `&zoneId=${encodeURIComponent(zoneId)}` : ''}${country ? `&country=${encodeURIComponent(country)}` : ''}`;
}

/**
 * CRITICAL EXECUTION: Opens the next ad link via the backend ad engine,
 * then strictly advances the sequence (1 through 10).
 */
export function confirmAndOpenCurrentAd(
  placement: string = 'general',
  anchorElement?: HTMLAnchorElement | null
): { openedZone: AdZoneConfig; nextZone: AdZoneConfig } {
  const currentIdx = getCurrentAdIndex();
  const confirmedZone = withSequenceMeta(STORED_AD_ZONES[currentIdx], currentIdx);
  
  // Advance pointer strictly to next link (1 -> 2 -> ... -> 10 -> 1)
  const nextIdx = (currentIdx + 1) % STORED_AD_ZONES.length;
  memoryCycleIndex = nextIdx;
  try {
    localStorage.setItem(AD_CYCLE_INDEX_KEY, String(nextIdx));
    localStorage.setItem(LAST_CLICKED_AD_URL_KEY, confirmedZone.url);
    localStorage.setItem(LAST_AD_CLICK_KEY, String(Date.now()));
  } catch {}

  recordOpenedUrl(confirmedZone.url);
  recordAdEvent('click', confirmedZone, placement);

  const redirectUrl = getBackendAdRedirectUrl(placement);

  // If an <a> tag was passed directly, update its href synchronously
  if (anchorElement && typeof anchorElement.href === 'string') {
    anchorElement.href = redirectUrl;
  }

  // Reliably launch the backend redirect URL in a new window / tab
  if (typeof window !== 'undefined') {
    try {
      const opened = window.open(redirectUrl, '_blank', 'noopener,noreferrer');
      if (!opened && typeof document !== 'undefined') {
        const fallbackAnchor = document.createElement('a');
        fallbackAnchor.href = redirectUrl;
        fallbackAnchor.target = '_blank';
        fallbackAnchor.rel = 'noopener noreferrer';
        fallbackAnchor.style.display = 'none';
        document.body.appendChild(fallbackAnchor);
        fallbackAnchor.click();
        setTimeout(() => fallbackAnchor.remove(), 250);
      }
    } catch (e) {
      console.warn('[AdSystem] Open error:', e);
    }
  }

  const nextZone = withSequenceMeta(STORED_AD_ZONES[nextIdx], nextIdx);
  notifyRotation();

  return { openedZone: confirmedZone, nextZone };
}

// Backward compatible alias
export const confirmAndOpenNextAdZone = confirmAndOpenCurrentAd;

/**
 * Ad Confirmation / Action Request Interface.
 */
export interface AdConfirmationRequest {
  placement: string;
  customTitle?: string;
  sourceLabel?: string;
  rewardHours?: number;
  onConfirmed?: (openedZone: AdZoneConfig) => void;
  onCancel?: () => void;
}

/**
 * Triggers the ad action directly via backend redirect and awards VIP.
 * Fully autonomous backend operation — in the site, user just needs to click the button.
 */
export function triggerAdConfirmation(request: AdConfirmationRequest): void {
  const { openedZone } = confirmAndOpenCurrentAd(request.placement);
  if (request.onConfirmed) {
    request.onConfirmed(openedZone);
  }
}

export function getRandomAdLink(): string {
  return peekNextAdToOpen().url;
}

export const getRandomSponsorLink = getRandomAdLink;

/**
 * Checks if enough time has passed since the last full-screen ad modal
 * so users are never bombarded by back-to-back or overlapping popups.
 */
export function canTriggerInterstitialAd(cooldownMs: number = INTERSTITIAL_COOLDOWN_MS): boolean {
  try {
    const currentVip = getStoredAdFreeState();
    if (currentVip.isActive || currentVip.isAdFree) return false;

    const raw = localStorage.getItem(LAST_INTERSTITIAL_KEY);
    const lastShown = raw ? parseInt(raw, 10) || 0 : 0;
    return Date.now() - lastShown >= cooldownMs;
  } catch {
    return true;
  }
}

/**
 * Marks that an interstitial/modal ad was just displayed, starting the cooldown window.
 */
export function markInterstitialAdShown(): void {
  try {
    localStorage.setItem(LAST_INTERSTITIAL_KEY, String(Date.now()));
  } catch {}
}

/**
 * Returns true if the user has clicked/engaged with any sponsor ad within the last 1 hour.
 */
export function hasUserViewedAdInLastHour(): boolean {
  try {
    const raw = localStorage.getItem(LAST_AD_CLICK_KEY);
    const lastClick = raw ? parseInt(raw, 10) || 0 : 0;
    if (!lastClick) return false;
    return Date.now() - lastClick < 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Returns remaining VIP minutes if the user has an active temporary or permanent VIP pass.
 */
export function getRemainingVipMinutes(state?: AdFreeState): number {
  const target = state || getStoredAdFreeState();
  if (!target?.isActive || !target?.expiryDate) return 0;
  const diffMs = new Date(target.expiryDate).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 60000);
}

/**
 * Returns exact remaining VIP seconds in real time.
 */
export function getRemainingVipSeconds(state?: AdFreeState): number {
  const target = state || getStoredAdFreeState();
  if (!target?.isActive || !target?.expiryDate) return 0;
  const diffMs = new Date(target.expiryDate).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.max(0, Math.floor(diffMs / 1000));
}

/**
 * Formats remaining seconds into a crisp real-time countdown string (MM:SS or HH:MM:SS).
 */
export function formatRealtimeVipCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Real-time 1-second precision hook for 1-Hour Free VIP Activation & VIP Passes.
 * Ticks every 1000ms using real wall-clock timestamps and auto-expires immediately at 00:00.
 */
export function useRealtimeVipCountdown(adFreeState?: AdFreeState) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() =>
    getRemainingVipSeconds(adFreeState)
  );

  useEffect(() => {
    const updateClock = () => {
      const target = adFreeState || getStoredAdFreeState();
      if (!target?.isActive || !target?.expiryDate) {
        setRemainingSeconds(0);
        return;
      }
      const diffMs = new Date(target.expiryDate).getTime() - Date.now();
      if (diffMs <= 0) {
        setRemainingSeconds(0);
        try {
          localStorage.removeItem('shahintv_adfree_activation');
          document.cookie = 'mrs_vip_active=0; max-age=0; path=/; SameSite=Lax';
          if (typeof window !== 'undefined') (window as any).__MRS_IS_VIP = false;
          const expiredState: AdFreeState = {
            isActive: false,
            isAdFree: false,
            code: '',
            deviceId: getDeviceId(),
            activatedAt: '',
            expiryDate: '',
            durationMonths: 1,
          };
          window.dispatchEvent(new CustomEvent('shahintv_adfree_updated', { detail: expiredState }));
        } catch {}
      } else {
        setRemainingSeconds(Math.floor(diffMs / 1000));
      }
    };

    updateClock();
    const timerId = setInterval(updateClock, 1000);
    window.addEventListener('shahintv_adfree_updated', updateClock);
    return () => {
      clearInterval(timerId);
      window.removeEventListener('shahintv_adfree_updated', updateClock);
    };
  }, [adFreeState?.isActive, adFreeState?.expiryDate, adFreeState?.code]);

  let cachedPlan: string | undefined;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('mrs_vip_entitlement') : null;
    if (raw) cachedPlan = JSON.parse(raw)?.plan;
  } catch {}

  const isRewardedHourPass =
    Boolean(adFreeState?.isActive) &&
    (adFreeState?.code === 'REWARD_1H_VIP' ||
      cachedPlan === 'reward1h' ||
      remainingSeconds <= 4 * 3600);

  const progressPercent = isRewardedHourPass
    ? Math.min(100, Math.max(0, (remainingSeconds / 3600) * 100))
    : 100;

  const formattedCountdown = formatRealtimeVipCountdown(remainingSeconds);
  const isActive = remainingSeconds > 0 && Boolean(adFreeState?.isActive || adFreeState?.isAdFree);

  return {
    remainingSeconds,
    remainingMinutes: Math.ceil(remainingSeconds / 60),
    formattedCountdown,
    formattedClock: formattedCountdown,
    isRewardedHourPass,
    isTemporary: isRewardedHourPass,
    shortBadgeText: isActive
      ? (isRewardedHourPass ? `VIP ${formattedCountdown}` : 'VIP Active')
      : 'Get VIP Pass',
    progressPercent,
    isActive,
  };
}

/**
 * Records an Ad Impression or Click ONLY in Free Mode (never when state === 'vip' or 'pending').
 */
export function recordAdEvent(
  eventType: 'impression' | 'click',
  zone: AdZoneConfig,
  placement: string = 'general'
): LocalAdStats {
  const stats = getLocalAdStats();
  if (typeof window !== 'undefined') {
    const gate = (window as any).MRS_ADS;
    const state = gate && typeof gate.state === 'function' ? gate.state() : (window as any).MRS_AD_STATE;
    if (state && state !== 'free') {
      return stats;
    }
  }
  const nowIso = new Date().toISOString();

  if (!stats.byZone[zone.id]) {
    stats.byZone[zone.id] = {
      impressions: 0,
      clicks: 0,
      revenueUsd: 0,
      lastTriggered: nowIso
    };
  }

  const impressionValue = (zone.estimatedCpmUsd / 1000) * 0.25;
  const clickValue = (zone.estimatedCpmUsd / 1000) * 4.5;

  if (eventType === 'impression') {
    stats.totalImpressions += 1;
    stats.byZone[zone.id].impressions += 1;
    stats.estimatedRevenueUsd = Number((stats.estimatedRevenueUsd + impressionValue).toFixed(5));
    stats.byZone[zone.id].revenueUsd = Number((stats.byZone[zone.id].revenueUsd + impressionValue).toFixed(5));
  } else {
    stats.totalClicks += 1;
    stats.byZone[zone.id].clicks += 1;
    stats.estimatedRevenueUsd = Number((stats.estimatedRevenueUsd + clickValue).toFixed(5));
    stats.byZone[zone.id].revenueUsd = Number((stats.byZone[zone.id].revenueUsd + clickValue).toFixed(5));
    try {
      localStorage.setItem(LAST_AD_CLICK_KEY, String(Date.now()));
    } catch {}
  }

  stats.byZone[zone.id].lastTriggered = nowIso;

  try {
    localStorage.setItem(AD_STATS_STORAGE_KEY, JSON.stringify(stats));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mrs_ad_stats_updated', { detail: stats }));
      (window as any).MRS_ADS_TRACK_EVENT?.({
        eventType: eventType === 'click' ? 'click' : 'view',
        format: 'banner',
        placement,
        offerId: zone.zoneId,
        network: zone.network,
      });
    }
  } catch {}

  return stats;
}

export function getLocalAdStats(): LocalAdStats {
  try {
    const raw = localStorage.getItem(AD_STATS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.totalImpressions === 'number') {
        return parsed;
      }
    }
  } catch {}
  return {
    totalImpressions: 0,
    totalClicks: 0,
    estimatedRevenueUsd: 0,
    byZone: {}
  };
}

/**
 * Triggers a confirmed sequential anchor navigation to the next un-opened Smartlink URL in a new tab.
 */
export function openSponsorLink(customUrl?: string, placement: string = 'manual-sponsor'): string {
  if (typeof window !== 'undefined') {
    const gate = (window as any).MRS_ADS;
    if (gate && typeof gate.state === 'function' && gate.state() !== 'free') {
      return '';
    }
  }
  const { openedZone } = confirmAndOpenNextAdZone(placement);
  const targetUrl = customUrl || openedZone.url;

  if (typeof document !== 'undefined') {
    try {
      const anchor = document.createElement('a');
      anchor.href = targetUrl;
      anchor.target = '_blank';
      anchor.rel = 'nofollow noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
      }, 200);
    } catch (e) {
      console.warn('[AdSystem] Anchor navigation fallback:', e);
    }
  }
  return targetUrl;
}

/**
 * Deprecated: VIP rewards are strictly server-controlled via window.MRS_REWARD_ADS.startAndWatch().
 * Clicking banners or sponsor links never grants VIP access.
 */
export function grantRewardedAdFreeTime(_hours: number = 1): AdFreeState {
  return getStoredAdFreeState();
}

export function openRewardedSponsorLink(_hours: number = 1): { url: string; state: AdFreeState } {
  const url = openSponsorLink(undefined, 'sponsor-link');
  return { url, state: getStoredAdFreeState() };
}

