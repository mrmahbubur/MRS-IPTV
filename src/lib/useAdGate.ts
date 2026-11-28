import { useState, useEffect, useCallback } from 'react';
import { getCachedEntitlement } from './mrsVip';
import {
  MONETAG_DEFAULT_VERIFICATION_ID,
  MONETAG_DEFAULT_VIGNETTE_ZONE_ID,
  MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID,
  MONETAG_DEFAULT_POPUNDER_ZONE_ID,
  MONETAG_DEFAULT_CAPS,
  MONETAG_CAP_BOUNDS,
  DynamicMonetagZone,
  MonetagRuntimeCaps,
  buildMonetagZoneUrl,
  isSafeMonetagZoneUrl,
  sanitizeMonetagVerificationIdStrict,
  sanitizeMonetagZoneIdStrict,
  isValidShowFnIdentifier,
} from './monetagConfig';
import { fetchDynamicAdConfig } from './adSystem';

export type AdGateState = 'pending' | 'vip' | 'free';

export interface NetworkGateConfig {
  verificationId?: string;
  vignetteZoneId?: string;
  interstitialZoneId?: string;
  interstitial?: { zoneId: string; url: string };
  popunderZoneId?: string;
  zones?: DynamicMonetagZone[];
  showRegularAds: boolean;
  rewardedEnabled: boolean;
  rewardedShowFn?: string | null;
  rewardedZoneId?: string | null;
  caps?: MonetagRuntimeCaps;
}

export interface RewardsGateConfig {
  durationMinutes: number;
  minWatchMs: number;
  cooldownMinutes: number;
  maxPerDevicePerDay: number;
  unlocksVipChannels: boolean;
  anyRewardedAvailable: boolean;
}

export interface AdFormatConfig {
  formats: {
    banner: boolean;
    sticky: boolean;
    popunder: boolean;
    interstitial: boolean;
    push: boolean;
  };
  testMode: boolean;
  monetag: NetworkGateConfig;
  rewards: RewardsGateConfig;
}

const DEFAULT_AD_CONFIG: AdFormatConfig = {
  formats: {
    banner: true,
    sticky: true,
    popunder: false,
    interstitial: false,
    push: false,
  },
  testMode: true,
  monetag: {
    verificationId: MONETAG_DEFAULT_VERIFICATION_ID,
    vignetteZoneId: MONETAG_DEFAULT_VIGNETTE_ZONE_ID,
    interstitialZoneId: MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID,
    interstitial: {
      zoneId: MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID,
      url: buildMonetagZoneUrl(MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID),
    },
    popunderZoneId: MONETAG_DEFAULT_POPUNDER_ZONE_ID,
    showRegularAds: false,
    rewardedEnabled: false,
    caps: MONETAG_DEFAULT_CAPS,
  },
  rewards: {
    durationMinutes: 60,
    minWatchMs: 15000,
    cooldownMinutes: 180,
    maxPerDevicePerDay: 3,
    unlocksVipChannels: true,
    anyRewardedAvailable: false,
  },
};

const EXPIRED_NOTICE_KEY = 'mrs_ads_expired_notice';
const REWARD_EXPIRED_PENDING_KEY = 'mrs_reward_expired_notice_pending';

function clampRuntimeInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function getAdGateState(): AdGateState {
  if (typeof window === 'undefined') return 'pending';
  const gate = (window as any).MRS_ADS;
  if (gate && typeof gate.state === 'function') {
    const s = gate.state();
    if (s === 'vip' || s === 'free' || s === 'pending') return s;
  }
  const s = (window as any).MRS_AD_STATE;
  if (s === 'vip' || s === 'free' || s === 'pending') return s;
  return getCachedEntitlement()?.token ? 'vip' : 'free';
}

