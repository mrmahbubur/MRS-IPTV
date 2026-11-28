import { useState, useEffect } from 'react';
import { AdFreeState } from '../types';
import { getDeviceId, getStoredAdFreeState } from './codes';
import { detectClientVipState } from './mrsVip';
import {
  MONETAG_CANONICAL_ZONES,
  MONETAG_DEFAULT_CAPS,
  MONETAG_DEFAULT_POPUNDER_ZONE_ID,
  MONETAG_DEFAULT_VIGNETTE_ZONE_ID,
  MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID,
  DynamicMonetagZone,
  buildMonetagZoneUrl,
  isSafeMonetagZoneUrl,
  sanitizeMonetagZoneIdStrict,
} from './monetagConfig';
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

// Official Stored Partner Smartlink Zones (Sourced from centralized monetagConfig)
export const STORED_AD_ZONES: AdZoneConfig[] = MONETAG_CANONICAL_ZONES.map((z) => ({
  id: z.id,
  url: z.url,
  network: z.network,
  zoneId: z.zoneId,
  estimatedCpmUsd: z.estimatedCpmUsd,
  label: z.label,
  subtitle: z.subtitle,
  ctaText: z.ctaText,
  badge: z.badge,
  accentColor: z.accentColor,
  ...(z.imageUrl ? { imageUrl: z.imageUrl } : {}),
  showAllTime: z.showAllTime,
  isMidnightOnly: z.isMidnightOnly,
  category: z.category,
}));

export const MONETAG_DIRECT_LINKS: string[] = STORED_AD_ZONES.map(z => z.url);

export const BACKUP_AD_LINKS: string[] = STORED_AD_ZONES.slice(0, 2).map(z => z.url);

export const AD_LINKS: string[] = STORED_AD_ZONES.map(z => z.url);

