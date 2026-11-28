import React, { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { RefreshCw, Radio, X, Maximize, SkipBack, SkipForward } from 'lucide-react';
import { Channel } from './types';

declare global {
  interface Window {
    programmaticBack?: boolean;
  }
}
import { lazy } from 'react';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { TopHeader } from './components/TopHeader';
import { Home } from './components/Home';
import { SmartTvPlayer } from './components/SmartTvPlayer';
import { MinimalTvPlayer } from './components/MinimalTvPlayer';
import { PremiumModal } from './components/PremiumModal';
import { ReferralModal } from './components/ReferralModal';
import { ModernAdModal } from './components/ModernAdModal';
import { RewardedAdInterstitial } from './components/RewardedAdInterstitial';
import { HourlyAdReminderOverlay } from './components/HourlyAdReminderOverlay';
import { MonetagAdManager } from './components/MonetagAdManager';
import { WatchAdVipButton } from './components/WatchAdVipButton';
import { AiCopilotView } from './components/AiCopilotView';
import { AiAssistantModal } from './components/AiAssistantModal';
import { M3uManagerModal } from './components/M3uManagerModal';
import { CamelliaAutoDevModal } from './components/CamelliaAutoDevModal';
import { MonthlyReportModal } from './components/MonthlyReportModal';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AccountSupportModal } from './components/AccountSupportModal';
import { LegalPolicyModal } from './components/LegalPolicyModal';
import { getStoredAdFreeState, getDeviceId } from './lib/codes';
import { 
  configure as configureMrsVip, 
  refreshEntitlement, 
  syncPendingOrderVip,
  isVip,
  getCachedEntitlement 
} from './lib/mrsVip';
import { canTriggerInterstitialAd } from './lib/adSystem';
import { handleIncomingReferral, sendReferralHeartbeat, syncReferralVipReward } from './lib/referral';
import { AdFreeState } from './types';
import { applyEPGToChannels } from './lib/epg';
import { useSpatialNavigation } from './useSpatialNavigation';
import { normalizeChannelsList, getExactChannelCategory } from './lib/channelCategorizer';
import { shouldAutoOpenAndroidTvMode, setTvModeExited, isAndroidTvDevice, isMobileDevice } from './lib/screenDimensions';
import { AndroidTvVipGate } from './components/AndroidTvVipGate';
import { setBackendDetectedCountry } from './lib/geoChannelNumbering';
import { useRemoteConfig } from './hooks/useRemoteConfig';
import { useBroadcastTheme } from './lib/themeSystem';
import { useAdGate, getAdGateState, getAdRuntimeConfig } from './lib/useAdGate';


const VideoPlayer = lazy(() => import('./components/VideoPlayer'));