export function getAdRuntimeConfig(): AdFormatConfig {
  if (typeof window === 'undefined') return DEFAULT_AD_CONFIG;
  const serverCfg = (window as any).__MRS_ADS_SERVER_CONFIG || {};
  const staticCfg = (window as any).MRS_ADS_CONFIG || {};

  const testMode =
    typeof serverCfg.testMode === 'boolean'
      ? serverCfg.testMode
      : typeof staticCfg.testMode === 'boolean'
        ? staticCfg.testMode
        : DEFAULT_AD_CONFIG.testMode;

  const monetagShowRegular = Boolean(
    typeof serverCfg.monetag?.showRegularAds === 'boolean'
      ? serverCfg.monetag.showRegularAds
      : staticCfg.monetag?.showRegularAds
  );
  const monetagRewarded = Boolean(
    serverCfg.monetag?.rewardedEnabled ||
      (staticCfg.monetag?.rewarded?.enabled &&
        (typeof staticCfg.monetag?.rewarded?.showFn === 'function' || staticCfg.monetag?.rewarded?.snippet))
  );

  const verificationId =
    sanitizeMonetagVerificationIdStrict(serverCfg.monetag?.verificationId) ||
    sanitizeMonetagVerificationIdStrict(staticCfg.monetag?.verificationId) ||
    MONETAG_DEFAULT_VERIFICATION_ID;

  const vignetteZoneId =
    sanitizeMonetagZoneIdStrict(serverCfg.monetag?.vignetteZoneId) ||
    sanitizeMonetagZoneIdStrict(staticCfg.monetag?.vignette?.zoneId) ||
    MONETAG_DEFAULT_VIGNETTE_ZONE_ID;

  const interstitialZoneId =
    sanitizeMonetagZoneIdStrict(serverCfg.monetag?.interstitialZoneId) ||
    sanitizeMonetagZoneIdStrict(serverCfg.monetag?.interstitial?.zoneId) ||
    sanitizeMonetagZoneIdStrict(staticCfg.monetag?.interstitial?.zoneId) ||
    sanitizeMonetagZoneIdStrict(serverCfg.monetag?.vignetteZoneId) ||
    MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID;

  const popunderZoneId =
    sanitizeMonetagZoneIdStrict(serverCfg.monetag?.popunderZoneId) ||
    sanitizeMonetagZoneIdStrict(staticCfg.monetag?.popunder?.zoneId) ||
    MONETAG_DEFAULT_POPUNDER_ZONE_ID;

  const rawShowFn = serverCfg.monetag?.rewardedShowFn;
  const safeShowFn = typeof rawShowFn === 'string' && isValidShowFnIdentifier(rawShowFn) ? rawShowFn.trim() : null;
  const rewardedZoneId = sanitizeMonetagZoneIdStrict(serverCfg.monetag?.rewardedZoneId);

  const rawCaps = {
    ...MONETAG_DEFAULT_CAPS,
    ...(staticCfg.caps || {}),
    ...(serverCfg.monetag?.caps || {}),
  };

  const caps: MonetagRuntimeCaps = {
    popunderCooldownMs: clampRuntimeInt(
      rawCaps.popunderCooldownMs,
      MONETAG_CAP_BOUNDS.popunderCooldownMinutes.min * 60_000,
      MONETAG_CAP_BOUNDS.popunderCooldownMinutes.max * 60_000,
      MONETAG_DEFAULT_CAPS.popunderCooldownMs
    ),
    popunderMaxPerDay: clampRuntimeInt(
      rawCaps.popunderMaxPerDay,
      MONETAG_CAP_BOUNDS.popunderMaxPerDay.min,
      MONETAG_CAP_BOUNDS.popunderMaxPerDay.max,
      MONETAG_DEFAULT_CAPS.popunderMaxPerDay
    ),
    interstitialCooldownMs: clampRuntimeInt(
      rawCaps.interstitialCooldownMs,
      MONETAG_CAP_BOUNDS.interstitialCooldownSeconds.min * 1000,
      MONETAG_CAP_BOUNDS.interstitialCooldownSeconds.max * 1000,
      MONETAG_DEFAULT_CAPS.interstitialCooldownMs
    ),
    interstitialMaxPerDay: clampRuntimeInt(
      rawCaps.interstitialMaxPerDay,
      MONETAG_CAP_BOUNDS.interstitialMaxPerDay.min,
      MONETAG_CAP_BOUNDS.interstitialMaxPerDay.max,
      MONETAG_DEFAULT_CAPS.interstitialMaxPerDay
    ),
    pushDelayMs: clampRuntimeInt(
      rawCaps.pushDelayMs,
      MONETAG_CAP_BOUNDS.pushDelaySeconds.min * 1000,
      MONETAG_CAP_BOUNDS.pushDelaySeconds.max * 1000,
      MONETAG_DEFAULT_CAPS.pushDelayMs
    ),
    pushMinVisits: clampRuntimeInt(
      rawCaps.pushMinVisits,
      MONETAG_CAP_BOUNDS.pushMinVisits.min,
      MONETAG_CAP_BOUNDS.pushMinVisits.max,
      MONETAG_DEFAULT_CAPS.pushMinVisits
    ),
    pushDeclineDays: clampRuntimeInt(
      rawCaps.pushDeclineDays,
      MONETAG_CAP_BOUNDS.pushDeclineDays.min,
      MONETAG_CAP_BOUNDS.pushDeclineDays.max,
      MONETAG_DEFAULT_CAPS.pushDeclineDays
    ),
    emptySlotCollapseMs: clampRuntimeInt(
      rawCaps.emptySlotCollapseMs,
      MONETAG_CAP_BOUNDS.emptySlotCollapseMs.min,
      MONETAG_CAP_BOUNDS.emptySlotCollapseMs.max,
      MONETAG_DEFAULT_CAPS.emptySlotCollapseMs
    ),
  };

  const candidateInterstitialUrl =
    serverCfg.monetag?.interstitial?.url ||
    staticCfg.monetag?.interstitial?.url ||
    buildMonetagZoneUrl(interstitialZoneId);

  return {
    formats: {
      banner: typeof serverCfg.formats?.banner === 'boolean' ? serverCfg.formats.banner : DEFAULT_AD_CONFIG.formats.banner,
      sticky: typeof serverCfg.formats?.sticky === 'boolean' ? serverCfg.formats.sticky : DEFAULT_AD_CONFIG.formats.sticky,
      popunder: typeof serverCfg.formats?.popunder === 'boolean' ? serverCfg.formats.popunder : DEFAULT_AD_CONFIG.formats.popunder,
      interstitial: typeof serverCfg.formats?.interstitial === 'boolean' ? serverCfg.formats.interstitial : DEFAULT_AD_CONFIG.formats.interstitial,
      push: typeof serverCfg.formats?.push === 'boolean' ? serverCfg.formats.push : DEFAULT_AD_CONFIG.formats.push,
    },
    testMode,
    monetag: {
      verificationId,
      vignetteZoneId,
      interstitialZoneId,
      interstitial: {
        zoneId: interstitialZoneId,
        url: isSafeMonetagZoneUrl(candidateInterstitialUrl)
          ? candidateInterstitialUrl
          : buildMonetagZoneUrl(interstitialZoneId),
      },
      popunderZoneId,
      zones: Array.isArray(serverCfg.monetag?.zones)
        ? serverCfg.monetag.zones.filter((z: DynamicMonetagZone) => z && sanitizeMonetagZoneIdStrict(z.zoneId) && isSafeMonetagZoneUrl(z.url))
        : Array.isArray(staticCfg.monetag?.directZones)
          ? staticCfg.monetag.directZones.filter((z: DynamicMonetagZone) => z && sanitizeMonetagZoneIdStrict(z.zoneId) && isSafeMonetagZoneUrl(z.url))
          : undefined,
      showRegularAds: monetagShowRegular,
      rewardedEnabled: monetagRewarded,
      rewardedShowFn: safeShowFn,
      rewardedZoneId,
      caps,
    },
    rewards: {
      durationMinutes: clampRuntimeInt(serverCfg.rewards?.durationMinutes ?? staticCfg.rewards?.durationMinutes, 1, 1440, 60),
      minWatchMs: clampRuntimeInt(serverCfg.rewards?.minWatchMs ?? staticCfg.rewards?.minWatchMs, 1000, 300000, 15000),
      cooldownMinutes: clampRuntimeInt(serverCfg.rewards?.cooldownMinutes ?? staticCfg.rewards?.cooldownMinutes, 0, 1440, 180),
      maxPerDevicePerDay: clampRuntimeInt(serverCfg.rewards?.maxPerDevicePerDay ?? staticCfg.rewards?.maxPerDevicePerDay, 0, 100, 3),
      unlocksVipChannels:
        typeof serverCfg.rewards?.unlocksVipChannels === 'boolean'
          ? serverCfg.rewards.unlocksVipChannels
          : true,
      anyRewardedAvailable: monetagRewarded,
    },
  };
}