export const MONETAG_TAG_ZONES = {
  directZone: {
    zoneId: MONETAG_DEFAULT_POPUNDER_ZONE_ID,
    domain: 'uplcm.com',
    url: buildMonetagZoneUrl(MONETAG_DEFAULT_POPUNDER_ZONE_ID),
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
const INTERSTITIAL_HIST_KEY = 'mrs_interstitial_daily_hist';
const LAST_AD_CLICK_KEY = 'mrs_last_ad_click_at';

// Minimum cooldown fallback between full-screen interstitial / popup modals (3 minutes)
const INTERSTITIAL_COOLDOWN_MS = MONETAG_DEFAULT_CAPS.interstitialCooldownMs;

// In-memory cache synced with localStorage
let memoryCycleIndex: number | null = null;
let memoryOpenedUrls: string[] | null = null;
let inFlightDynamicConfigFetch: Promise<any> | null = null;

function withSequenceMeta(zone: AdZoneConfig, _idx: number): AdZoneConfig {
  return { ...zone };
}

/**
 * Fetches latest Monetag zones, verification/interstitial/vignette IDs, and caps
 * dynamically from /api/ads/config and broadcasts mrs_ads_config_loaded.
 */
export async function fetchDynamicAdConfig(force: boolean = false): Promise<any> {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  if (!force && win.__MRS_ADS_SERVER_CONFIG) {
    return win.__MRS_ADS_SERVER_CONFIG;
  }
  if (inFlightDynamicConfigFetch) {
    return inFlightDynamicConfigFetch;
  }
  const baseUrl = String(win.MRS_ADS_CONFIG?.apiBaseUrl || '').replace(/\/+$/, '');
  inFlightDynamicConfigFetch = fetch(`${baseUrl}/api/ads/config`, {
    method: 'GET',
    credentials: 'same-origin',
  })
    .then(async (res) => {
      if (!res.ok) return win.__MRS_ADS_SERVER_CONFIG || null;
      const json = await res.json();
      const data = json?.data || json;
      if (!data || typeof data !== 'object') return win.__MRS_ADS_SERVER_CONFIG || null;

      const prev = win.__MRS_ADS_SERVER_CONFIG || {};
      const nextServerCfg = {
        ...prev,
        ...data,
        formats: { ...(prev.formats || {}), ...(data.formats || {}) },
        monetag: {
          ...(prev.monetag || {}),
          ...(data.monetag || {}),
          caps: { ...(prev.monetag?.caps || {}), ...(data.monetag?.caps || {}) },
        },
        rewards: { ...(prev.rewards || {}), ...(data.rewards || {}) },
      };
      win.__MRS_ADS_SERVER_CONFIG = nextServerCfg;

      if (win.MRS_ADS_CONFIG?.monetag && nextServerCfg.monetag) {
        const m = nextServerCfg.monetag;
        if (Array.isArray(m.zones) && m.zones.length > 0) {
          const validZones = m.zones.filter(
            (z: DynamicMonetagZone) => z && sanitizeMonetagZoneIdStrict(z.zoneId) && isSafeMonetagZoneUrl(z.url)
          );
          if (validZones.length > 0) {
            win.MRS_ADS_CONFIG.monetag.directZones = validZones;
          }
        }
        if (m.verificationId) {
          win.MRS_ADS_CONFIG.monetag.verificationId = m.verificationId;
          if (win.MRS_ADS_CONFIG.publisherMeta) {
            win.MRS_ADS_CONFIG.publisherMeta.monetag = m.verificationId;
          }
          if (typeof document !== 'undefined') {
            const meta = document.querySelector('meta[name="monetag"]');
            if (meta && meta.getAttribute('content') !== m.verificationId) {
              meta.setAttribute('content', m.verificationId);
            }
          }
        }
        if (m.interstitial?.zoneId && isSafeMonetagZoneUrl(m.interstitial?.url) && win.MRS_ADS_CONFIG.monetag.interstitial) {
          win.MRS_ADS_CONFIG.monetag.interstitial.zoneId = m.interstitial.zoneId;
          win.MRS_ADS_CONFIG.monetag.interstitial.url = m.interstitial.url;
        }
        if (m.vignette?.zoneId && isSafeMonetagZoneUrl(m.vignette?.url) && win.MRS_ADS_CONFIG.monetag.vignette) {
          win.MRS_ADS_CONFIG.monetag.vignette.zoneId = m.vignette.zoneId;
          win.MRS_ADS_CONFIG.monetag.vignette.url = m.vignette.url;
        }
        if (m.popunder?.zoneId && isSafeMonetagZoneUrl(m.popunder?.url) && win.MRS_ADS_CONFIG.monetag.popunder) {
          win.MRS_ADS_CONFIG.monetag.popunder.zoneId = m.popunder.zoneId;
          win.MRS_ADS_CONFIG.monetag.popunder.directZoneUrl = m.popunder.url;
        }
        if (m.caps) {
          win.MRS_ADS_CONFIG.caps = { ...(win.MRS_ADS_CONFIG.caps || {}), ...m.caps };
        }
      }

      try {
        window.dispatchEvent(new CustomEvent('mrs_ads_config_loaded', { detail: nextServerCfg }));
      } catch {}
      return nextServerCfg;
    })
    .catch(() => win.__MRS_ADS_SERVER_CONFIG || null)
    .finally(() => {
      inFlightDynamicConfigFetch = null;
    });

  return inFlightDynamicConfigFetch;
}

/**
 * Resolves dynamically fetched Monetag zones validated for HTTPS Monetag origin,
 * merged with canonical metadata and falling back safely to STORED_AD_ZONES.
 */
export function getDynamicAdZones(): AdZoneConfig[] {
  if (typeof window === 'undefined') return STORED_AD_ZONES;
  const win = window as any;
  const rawList: DynamicMonetagZone[] =
    (Array.isArray(win.__MRS_ADS_SERVER_CONFIG?.monetag?.zones) && win.__MRS_ADS_SERVER_CONFIG.monetag.zones.length > 0
      ? win.__MRS_ADS_SERVER_CONFIG.monetag.zones
      : Array.isArray(win.MRS_ADS_CONFIG?.monetag?.directZones) && win.MRS_ADS_CONFIG.monetag.directZones.length > 0
        ? win.MRS_ADS_CONFIG.monetag.directZones
        : []);

  if (!rawList.length) return STORED_AD_ZONES;

  const byZoneId = new Map<string, AdZoneConfig>(STORED_AD_ZONES.map((z) => [z.zoneId, z]));
  const resolved: AdZoneConfig[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const cleanZoneId = sanitizeMonetagZoneIdStrict(item.zoneId);
    if (!cleanZoneId || !isSafeMonetagZoneUrl(item.url)) continue;
    const canonical = byZoneId.get(cleanZoneId);
    if (canonical) {
      resolved.push({
        ...canonical,
        url: item.url.trim(),
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : canonical.label,
      });
    } else {
      resolved.push({
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `uplcm-${cleanZoneId}`,
        url: item.url.trim(),
        network: 'Monetag Direct',
        zoneId: cleanZoneId,
        estimatedCpmUsd: 4.5,
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Monetag Direct Partner Line',
        subtitle: 'Official Monetag streaming line · Unlock 1 hour ad-free HD TV',
        ctaText: 'Unlock 1-Hour Free VIP',
        badge: item.format === 'interstitial' ? 'SPOTLIGHT' : 'PARTNER',
        accentColor: 'amber',
        isMidnightOnly: false,
        showAllTime: true,
        category: 'vip',
      });
    }
  }
  return resolved.length > 0 ? resolved : STORED_AD_ZONES;
}

/**
 * Resolves the active Monetag interstitial zone from runtime/server configuration,
 * prioritizing configured interstitialZoneId / vignetteZoneId with strict URL validation.
 */
export function getInterstitialAdZone(): AdZoneConfig {
  const zones = getDynamicAdZones();
  if (typeof window === 'undefined') {
    return zones.find((z) => z.zoneId === MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID) || zones[0];
  }
  const win = window as any;
  const serverMonetag = win.__MRS_ADS_SERVER_CONFIG?.monetag || {};
  const staticMonetag = win.MRS_ADS_CONFIG?.monetag || {};

  const configuredZoneId =
    sanitizeMonetagZoneIdStrict(serverMonetag.interstitialZoneId) ||
    sanitizeMonetagZoneIdStrict(serverMonetag.interstitial?.zoneId) ||
    sanitizeMonetagZoneIdStrict(staticMonetag.interstitial?.zoneId) ||
    sanitizeMonetagZoneIdStrict(serverMonetag.vignetteZoneId) ||
    sanitizeMonetagZoneIdStrict(staticMonetag.vignette?.zoneId) ||
    MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID;

  const matched = zones.find((z) => z.zoneId === configuredZoneId);
  if (matched) return withSequenceMeta(matched, 0);

  const candidateUrl =
    (isSafeMonetagZoneUrl(serverMonetag.interstitial?.url) ? serverMonetag.interstitial.url : '') ||
    (isSafeMonetagZoneUrl(staticMonetag.interstitial?.url) ? staticMonetag.interstitial.url : '') ||
    buildMonetagZoneUrl(configuredZoneId);

  return {
    id: `uplcm-${configuredZoneId}`,
    url: isSafeMonetagZoneUrl(candidateUrl) ? candidateUrl : buildMonetagZoneUrl(MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID),
    network: 'Monetag Direct',
    zoneId: configuredZoneId,
    estimatedCpmUsd: 5.5,
    label: '24/7 Exclusive HD Cinema & Live Broadcasts',
    subtitle: 'Official Monetag spotlight · Tap to enjoy 1 hour ad-free streaming',
    ctaText: 'Visit Monetag Ad',
    badge: 'INTERSTITIAL',
    accentColor: 'rose',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'cinema',
  };
}

/**
 * Returns the current sequential index (0 to N-1).
 * Defaults strictly to 0 (the very 1st stored ad link).
 */
export function getCurrentAdIndex(): number {
  const zones = getDynamicAdZones();
  if (memoryCycleIndex !== null && memoryCycleIndex >= 0 && memoryCycleIndex < zones.length) {
    return memoryCycleIndex;
  }
  try {
    const raw = localStorage.getItem(AD_CYCLE_INDEX_KEY);
    const parsed = raw !== null ? parseInt(raw, 10) : 0;
    const safeIdx = Number.isInteger(parsed) && parsed >= 0 ? parsed % zones.length : 0;
    memoryCycleIndex = safeIdx;
    return safeIdx;
  } catch {
    memoryCycleIndex = 0;
    return 0;
  }
}

/**
 * Sets the sequential index strictly to a given position.
 */
export function setAdCycleIndex(idx: number): number {
  const zones = getDynamicAdZones();
  const safeIdx = ((idx % zones.length) + zones.length) % zones.length;
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
 * Returns the array of URLs opened during the current cycle.
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
  const zones = getDynamicAdZones();
  const history = getOpenedAdHistory();
  if (!history.includes(url)) {
    history.push(url);
  }
  if (history.length >= zones.length) {
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
  const zones = getDynamicAdZones();
  const idx = getCurrentAdIndex();
  return withSequenceMeta(zones[idx] || zones[0], idx);
}

/**
 * Returns any AdZoneConfig by its index.
 */
export function getAdZoneByIndex(idx: number): AdZoneConfig {
  const zones = getDynamicAdZones();
  const safeIdx = ((idx % zones.length) + zones.length) % zones.length;
  return withSequenceMeta(zones[safeIdx], safeIdx);
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
  return getDynamicAdZones().map((z, idx) => withSequenceMeta(z, idx));
}

export function isClientMidnightHour(): boolean {
  // Updated rule: Ads from stored links show 24/7 ALL THE TIME (no midnight-only cutoff)
  return true;
}

export function isClientDaytimeHour(): boolean {
  return true;
}

export const MONETAG_MIDNIGHT_VIGNETTE = {
  zoneId: MONETAG_DEFAULT_VIGNETTE_ZONE_ID,
  url: buildMonetagZoneUrl(MONETAG_DEFAULT_VIGNETTE_ZONE_ID),
  links: STORED_AD_ZONES
};

/**
 * Returns an AdZone from dynamic Monetag links (24/7 All-Time rule).
 */
export function getRandomAdZone(_allowMidnight: boolean = true): AdZoneConfig {
  const zones = getDynamicAdZones();
  const randIdx = Math.floor(Math.random() * zones.length);
  return withSequenceMeta(zones[randIdx], randIdx);
}

export function peekAdZone(offset: number = 0): AdZoneConfig {
  const zones = getDynamicAdZones();
  const currentIdx = getCurrentAdIndex();
  const targetIdx = (currentIdx + offset) % zones.length;
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
  const zones = getDynamicAdZones();
  const currentIdx = getCurrentAdIndex();
  const confirmedZone = withSequenceMeta(zones[currentIdx] || zones[0], currentIdx);

  // Advance pointer strictly to next link (1 -> 2 -> ... -> N -> 1)
  const nextIdx = (currentIdx + 1) % zones.length;
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

  const nextZone = withSequenceMeta(zones[nextIdx] || zones[0], nextIdx);
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
 * Checks if enough time has passed since the last full-screen ad modal and verifies
 * the daily interstitial cap from runtime Monetag caps config.
 */
export function canTriggerInterstitialAd(cooldownMs?: number): boolean {
  try {
    const currentVip = getStoredAdFreeState();
    if (currentVip.isActive || currentVip.isAdFree) return false;

    const clientVip = detectClientVipState();
    if (clientVip.isLocked || clientVip.isVip) return false;

    const serverCfg = typeof window !== 'undefined' ? (window as any).__MRS_ADS_SERVER_CONFIG : null;
    if (serverCfg?.formats && serverCfg.formats.interstitial === false) {
      return false;
    }
    const staticCfg = typeof window !== 'undefined' ? (window as any).MRS_ADS_CONFIG : null;
    const caps = serverCfg?.monetag?.caps || staticCfg?.caps || {};

    const maxPerDay =
      typeof caps.interstitialMaxPerDay === 'number'
        ? Math.max(0, caps.interstitialMaxPerDay)
        : MONETAG_DEFAULT_CAPS.interstitialMaxPerDay;
    if (maxPerDay === 0) return false;

    const today = new Date().toISOString().slice(0, 10);
    const histRaw = localStorage.getItem(INTERSTITIAL_HIST_KEY);
    if (histRaw) {
      const parsed = JSON.parse(histRaw);
      if (parsed && parsed.day === today && Number(parsed.count || 0) >= maxPerDay) {
        return false;
      }
    }

    const effectiveCooldownMs =
      typeof cooldownMs === 'number' && Number.isFinite(cooldownMs)
        ? Math.max(0, cooldownMs)
        : typeof caps.interstitialCooldownMs === 'number' && Number.isFinite(caps.interstitialCooldownMs)
          ? Math.max(15_000, caps.interstitialCooldownMs)
          : INTERSTITIAL_COOLDOWN_MS;

    const raw = localStorage.getItem(LAST_INTERSTITIAL_KEY);
    const lastShown = raw ? parseInt(raw, 10) || 0 : 0;
    return Date.now() - lastShown >= effectiveCooldownMs;
  } catch {
    return true;
  }
}

/**
 * Marks that an interstitial/modal ad was just displayed, starting the cooldown window
 * and incrementing today's interstitial cap counter.
 */
export function markInterstitialAdShown(): void {
  try {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    localStorage.setItem(LAST_INTERSTITIAL_KEY, String(now));
    let count = 0;
    try {
      const raw = localStorage.getItem(INTERSTITIAL_HIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.day === today) count = Number(parsed.count || 0);
      }
    } catch {}
    localStorage.setItem(INTERSTITIAL_HIST_KEY, JSON.stringify({ day: today, count: count + 1, lastAt: now }));
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
    const clientVip = detectClientVipState();
    if (clientVip.isLocked || clientVip.isVip) {
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
    const clientVip = detectClientVipState();
    if (clientVip.isLocked || clientVip.isVip) {
      return '';
    }
  }
  const { openedZone } = confirmAndOpenNextAdZone(placement);
  const targetUrl = customUrl && isSafeMonetagZoneUrl(customUrl) ? customUrl.trim() : openedZone.url;

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