export default function App() {
  useSpatialNavigation();
  useBroadcastTheme();
  const remoteConfig = useRemoteConfig();
  const {
    isFreeMode,
    expiredNotice,
    dismissExpiredNotice,
    rewardExpiredNotice,
    dismissRewardExpiredNotice,
    adConfig,
  } = useAdGate();
  const [channels, setChannels] = useState<Channel[]>(() => {
    try {
      const cached = localStorage.getItem('shahintv_channels_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const verifiedOnly = parsed.filter((c: any) => c?.liveVerified === true);
          if (verifiedOnly.length > 0) return normalizeChannelsList(verifiedOnly);
        }
      }
    } catch (e) {}
    return [];
  });

  const [performanceData, setPerformanceData] = useState<Record<string, { status: 'live' | 'offline'; latency: number; lastChecked: number }>>(() => {
    try {
      const stored = localStorage.getItem('shahintv_performance');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('shahintv_performance', JSON.stringify(performanceData));
    } catch (e) {
      console.warn("Failed to write performance to localStorage", e);
    }
  }, [performanceData]);

  const markChannelOffline = useCallback((channelId: string) => {
    setPerformanceData(prev => ({
      ...prev,
      [channelId]: { status: 'offline', latency: 9999, lastChecked: Date.now() }
    }));
  }, []);

  const sortedChannels = useMemo(() => {
    // Preserve the exact backend location-based system list order
    if (!performanceData || Object.keys(performanceData).length === 0) {
      return channels;
    }
    const onlineOrUntested: Channel[] = [];
    const offline: Channel[] = [];
    for (const ch of channels) {
      if (performanceData[ch.id]?.status === 'offline') {
        offline.push(ch);
      } else {
        onlineOrUntested.push(ch);
      }
    }
    return [...onlineOrUntested, ...offline];
  }, [channels, performanceData]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isAppPip, setIsAppPip] = useState(false);
  const [detectedLocation, setDetectedLocation] = useState<{ country: string; region: string | null; regionLabel: string } | null>(null);
  const [locationSource, setLocationSource] = useState<'network-estimate' | 'unavailable'>('unavailable');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#admin') {
      return 'admin';
    }
    if (shouldAutoOpenAndroidTvMode()) {
      return 'play-android-tv';
    }
    return 'home';
  });
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isM3uModalOpen, setIsM3uModalOpen] = useState(false);
  const [isCamelliaAutoDevOpen, setIsCamelliaAutoDevOpen] = useState(false);
  const [isMonthlyReportOpen, setIsMonthlyReportOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountInitialTab, setAccountInitialTab] = useState<'account' | 'support'>('account');
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalInitialTab, setLegalInitialTab] = useState<'terms' | 'dmca' | 'vip' | 'refund' | 'privacy' | 'security' | 'about'>('terms');

  const handleOpenAccountModal = useCallback((tab: 'account' | 'support' = 'account') => {
    setAccountInitialTab(tab);
    setIsAccountModalOpen(true);
  }, []);

  const handleOpenLegalModal = useCallback((tab: 'terms' | 'dmca' | 'vip' | 'refund' | 'privacy' | 'security' | 'about' = 'terms') => {
    setLegalInitialTab(tab);
    setIsLegalModalOpen(true);
  }, []);

  // Live Stream Watch History & Search History for AI Personalization Engine
  const [watchHistory, setWatchHistory] = useState<{ id?: string; name: string; category?: string; count?: number; watchedAt?: number }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('shahintv_watch_history') || '[]');
    } catch {
      return [];
    }
  });

  const [searchHistory, setSearchHistory] = useState<(string | { query: string; searchedAt?: number })[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('shahintv_search_history') || '[]');
    } catch {
      return [];
    }
  });

  const addToWatchHistory = useCallback((channel: Channel) => {
    setWatchHistory(prev => {
      const existingIdx = prev.findIndex(item => (item.id && item.id === channel.id) || item.name.toLowerCase() === channel.name.toLowerCase());
      let updated;
      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          count: (updated[existingIdx].count || 1) + 1,
          watchedAt: Date.now()
        };
      } else {
        updated = [{
          id: channel.id,
          name: channel.name,
          category: channel.category || 'General',
          count: 1,
          watchedAt: Date.now()
        }, ...prev];
      }
      const sliced = updated.slice(0, 50);
      try {
        localStorage.setItem('shahintv_watch_history', JSON.stringify(sliced));
      } catch (e) {}
      return sliced;
    });
  }, []);

  const addToSearchHistory = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;
    setSearchHistory(prev => {
      const filtered = prev.filter(item => {
        const qStr = typeof item === 'string' ? item : item.query;
        return qStr.toLowerCase() !== trimmed.toLowerCase();
      });
      const updated = [{ query: trimmed, searchedAt: Date.now() }, ...filtered].slice(0, 30);
      try {
        localStorage.setItem('shahintv_search_history', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  }, []);

  const clearWatchHistory = useCallback(() => {
    try {
      localStorage.removeItem('shahintv_watch_history');
    } catch (e) {}
    setWatchHistory([]);
  }, []);

  const clearSearchHistory = useCallback(() => {
    try {
      localStorage.removeItem('shahintv_search_history');
    } catch (e) {}
    setSearchHistory([]);
  }, []);

  // Ad System States - Option 1: Rewarded User-Initiated Sponsor Gateway
  const [channelPlayCount, setChannelPlayCount] = useState(0);
  const [isRewardedAdOpen, setIsRewardedAdOpen] = useState(false);
  const [rewardedAdTitle, setRewardedAdTitle] = useState("Preparing Your Live Stream");
  const [pendingPlayAction, setPendingPlayAction] = useState<(() => void) | null>(null);

  const handleProceedAfterAd = useCallback(() => {
    setIsRewardedAdOpen(false);
    setChannelPlayCount(0);
    if (pendingPlayAction) {
      const action = pendingPlayAction;
      setPendingPlayAction(null);
      action();
    }
  }, [pendingPlayAction]);

  // Live Channel Ad Check Helper (Remote Config + Ad Gate driven; never interrupts VIP or protected views)
  const triggerChannelAdCheckAndExecute = useCallback((onSuccessPlay: () => void) => {
    if (!isFreeMode || !adConfig.formats.interstitial || !remoteConfig.adsConfig.enabled) {
      onSuccessPlay();
      return;
    }
    if (document.documentElement.dataset.mrsModalOpen === '1' || isAccountModalOpen || isLegalModalOpen || activeView === 'admin') {
      onSuccessPlay();
      return;
    }
    const currentAdState = getStoredAdFreeState();
    if (currentAdState.isActive || currentAdState.isAdFree) {
      onSuccessPlay();
      return;
    }

    const threshold = Math.max(remoteConfig.adsConfig.channelPlayThreshold || 2, 2);
    if (channelPlayCount >= threshold && canTriggerInterstitialAd()) {
      setChannelPlayCount(0);
      setPendingPlayAction(() => onSuccessPlay);
      setRewardedAdTitle("Unlocking Live Stream Channel");
      setIsRewardedAdOpen(true);
      return;
    }

    setChannelPlayCount(prev => prev + 1);
    onSuccessPlay();
  }, [channelPlayCount, remoteConfig.adsConfig, isFreeMode, adConfig.formats.interstitial, isAccountModalOpen, isLegalModalOpen, activeView]);

  useEffect(() => {
    try {
      localStorage.setItem('shahintv_active_view', activeView);
    } catch (e) {
      console.warn("Failed to save activeView to localStorage", e);
    }
  }, [activeView]);

  useEffect(() => {
    if (selectedChannel) {
      try {
        localStorage.setItem('shahintv_last_played_channel_id', selectedChannel.id);
      } catch (e) {
        console.warn("Failed to save selectedChannel to localStorage", e);
      }
    }
  }, [selectedChannel]);

  const [backPressCount, setBackPressCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(300); // 5 minutes default
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState<boolean>(true);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Global passive touch event listeners for enhanced touch scrolling on low-end mobile hardware
    const dummyPassive = () => {};
    const passiveOpts: AddEventListenerOptions = { passive: true };
    window.addEventListener('touchstart', dummyPassive, passiveOpts);
    window.addEventListener('touchmove', dummyPassive, passiveOpts);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('touchstart', dummyPassive);
      window.removeEventListener('touchmove', dummyPassive);
    };
  }, []);

  // Step-by-Step Back Navigation & Browser History Sync
  useEffect(() => {
    if (selectedChannel) {
      window.history.pushState({ screen: 'live-channel' }, '');
    }
  }, [selectedChannel?.id]);

  useEffect(() => {
    if (activeView !== 'home') {
      window.history.pushState({ screen: activeView }, '');
    }
  }, [activeView]);

  useEffect(() => {
    const handlePopState = () => {
      // Step 1: If watching a Live TV channel, step back to channels catalog
      if (selectedChannel) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setSelectedChannel(null);
        setIsAppPip(false);
        return;
      }

      // Step 2: If on another view, step back to Homepage
      if (activeView !== 'home') {
        setActiveView('home');
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selectedChannel, activeView]);


  useEffect(() => {
    setSearchQuery('');
  }, [activeView]);

  useEffect(() => {
    if (searchQuery && searchQuery.trim().length >= 2) {
      const timer = setTimeout(() => {
        addToSearchHistory(searchQuery);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, addToSearchHistory]);


  const loadChannels = async (isBackground = false) => {
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [channelsRes, allChannelsRes] = await Promise.allSettled([
        fetch('/api/channels', { cache: 'no-store' }),
        fetch('/api/all-channels', { cache: 'no-store' })
      ]);

      let serverList: Channel[] = [];
      let serverConfirmedLiveOnly = false;

      if (channelsRes.status === 'fulfilled' && channelsRes.value.ok) {
        try {
          const geoPayload = await channelsRes.value.json();
          if (geoPayload?.liveOnly === true) {
            serverConfirmedLiveOnly = true;
          }
          if (geoPayload?.location) {
            setDetectedLocation(geoPayload.location);
            setLocationSource(geoPayload.locationSource === 'network-estimate' ? 'network-estimate' : 'unavailable');
            if (geoPayload.location.country) {
              setBackendDetectedCountry(geoPayload.location.country);
            }
          } else {
            setDetectedLocation(null);
            setLocationSource('unavailable');
          }
          if (Array.isArray(geoPayload?.channels)) {
            serverList = geoPayload.channels;
          }
        } catch {}
      }

      if (allChannelsRes.status === 'fulfilled' && allChannelsRes.value.ok && serverList.length === 0) {
        try {
          const data = await allChannelsRes.value.json();
          if (data?.health?.liveOnly === true) {
            serverConfirmedLiveOnly = true;
          }
          if (data?.detectedCountry) {
            setBackendDetectedCountry(data.detectedCountry);
          }
          if (data && Array.isArray(data.channels) && data.channels.length > 0) {
            serverList = data.channels;
          }
        } catch {}
      }

      if (serverList.length > 0 || serverConfirmedLiveOnly) {
        const uniqueMap = new Map<string, Channel>();

        serverList.forEach((ch: Channel) => {
          const key = ch.id || (ch.name.toLowerCase().trim() + '||' + ch.m3u8Url);
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, { ...ch, liveVerified: true });
          }
        });

        const fullList = normalizeChannelsList(Array.from(uniqueMap.values()));
        setChannels(fullList);
        try {
          if (fullList.length > 0) {
            localStorage.setItem('shahintv_channels_cache', JSON.stringify(fullList.slice(0, 1500)));
          } else {
            localStorage.removeItem('shahintv_channels_cache');
          }
        } catch {}

        // Apply EPG data where available without blocking channel availability
        if (fullList.length > 0) {
          try {
            const epgList = await applyEPGToChannels(fullList);
            setChannels(epgList);
          } catch {}
        }
      }
    } catch (err: any) {
      console.warn("Error fetching aggregated channels:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setLastRefreshed(new Date());
    }
  };

  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  const handleClearCache = async () => {
    try {
      localStorage.removeItem('shahintv_channels_cache');
      localStorage.removeItem('shahintv_epg_cache');
      setCacheNotice('Local cache cleared! Re-syncing live streams from server...');
      await loadChannels(false);
      setTimeout(() => setCacheNotice(null), 3500);
    } catch (e) {
      console.error('Failed to clear local cache:', e);
    }
  };

  useEffect(() => {
    // Instant background fetch on mount
    loadChannels(true);
  }, []);

  useEffect(() => {
    if (!isAutoRefreshEnabled || refreshIntervalSec <= 0) return;
    const interval = setInterval(() => {
      console.log("Auto-refreshing channels...");
      loadChannels(true);
    }, refreshIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [isAutoRefreshEnabled, refreshIntervalSec]);

  const categories = useMemo(() => {
    const cats = new Map<string, Channel[]>();
    sortedChannels.forEach(c => {
      const catName = c.category?.toUpperCase() || 'GENERAL';
      if (!cats.has(catName)) {
        cats.set(catName, []);
      }
      cats.get(catName)!.push(c);
    });
    
    // Sort categories alphabetically
    const sortedCats = Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    return sortedCats.map(([name, channels]) => ({ name, channels }));
  }, [sortedChannels]);

  const [adFreeState, setAdFreeState] = useState<AdFreeState>(() => getStoredAdFreeState());
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);

  // --- Autonomous Referral Engine & Live Heartbeat Loop ---
  useEffect(() => {
    // 1. Process incoming referral link (?ref=...)
    handleIncomingReferral();

    // 2. Sync any AI-granted VIP rewards (1-Week or 1-Month Passes)
    syncReferralVipReward((updatedState) => {
      setAdFreeState(updatedState);
    });

    // 3. Sync 12h delayed auto-activation for pending orders & check VIP entitlement on boot
    refreshEntitlement().catch(() => {});
    syncPendingOrderVip().then((res) => {
      if (res.claimed && res.entitlement) {
        setAdFreeState({
          isActive: true,
          isAdFree: true,
          activatedAt: res.order?.autoActivatedAt || new Date().toISOString(),
          expiryDate: res.entitlement.expiresAt || '',
          durationMonths: Number(String(res.order?.plan || '1m').replace('m', '')) || 1,
          code: 'SERVER_VERIFIED',
          deviceId: getDeviceId()
        });
      }
    }).catch(() => {});

    // 4. Listen for #admin hash routing
    const handleHashChange = () => {
      if (window.location.hash === '#admin') {
        setActiveView('admin');
      }
    };
    window.addEventListener('hashchange', handleHashChange);

    // 5. Background Stay/Watch Engagement Heartbeat (tracks 30-hour milestone)
    const heartbeatInterval = setInterval(() => {
      sendReferralHeartbeat(60);
      // Check for newly earned rewards periodically
      syncReferralVipReward((updatedState) => {
        setAdFreeState(updatedState);
      });
    }, 60000);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const [firstTimeVipExpiryTip, setFirstTimeVipExpiryTip] = useState(false);

  useEffect(() => {
    const onFirstVipExpired = () => {
      setFirstTimeVipExpiryTip(true);
    };
    window.addEventListener('mrs_1h_vip_expired_first_time', onFirstVipExpired);
    return () => window.removeEventListener('mrs_1h_vip_expired_first_time', onFirstVipExpired);
  }, []);

  // Show "VIP unlocked for 1 hour" toast once after enterVipMode() reload
  useEffect(() => {
    try {
      if (localStorage.getItem('mrs_reward_just_unlocked') === '1') {
        localStorage.removeItem('mrs_reward_just_unlocked');
        setCacheNotice('VIP unlocked for 1 hour');
        setTimeout(() => setCacheNotice(null), 5000);
      }
    } catch {}
  }, []);

  // Function to verify expiration date on load and remove expired codes from localStorage
  const verifyAndCleanExpiredAdFreeState = useCallback(() => {
    try {
      const raw = localStorage.getItem('shahintv_adfree_activation');
      if (!raw) return;

      const data: AdFreeState = JSON.parse(raw);
      if (data && data.expiryDate) {
        const now = new Date();
        const expiry = new Date(data.expiryDate);

        if (now >= expiry) {
          const isTemp1hVip =
            data.code === 'REWARD_1H_VIP' ||
            Number(data.durationMonths) === 0;
          // Expiry date has passed: remove activation code from localStorage and restore ad-supported state
          localStorage.removeItem('shahintv_adfree_activation');
          try {
            document.cookie = 'mrs_vip_active=0; max-age=0; path=/; SameSite=Lax';
            if (typeof window !== 'undefined') (window as any).__MRS_IS_VIP = false;
          } catch {}
          const resetState: AdFreeState = {
            isActive: false,
            code: '',
            deviceId: getDeviceId(),
            activatedAt: '',
            expiryDate: '',
            durationMonths: 1,
          };
          setAdFreeState(resetState);

          if (isTemp1hVip) {
            try {
              if (!localStorage.getItem('mrs_1h_vip_expiry_tip_shown')) {
                localStorage.setItem('mrs_1h_vip_expiry_tip_shown', '1');
                window.dispatchEvent(new CustomEvent('mrs_1h_vip_expired_first_time'));
              }
            } catch {}
          }
          return;
        }
      }
    } catch (e) {
      localStorage.removeItem('shahintv_adfree_activation');
      try {
        document.cookie = 'mrs_vip_active=0; max-age=0; path=/; SameSite=Lax';
        if (typeof window !== 'undefined') (window as any).__MRS_IS_VIP = false;
      } catch {}
    }
  }, []);

  // Run expiration verification on application load and periodically
  useEffect(() => {
    verifyAndCleanExpiredAdFreeState();

    const checkExpirationAndFingerprint = () => {
      const currentDeviceId = getDeviceId();
      const current = getStoredAdFreeState();

      // Verify that if code is activated, device fingerprint matches current device
      if (current.isActive && current.deviceId && current.deviceId !== currentDeviceId) {
        const invalidState: AdFreeState = {
          ...current,
          deviceId: currentDeviceId,
          isActive: false,
        };
        localStorage.setItem('shahintv_adfree_activation', JSON.stringify(invalidState));
        setAdFreeState(invalidState);
        return;
      }

      setAdFreeState(current);
    };

    const interval = setInterval(() => {
      verifyAndCleanExpiredAdFreeState();
      checkExpirationAndFingerprint();
    }, 1000); // Check every 1 second for exact real-time 1-hour VIP expiration

    return () => clearInterval(interval);
  }, [verifyAndCleanExpiredAdFreeState]);

  // --- MRS VIP Entitlement Sync (Startup, 6-Hour Interval & visibilitychange) ---
  useEffect(() => {
    configureMrsVip({ apiBase: '' });

    const checkEntitlement = async () => {
      try {
        const ent = await refreshEntitlement();
        if (ent && ent.active && ent.expiresAt) {
          setAdFreeState(getStoredAdFreeState());
        } else if (ent && !ent.active && !ent.offline) {
          verifyAndCleanExpiredAdFreeState();
        }
      } catch (e) {
        // network error / offline fallback
      }
    };

    checkEntitlement();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkEntitlement();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Refresh every 6 hours
    const sixHours = 6 * 60 * 60 * 1000;
    const interval = setInterval(checkEntitlement, sixHours);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [verifyAndCleanExpiredAdFreeState]);

  // Real-time synchronization when Rewarded Ads / Codes update ad-free VIP status
  useEffect(() => {
    const handleAdUpdated = (e: any) => {
      const updated = e.detail || getStoredAdFreeState();
      setAdFreeState(updated);
      if (updated?.isActive && (updated?.code === 'REWARD_1H_VIP' || getCachedEntitlement()?.plan === 'reward1h')) {
        setCacheNotice('VIP unlocked for 1 hour');
        setTimeout(() => setCacheNotice(null), 5000);
      }
    };
    window.addEventListener('shahintv_adfree_updated', handleAdUpdated);
    return () => window.removeEventListener('shahintv_adfree_updated', handleAdUpdated);
  }, []);

  // Automated 5-minute VIP Ad Overlay Timer (Free mode only, never during active playback or protected modals)
  const [isFiveMinAdVisible, setIsFiveMinAdVisible] = useState<boolean>(false);

  useEffect(() => {
    // Timer triggers 5 minutes (300,000 ms) after app opening
    const timer = setTimeout(() => {
      const gate = getAdGateState();
      const cfg = getAdRuntimeConfig();
      const current = getStoredAdFreeState();
      const root = document.documentElement;
      const isPlayerActive = root.dataset.mrsPlayerActive === '1';
      const isModalOpen = root.dataset.mrsModalOpen === '1';
      const currentView = root.dataset.mrsView || '';
      if (
        gate === 'free' &&
        cfg.formats.interstitial &&
        !current.isActive &&
        !current.isAdFree &&
        !isPlayerActive &&
        !isModalOpen &&
        currentView !== 'admin' &&
        canTriggerInterstitialAd()
      ) {
        setIsFiveMinAdVisible(true);
      }
    }, 5 * 60 * 1000);

    return () => clearTimeout(timer);
  }, []);

  // Sync player, modal, and active view markers onto <html> for the central ad-manager.js gate
  useEffect(() => {
    try {
      const root = document.documentElement;
      root.dataset.mrsPlayerActive = selectedChannel ? '1' : '0';
      const anyProtectedModal = Boolean(
        isPremiumModalOpen ||
        isAccountModalOpen ||
        isLegalModalOpen ||
        isReferralModalOpen ||
        isM3uModalOpen ||
        isAiModalOpen ||
        isCamelliaAutoDevOpen ||
        isMonthlyReportOpen
      );
      root.dataset.mrsModalOpen = anyProtectedModal ? '1' : '0';
      root.dataset.mrsView = activeView || 'home';
    } catch {}
  }, [
    selectedChannel,
    isPremiumModalOpen,
    isAccountModalOpen,
    isLegalModalOpen,
    isReferralModalOpen,
    isM3uModalOpen,
    isAiModalOpen,
    isCamelliaAutoDevOpen,
    isMonthlyReportOpen,
    activeView,
  ]);

  // Automated Visitor Analytics Heartbeat Ping
  useEffect(() => {
    const sendPing = () => {
      try {
        fetch('/api/analytics/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: window.location.pathname,
            channelWatched: selectedChannel?.name
          })
        }).catch(() => {});
      } catch (e) {}
    };

    sendPing();
    const interval = setInterval(sendPing, 20000); // Heartbeat every 20s
    return () => clearInterval(interval);
  }, [selectedChannel]);

  const [activePlaylistContext, setActivePlaylistContext] = useState<Channel[] | null>(null);

  const handleSelectChannel = useCallback((channel: Channel, contextChannels?: Channel[]) => {
    addToWatchHistory(channel);
    let context = contextChannels;

    if (!context || context.length === 0) {
      if (channel.category) {
        const catName = channel.category.toLowerCase().trim();
        const categoryMatches = sortedChannels.filter(c => 
          (c.category || '').toLowerCase().trim() === catName
        );
        if (categoryMatches.length > 0) {
          context = categoryMatches;
        }
      }
    }

    if (!context || context.length === 0) {
      context = sortedChannels;
    }

    setActivePlaylistContext(context);

    triggerChannelAdCheckAndExecute(() => {
      setIsAppPip(false);
      setSelectedChannel(channel);
    });
  }, [sortedChannels, triggerChannelAdCheckAndExecute]);


  const handleNext = useCallback(() => {
    if (!selectedChannel) return;
    
    const activeList = (activePlaylistContext && activePlaylistContext.length > 0) 
      ? activePlaylistContext 
      : sortedChannels;
      
    if (!activeList.length) return;

    let idx = activeList.findIndex(c => c.id === selectedChannel.id);
    if (idx === -1) {
      idx = activeList.findIndex(c => c.name.toLowerCase().trim() === selectedChannel.name.toLowerCase().trim());
    }
    if (idx === -1) {
      idx = activeList.findIndex(c => c.m3u8Url === selectedChannel.m3u8Url);
    }

    if (idx !== -1) {
      const nextIdx = (idx + 1) % activeList.length;
      handleSelectChannel(activeList[nextIdx], activeList);
    } else {
      handleSelectChannel(activeList[0], activeList);
    }
  }, [selectedChannel, activePlaylistContext, sortedChannels, handleSelectChannel]);

  const handlePrev = useCallback(() => {
    if (!selectedChannel) return;

    const activeList = (activePlaylistContext && activePlaylistContext.length > 0) 
      ? activePlaylistContext 
      : sortedChannels;
      
    if (!activeList.length) return;

    let idx = activeList.findIndex(c => c.id === selectedChannel.id);
    if (idx === -1) {
      idx = activeList.findIndex(c => c.name.toLowerCase().trim() === selectedChannel.name.toLowerCase().trim());
    }
    if (idx === -1) {
      idx = activeList.findIndex(c => c.m3u8Url === selectedChannel.m3u8Url);
    }

    if (idx !== -1) {
      const prevIdx = (idx - 1 + activeList.length) % activeList.length;
      handleSelectChannel(activeList[prevIdx], activeList);
    } else {
      handleSelectChannel(activeList[activeList.length - 1], activeList);
    }
  }, [selectedChannel, activePlaylistContext, sortedChannels, handleSelectChannel]);

  // Mobile devices only: After opening the site, tap anywhere on the screen un-mutes the playing stream
  useEffect(() => {
    if (!isMobileDevice()) return;

    const handleMobileDocumentTap = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('#channel-guide, button[data-mute-btn], [data-no-auto-unmute], [role="dialog"]')) {
        return;
      }
      const videos = document.querySelectorAll('video');
      videos.forEach(v => {
        if (v.muted || v.volume === 0) {
          try {
            v.muted = false;
            v.volume = 1;
            if (v.paused) v.play().catch(() => {});
          } catch (e) {}
        }
      });
    };

    window.addEventListener('touchstart', handleMobileDocumentTap, { passive: true, capture: true });
    window.addEventListener('click', handleMobileDocumentTap, { capture: true });

    return () => {
      window.removeEventListener('touchstart', handleMobileDocumentTap, { capture: true });
      window.removeEventListener('click', handleMobileDocumentTap, { capture: true });
    };
  }, []);



  // Strict Rule for Android TV devices:
  // "while open this site in android tv device, ask for premium vip access. without premium vip access, can't access the site. this rule only for Android TV devices."
  const isAndroidTv = useMemo(() => isAndroidTvDevice(), []);

  if (isAndroidTv && !adFreeState.isActive && !adFreeState.isAdFree) {
    return (
      <AndroidTvVipGate 
        onActivated={(newState) => {
          setAdFreeState(newState);
        }}
      />
    );
  }

  if (activeView === 'smart-tv' || activeView === 'play-android-tv') {
    return (
      <SmartTvPlayer 
        channels={sortedChannels} 
        onClose={() => {
          setTvModeExited(true);
          setActiveView('home');
        }} 
        favorites={favorites} 
        setFavorites={setFavorites} 
        onChannelError={markChannelOffline}
        detectedLocation={detectedLocation}
        locationSource={locationSource}
      />
    );
  }

  if (activeView === 'minimal-tv') {
    return (
      <MinimalTvPlayer
        channels={sortedChannels}
        onClose={() => setActiveView('home')}
        onChannelError={markChannelOffline}
        detectedLocation={detectedLocation}
        locationSource={locationSource}
      />
    );
  }

  return (
    <div className="flex w-full h-screen bg-[var(--theme-bg,#070A11)] text-white overflow-hidden font-sans select-none relative">
      
      {/* Desktop Sidebar */}
      {(!selectedChannel || isAppPip) && (
        <Sidebar 
          isMobileMenuOpen={isMobileMenuOpen} 
          onCloseMobileMenu={() => setIsMobileMenuOpen(false)} 
          activeView={activeView} 
          setActiveView={setActiveView}
          onOpenPremiumModal={() => setIsPremiumModalOpen(true)}
          onOpenReferralModal={() => setIsReferralModalOpen(true)}
          onOpenMonthlyReport={() => setIsMonthlyReportOpen(true)}
          onOpenAccountModal={handleOpenAccountModal}
          onOpenLegalModal={handleOpenLegalModal}
          adFreeState={adFreeState}
          onRewardedGranted={(newState) => setAdFreeState(newState)}
          onClearCache={handleClearCache}
          totalChannelsCount={sortedChannels.length}
          favoritesCount={favorites.length}
        />
      )}
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        
        {cacheNotice && (
          <div className="fixed top-5 right-5 z-[120] btn-premium-primary text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-black">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            <span>{cacheNotice}</span>
          </div>
        )}

        {expiredNotice && isFreeMode && (
          <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[126] w-[92%] max-w-md p-3.5 rounded-xl bg-[rgba(12,18,40,0.96)] border border-amber-400/50 shadow-[0_18px_45px_rgba(0,0,0,0.92)] backdrop-blur-xl flex items-center justify-between gap-3 text-white">
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-300">VIP Plan Expired</p>
              <p className="text-[11px] text-white/80 leading-snug mt-0.5">
                Your VIP plan has expired. Renew to go ad-free.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  dismissExpiredNotice();
                  setIsPremiumModalOpen(true);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg btn-premium-gold text-xs font-extrabold cursor-pointer shrink-0"
              >
                Renew VIP
              </button>
              <button
                type="button"
                aria-label="Dismiss VIP plan expired notice"
                onClick={dismissExpiredNotice}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {rewardExpiredNotice !== null && isFreeMode && !selectedChannel && activeView !== 'admin' && !adFreeState.isActive && (
          <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[126] w-[92%] max-w-lg p-3.5 rounded-xl bg-[rgba(12,18,40,0.96)] border border-amber-400/50 shadow-[0_18px_45px_rgba(0,0,0,0.92)] backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white">
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-300">Free VIP Hour Ended</p>
              <p className="text-[11px] text-white/85 leading-snug mt-0.5">
                {rewardExpiredNotice > 0
                  ? `Your free hour ended. Watch another ad (available in ${rewardExpiredNotice} minutes) or go VIP.`
                  : 'Your free hour ended. Watch another ad now or go VIP.'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {rewardExpiredNotice <= 0 && (
                <WatchAdVipButton
                  variant="header"
                  adFreeState={adFreeState}
                  onAfterClick={dismissRewardExpiredNotice}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  dismissRewardExpiredNotice();
                  setIsPremiumModalOpen(true);
                }}
                className="mrs-free-upsell min-h-[36px] px-3 py-1.5 rounded-lg btn-premium-gold text-xs font-extrabold cursor-pointer shrink-0"
              >
                Go VIP
              </button>
              <button
                type="button"
                aria-label="Dismiss free hour ended message"
                onClick={dismissRewardExpiredNotice}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {firstTimeVipExpiryTip && rewardExpiredNotice === null && isFreeMode && !expiredNotice && !adFreeState.isActive && !adFreeState.isAdFree && (
          <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[125] w-[92%] max-w-md p-3.5 rounded-xl bg-[rgba(12,18,40,0.96)] border border-[#F5B301]/50 shadow-[0_18px_45px_rgba(0,0,0,0.92)] backdrop-blur-xl flex items-center justify-between gap-3 text-white midnight-glass-noise">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#F5B301]">Free VIP Hour Ended</p>
              <p className="text-[11px] text-white/75 leading-snug mt-0.5">
                Your free hour ended. Watch another ad after cooldown or go VIP.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setFirstTimeVipExpiryTip(false);
                  setIsPremiumModalOpen(true);
                }}
                className="mrs-free-upsell min-h-[36px] px-3 py-1.5 rounded-lg btn-premium-gold text-xs font-extrabold cursor-pointer shrink-0"
              >
                Go VIP
              </button>
              <button
                type="button"
                aria-label="Dismiss VIP expiry tip"
                onClick={() => setFirstTimeVipExpiryTip(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        )}
        
        {/* Comfortable Rewarded Sponsor Gateway (Free Mode Only) */}
        {isFreeMode && (
          <RewardedAdInterstitial
            isOpen={isRewardedAdOpen}
            onClose={() => setIsRewardedAdOpen(false)}
            onProceed={handleProceedAfterAd}
            adFreeState={adFreeState}
            onRewardedGranted={(newState) => {
              setAdFreeState(newState);
            }}
            title={rewardedAdTitle}
            dwellSeconds={remoteConfig.adsConfig.dwellTimerSeconds || 5}
          />
        )}

        {(!selectedChannel || isAppPip) && <TopHeader 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          channels={sortedChannels}
          onSelectChannel={handleSelectChannel}
          onSelectHome={() => {
            setSelectedChannel(null);
            setIsAppPip(false);
            setActiveView('home');
          }}
          isMobileMenuOpen={isMobileMenuOpen} 
          setIsMobileMenuOpen={setIsMobileMenuOpen} 
          isRefreshing={isRefreshing}
          lastRefreshed={lastRefreshed}
          isAutoRefreshEnabled={isAutoRefreshEnabled}
          setIsAutoRefreshEnabled={setIsAutoRefreshEnabled}
          refreshIntervalSec={refreshIntervalSec}
          setRefreshIntervalSec={setRefreshIntervalSec}
          onManualRefresh={() => loadChannels(true)}
          onOpenPremiumModal={() => setIsPremiumModalOpen(true)}
          onOpenM3uManager={() => setIsM3uModalOpen(true)}
          onOpenAiChat={() => setIsAiModalOpen(true)}
          adFreeState={adFreeState}
          onRewardedGranted={(newState) => setAdFreeState(newState)}
          onOpenMultiScreen={() => setActiveView('minimal-tv')}
          onOpenAccountModal={handleOpenAccountModal}
          searchHistory={searchHistory}
          onClearSearchHistory={clearSearchHistory}
        />}


        {(!selectedChannel || isAppPip) && (
          activeView === 'ai' ? (
            <AiCopilotView 
              channels={sortedChannels}
              onSelectChannel={handleSelectChannel}
              selectedChannel={selectedChannel}
              onOpenM3uManager={() => setIsM3uModalOpen(true)}
              onOpenAutoDev={() => setIsCamelliaAutoDevOpen(true)}
            />
          ) : activeView === 'admin' ? (
            <AdminDashboardView
              onBackToHome={() => {
                if (typeof window !== 'undefined' && window.location.hash === '#admin') {
                  window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
                setActiveView('home');
              }}
            />
          ) : isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-white h-full">
               <div className="w-12 h-12 border-4 border-[var(--theme-accent,#38BDF8)] border-t-transparent rounded-full animate-spin mb-4" />
               <h2 className="text-xl font-medium text-[#C9D1E0]">Loading Channels...</h2>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-white h-full px-4 text-center">
               <h2 className="text-2xl font-bold text-red-500 mb-2">Failed to load channels</h2>
               <p className="text-[#C9D1E0] max-w-md">{error}</p>
               <button
                 type="button"
                 onClick={() => window.location.reload()}
                 className="mt-6 min-h-[44px] px-6 py-2.5 btn-premium-primary rounded-lg font-bold transition-colors cursor-pointer"
               >
                 Retry
               </button>
            </div>
          ) : sortedChannels.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-white h-full">
               <h2 className="text-2xl font-medium text-[#C9D1E0]">No channels found</h2>
            </div>
          ) : (
            <Home 
              channels={sortedChannels} 
              onSelectChannel={handleSelectChannel} 
              searchQuery={searchQuery} 
              setSearchQuery={setSearchQuery}
              activeView={activeView} 
              setActiveView={setActiveView} 
              favorites={favorites} 
              setFavorites={setFavorites} 
              performanceData={performanceData}
              watchHistory={watchHistory}
              searchHistory={searchHistory}
              onClearWatchHistory={clearWatchHistory}
              onClearSearchHistory={clearSearchHistory}
              onOpenAiChat={() => setIsAiModalOpen(true)}
              adFreeState={adFreeState}
              onRewardedGranted={(newState) => setAdFreeState(newState)}
              onOpenVipModal={() => setIsPremiumModalOpen(true)}
            />
          )
        )}


        <div 
          id="player-container" 
          className={
            isAppPip 
              ? "fixed bottom-20 right-4 sm:bottom-6 sm:right-6 w-[300px] sm:w-[380px] z-50 rounded-xl overflow-hidden shadow-2xl shadow-black/95 border border-[var(--theme-border-accent,rgba(56,189,248,0.5))] transition-all bg-[var(--theme-bg,#070A11)] backdrop-blur-xl flex flex-col"
              : (selectedChannel ? "absolute inset-0 z-50 bg-black flex-1 w-full h-full relative" : "hidden")
          }
        >
          {selectedChannel && (
            <>
              {isAppPip && (
                <div className="bg-black/45 backdrop-blur-md border-b border-white/15 px-2.5 py-2 flex items-center justify-between gap-2 pointer-events-auto shrink-0 z-[70]">
                  <div 
                    onClick={() => setIsAppPip(false)}
                    className="flex items-center gap-2 min-w-0 pr-1 cursor-pointer group"
                    title="Click to restore full player"
                  >
                    <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-[11px] sm:text-xs font-extrabold text-white group-hover:text-amber-300 truncate transition-colors">
                      {selectedChannel.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrev();
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-lg player-ctrl-btn text-white hover:text-amber-300 transition-all cursor-pointer shrink-0 motion-reduce:transition-none"
                      title="Previous Channel"
                      aria-label="Previous Channel"
                    >
                      <SkipBack className="w-4 h-4 text-amber-400 shrink-0" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNext();
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-lg player-ctrl-btn text-white hover:text-amber-300 transition-all cursor-pointer shrink-0 motion-reduce:transition-none"
                      title="Next Channel"
                      aria-label="Next Channel"
                    >
                      <SkipForward className="w-4 h-4 text-amber-400 shrink-0" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAppPip(false);
                      }}
                      className="h-9 px-2.5 flex items-center justify-center gap-1 rounded-lg player-ctrl-btn-active text-white text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer shrink-0 motion-reduce:transition-none"
                      title="Expand Player"
                    >
                      <Maximize className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span className="hidden sm:inline">Expand</span>
                    </button>
                    <button 
                      type="button"
                      id="player-pip-close-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedChannel(null);
                        setIsAppPip(false);
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-lg player-ctrl-btn-danger text-white transition-all cursor-pointer shrink-0 motion-reduce:transition-none"
                      title="Close Stream"
                      aria-label="Close Stream"
                    >
                      <X className="w-4 h-4 text-rose-300 shrink-0" />
                    </button>
                  </div>
                </div>
              )}

              <div className={isAppPip ? "w-full aspect-video relative" : "w-full h-full relative"}>
                <Suspense fallback={
                  <div className="flex items-center justify-center w-full h-full bg-[var(--theme-bg,#070A11)]">
                    <div className="w-10 h-10 border-4 border-[var(--theme-accent,#38BDF8)] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                }>
                  <VideoPlayer
                    channel={selectedChannel}
                    allChannels={sortedChannels}
                    onSelectChannel={(ch) => handleSelectChannel(ch, sortedChannels)}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onMinimizePip={() => setIsAppPip(true)}
                    onToggleSidebar={() => {
                      setSelectedChannel(null);
                      setIsAppPip(false);
                    }}
                    onClose={() => {
                      setSelectedChannel(null);
                      setIsAppPip(false);
                    }}
                    isSidebarOpen={false}
                    onChannelError={markChannelOffline}
                    adFreeState={adFreeState}
                    onRewardedGranted={(newState) => setAdFreeState(newState)}
                    detectedLocation={detectedLocation}
                    locationSource={locationSource}
                  />
                </Suspense>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Mobile Bottom Nav */}
      {(!selectedChannel || isAppPip) && (
        <BottomNav 
          activeView={activeView} 
          setActiveView={setActiveView} 
          onOpenPremiumModal={() => setIsPremiumModalOpen(true)}
          onOpenAccountModal={handleOpenAccountModal}
          adFreeState={adFreeState}
          isMobileMenuOpen={isMobileMenuOpen}
        />
      )}

      {/* Premium / Ad-Free Modal */}
      <PremiumModal 
        isOpen={isPremiumModalOpen} 
        onClose={() => setIsPremiumModalOpen(false)} 
        adFreeState={adFreeState} 
        onStateChange={(newState) => setAdFreeState(newState)} 
      />

      {/* Referral System & Milestone Offers Modal */}
      <ReferralModal
        isOpen={isReferralModalOpen}
        onClose={() => setIsReferralModalOpen(false)}
        adFreeState={adFreeState}
        onStateChange={(newState) => setAdFreeState(newState)}
        onOpenPremiumModal={() => {
          setIsReferralModalOpen(false);
          setIsPremiumModalOpen(true);
        }}
      />

      {/* Camellia Autonomous M3U & Site Source Manager */}
      <M3uManagerModal
        isOpen={isM3uModalOpen}
        onClose={() => setIsM3uModalOpen(false)}
        onRefreshChannels={() => loadChannels(true)}
      />

      {/* Camellia Interactive Site Assistant & Stream Doctor Modal */}
      <AiAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        channels={sortedChannels}
        onSelectChannel={handleSelectChannel}
        selectedChannel={selectedChannel}
        onOpenM3uManager={() => setIsM3uModalOpen(true)}
        onOpenAutoDev={() => setIsCamelliaAutoDevOpen(true)}
      />

      {/* Camellia 24/7 Autonomous Self-Development Engine Modal */}
      <CamelliaAutoDevModal
        isOpen={isCamelliaAutoDevOpen}
        onClose={() => setIsCamelliaAutoDevOpen(false)}
      />

      {/* Executive Monthly Report Modal for M R S */}
      <MonthlyReportModal
        isOpen={isMonthlyReportOpen}
        onClose={() => setIsMonthlyReportOpen(false)}
      />

      {/* Automated 5-Minute VIP Pass Promotion Ad Overlay (Free Mode Only) */}
      {isFreeMode && (
        <ModernAdModal
          isOpen={isFiveMinAdVisible}
          onClose={() => setIsFiveMinAdVisible(false)}
          onUpgradeClick={() => {
            setIsFiveMinAdVisible(false);
            setIsPremiumModalOpen(true);
          }}
          adFreeState={adFreeState}
          onRewardedGranted={(newState) => setAdFreeState(newState)}
        />
      )}

      {/* 1-Hour Localized Visual Image Ad Reminder (5-Second Auto-Dismiss, Free Mode Only) */}
      {isFreeMode && (
        <HourlyAdReminderOverlay
          adFreeState={adFreeState}
          onRewardedGranted={(newState) => setAdFreeState(newState)}
          onOpenVipModal={() => setIsPremiumModalOpen(true)}
        />
      )}

      {/* Account, Devices, Favorites & Support Center Modal */}
      <AccountSupportModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        initialTab={accountInitialTab}
        adFreeState={adFreeState}
        onStateChange={(newState) => setAdFreeState(newState)}
        onOpenPremiumModal={() => setIsPremiumModalOpen(true)}
        onOpenLegalModal={handleOpenLegalModal}
        favoritesCount={favorites.length}
        watchHistoryCount={watchHistory.length}
        onClearWatchHistory={clearWatchHistory}
        onNavigateFavorites={() => {
          setIsAccountModalOpen(false);
          setActiveView('favorites');
        }}
      />

      {/* Legal, Refund, Privacy, DMCA & About M R S TV Modal */}
      <LegalPolicyModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
        initialTab={legalInitialTab}
      />

      {/* Monetag Multi-Tag & Push Ad System Manager (Free Mode Only; Enforces VIP Ad-Free Immunity & Telemetry) */}
      {isFreeMode && (
        <MonetagAdManager
          adFreeState={adFreeState}
          onRewardedGranted={(newState) => setAdFreeState(newState)}
        />
      )}
    </div>
  );
}


