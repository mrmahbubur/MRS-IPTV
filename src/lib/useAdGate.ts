import { useState, useEffect, useCallback } from 'react';
import { getCachedEntitlement } from './mrsVip';

export type AdGateState = 'pending' | 'vip' | 'free';

export interface NetworkGateConfig {
  showRegularAds: boolean;
  rewardedEnabled: boolean;
  rewardedShowFn?: string | null;
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
    showRegularAds: false,
    rewardedEnabled: false,
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

  return {
    formats: {
      ...DEFAULT_AD_CONFIG.formats,
      ...(serverCfg.formats || {}),
    },
    testMode,
    monetag: {
      showRegularAds: monetagShowRegular,
      rewardedEnabled: monetagRewarded,
      rewardedShowFn: serverCfg.monetag?.rewardedShowFn || null,
    },
    rewards: {
      durationMinutes: Number(serverCfg.rewards?.durationMinutes || staticCfg.rewards?.durationMinutes || 60),
      minWatchMs: Number(serverCfg.rewards?.minWatchMs || staticCfg.rewards?.minWatchMs || 15000),
      cooldownMinutes: Number(serverCfg.rewards?.cooldownMinutes || staticCfg.rewards?.cooldownMinutes || 180),
      maxPerDevicePerDay: Number(serverCfg.rewards?.maxPerDevicePerDay || staticCfg.rewards?.maxPerDevicePerDay || 3),
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
