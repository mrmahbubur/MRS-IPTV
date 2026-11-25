import { useState, useEffect, useCallback } from 'react';
import { getCachedEntitlement } from './mrsVip';

export type AdGateState = 'pending' | 'vip' | 'free';

export interface AdFormatConfig {
  formats: {
    banner: boolean;
    sticky: boolean;
    popunder: boolean;
    interstitial: boolean;
    push: boolean;
    affiliate: boolean;
  };
  hideOffersForVip: boolean;
  testMode: boolean;
}

const DEFAULT_AD_CONFIG: AdFormatConfig = {
  formats: {
    banner: true,
    sticky: true,
    popunder: true,
    interstitial: true,
    push: false,
    affiliate: true,
  },
  hideOffersForVip: true,
  testMode: false,
};

const EXPIRED_NOTICE_KEY = 'mrs_ads_expired_notice';

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
  const serverCfg = (window as any).__MRS_ADS_SERVER_CONFIG;
  const staticCfg = (window as any).MRS_ADS_CONFIG;
  return {
    formats: {
      ...DEFAULT_AD_CONFIG.formats,
      ...(serverCfg?.formats || {}),
    },
    hideOffersForVip:
      typeof serverCfg?.hideOffersForVip === 'boolean'
        ? serverCfg.hideOffersForVip
        : typeof staticCfg?.hideOffersForVip === 'boolean'
          ? staticCfg.hideOffersForVip
          : true,
    testMode:
      typeof serverCfg?.testMode === 'boolean'
        ? serverCfg.testMode
        : Boolean(staticCfg?.testMode),
  };
}

export function isRealVipActive(): boolean {
  const state = getAdGateState();
  return state === 'vip';
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

  useEffect(() => {
    const syncState = () => {
      const next = getAdGateState();
      setAdState(next);
      try {
        setExpiredNotice(localStorage.getItem(EXPIRED_NOTICE_KEY) === '1');
      } catch {}
    };
    const syncConfig = () => setAdConfig(getAdRuntimeConfig());

    syncState();
    syncConfig();

    window.addEventListener('mrs_ads_state_change', syncState);
    window.addEventListener('mrs_ads_config_loaded', syncConfig);
    window.addEventListener('shahintv_adfree_updated', syncState);
    window.addEventListener('storage', syncState);

    return () => {
      window.removeEventListener('mrs_ads_state_change', syncState);
      window.removeEventListener('mrs_ads_config_loaded', syncConfig);
      window.removeEventListener('shahintv_adfree_updated', syncState);
      window.removeEventListener('storage', syncState);
    };
  }, []);

  const dismissExpiredNotice = useCallback(() => {
    setExpiredNotice(false);
    try {
      localStorage.removeItem(EXPIRED_NOTICE_KEY);
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
    openPrivacySettings,
  };
}