export function isRealVipActive(): boolean {
  return getAdGateState() === 'vip';
}

function readRewardExpiredCooldown(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(REWARD_EXPIRED_PENDING_KEY);
    if (!raw) return null;
    const mins = parseInt(raw, 10);
    return isNaN(mins) ? 180 : Math.max(0, mins);
  } catch {
    return null;
  }
}

export function useAdGate() {
  const [adState, setAdState] = useState<AdGateState>(() => getAdGateState());
  const [adConfig, setAdConfig] = useState<AdFormatConfig>(() => getAdRuntimeConfig());
  const [expiredNotice, setExpiredNotice] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(EXPIRED_NOTICE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [rewardExpiredNotice, setRewardExpiredNotice] = useState<number | null>(() => readRewardExpiredCooldown());

  useEffect(() => {
    const syncState = () => {
      const next = getAdGateState();
      setAdState(next);
      try {
        setExpiredNotice(localStorage.getItem(EXPIRED_NOTICE_KEY) === '1');
        setRewardExpiredNotice(readRewardExpiredCooldown());
      } catch {}
    };
    const syncConfig = () => setAdConfig(getAdRuntimeConfig());
    const onRewardExpiredOnce = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const mins = typeof detail?.cooldownMinutes === 'number' ? detail.cooldownMinutes : readRewardExpiredCooldown();
      if (mins !== null && mins !== undefined) {
        setRewardExpiredNotice(Math.max(0, mins));
      }
    };

    syncState();
    syncConfig();

    if (getAdGateState() === 'free' && typeof window !== 'undefined' && !(window as any).__MRS_ADS_SERVER_CONFIG) {
      fetchDynamicAdConfig(false).then(() => syncConfig()).catch(() => {});
    }

    window.addEventListener('mrs_ads_state_change', syncState);
    window.addEventListener('mrs_ads_config_loaded', syncConfig);
    window.addEventListener('shahintv_adfree_updated', syncState);
    window.addEventListener('mrs_reward_expired_once', onRewardExpiredOnce);
    window.addEventListener('storage', syncState);

    return () => {
      window.removeEventListener('mrs_ads_state_change', syncState);
      window.removeEventListener('mrs_ads_config_loaded', syncConfig);
      window.removeEventListener('shahintv_adfree_updated', syncState);
      window.removeEventListener('mrs_reward_expired_once', onRewardExpiredOnce);
      window.removeEventListener('storage', syncState);
    };
  }, []);

  const dismissExpiredNotice = useCallback(() => {
    setExpiredNotice(false);
    try {
      localStorage.removeItem(EXPIRED_NOTICE_KEY);
    } catch {}
  }, []);

  const dismissRewardExpiredNotice = useCallback(() => {
    setRewardExpiredNotice(null);
    try {
      localStorage.removeItem(REWARD_EXPIRED_PENDING_KEY);
    } catch {}
  }, []);

  const openPrivacySettings = useCallback(() => {
    try {
      (window as any).MRS_ADS_OPEN_CONSENT?.();
    } catch {}
  }, []);

  return {
    adState,
    isFreeMode: adState === 'free',
    isVipLocked: adState === 'vip',
    isPending: adState === 'pending',
    adConfig,
    expiredNotice,
    dismissExpiredNotice,
    rewardExpiredNotice,
    dismissRewardExpiredNotice,
    openPrivacySettings,
  };
}
