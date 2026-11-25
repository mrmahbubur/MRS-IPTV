import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Zap, Gift, Crown, ShieldCheck, X, CheckCircle2 } from 'lucide-react';
import {
  AdZoneConfig,
  getRandomAdZone,
  recordAdEvent,
  grantRewardedAdFreeTime,
  getBackendAdRedirectUrl
} from '../lib/adSystem';
import { AdFreeState } from '../types';
import { useRemoteConfig } from '../hooks/useRemoteConfig';
import { useAdGate } from '../lib/useAdGate';

interface AdBannerUnitProps {
  placement: 'home-top' | 'catalog-inline' | 'player-below' | 'player-overlay' | 'sidebar-card';
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  onOpenVipModal?: () => void;
  compact?: boolean;
  refreshTrigger?: string | number;
}

export const AdBannerUnit: React.FC<AdBannerUnitProps> = ({
  placement,
  adFreeState,
  onRewardedGranted,
  onOpenVipModal,
  compact = false,
  refreshTrigger
}) => {
  const remoteConfig = useRemoteConfig();
  const { isFreeMode, adConfig } = useAdGate();

  const isLegacyVip = !!(adFreeState?.isActive && adFreeState?.code !== 'SPONSOR_REWARD_VIP' && adFreeState?.isAdFree);
  const canRenderAds = isFreeMode && !isLegacyVip && adConfig.formats.banner && remoteConfig.adsConfig.enabled && placement !== 'player-overlay';

  const [activeZone, setActiveZone] = useState<AdZoneConfig>(() => getRandomAdZone());
  const [isDismissed, setIsDismissed] = useState(false);
  const [justClaimedVip, setJustClaimedVip] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isInViewport, setIsInViewport] = useState(false);
  const verifiedZoneKeyRef = useRef<string>('');

  useEffect(() => {
    const handleGlobalRotation = (e: Event) => {
      const customEvt = e as CustomEvent<{ clickedZone?: AdZoneConfig; nextZone?: AdZoneConfig }>;
      verifiedZoneKeyRef.current = '';
      if (customEvt.detail?.nextZone) {
        setActiveZone(customEvt.detail.nextZone);
      } else {
        setActiveZone(getRandomAdZone());
      }
    };
    window.addEventListener('mrs_ad_zone_rotated', handleGlobalRotation);
    return () => window.removeEventListener('mrs_ad_zone_rotated', handleGlobalRotation);
  }, []);

  useEffect(() => {
    if (!canRenderAds || refreshTrigger === undefined) return;
    setActiveZone(getRandomAdZone());
    setIsDismissed(false);
  }, [refreshTrigger, canRenderAds]);

  useEffect(() => {
    if (!canRenderAds || isDismissed || !containerRef.current) return;
    const el = containerRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsInViewport(entry.isIntersecting && entry.intersectionRatio >= 0.5);
        }
      },
      { threshold: [0, 0.5, 1] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [canRenderAds, isDismissed]);

  useEffect(() => {
    if (!canRenderAds || isDismissed || !isInViewport) return;
    const zoneKey = `${activeZone.id}-${placement}-${refreshTrigger || 0}`;
    if (verifiedZoneKeyRef.current === zoneKey) return;

    const viewTimer = setTimeout(() => {
      if (verifiedZoneKeyRef.current !== zoneKey) {
        verifiedZoneKeyRef.current = zoneKey;
        recordAdEvent('impression', activeZone, placement);
      }
    }, 1000);

    return () => clearTimeout(viewTimer);
  }, [activeZone, placement, isInViewport, canRenderAds, isDismissed, refreshTrigger]);

  // 4-second empty slot monitor: collapse if container rendered empty
  useEffect(() => {
    if (!canRenderAds || isDismissed) return;
    const timer = setTimeout(() => {
      const el = containerRef.current;
      if (el && el.getBoundingClientRect().height < 10) {
        setIsDismissed(true);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [canRenderAds, isDismissed]);

  if (!canRenderAds || isDismissed) return null;

  if (adConfig.testMode) {
    return (
      <div
        ref={containerRef}
        data-ad-slot={placement}
        data-sponsored="true"
        className={`ad-slot ad-banner-slot ${compact ? 'ad-banner-compact' : ''} w-full rounded-xl border border-dashed border-amber-400/60 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3 text-xs text-amber-200`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="ad-label px-2 py-0.5 rounded bg-amber-400 text-[#050816] font-mono font-black text-[10px] uppercase shrink-0">
            Test Mode · Sponsored
          </span>
          <span className="truncate font-semibold">
            {compact ? '320x50 / Compact Ad Placeholder' : '728x90 Desktop / 320x50 Mobile Ad Placeholder'} ({placement})
          </span>
        </div>
        {onOpenVipModal && (
          <button
            type="button"
            onClick={onOpenVipModal}
            className="mrs-free-upsell shrink-0 text-[11px] font-bold text-amber-300 hover:text-white underline cursor-pointer"
          >
            Go ad-free with VIP
          </button>
        )}
      </div>
    );
  }

  const backendAdUrl = getBackendAdRedirectUrl(placement, activeZone.zoneId);

  const handleAdClick = () => {
    recordAdEvent('click', activeZone, placement);
    const newState = grantRewardedAdFreeTime(remoteConfig.adsConfig.rewardHours || 1);
    if (onRewardedGranted) {
      onRewardedGranted(newState);
    }
  };

  const handleRewardClick = () => {
    recordAdEvent('click', activeZone, `${placement}-reward`);
    setActiveZone(getRandomAdZone());
    const newState = grantRewardedAdFreeTime(remoteConfig.adsConfig.rewardHours || 1);
    setJustClaimedVip(true);
    if (onRewardedGranted) {
      onRewardedGranted(newState);
    }
  };

  if (justClaimedVip) {
    return (
      <div className="ad-slot w-full bg-[#0D1A14] border border-emerald-400/60 rounded-xl px-4 py-3 flex items-center justify-between gap-2 text-xs text-emerald-300 shadow-lg">
        <div className="flex items-center gap-2 font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>1-Hour Sponsor Bonus Activated! Enjoy uninterrupted streaming.</span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        ref={containerRef}
        data-ad-slot={placement}
        data-sponsored="true"
        className="ad-slot ad-banner-slot ad-banner-compact w-full premium-card rounded-xl p-3 flex items-center justify-between gap-3 shadow-md transition-all"
      >
        <a
          href={backendAdUrl}
          target="_blank"
          rel="sponsored nofollow noopener"
          data-ad-link="true"
          onClick={handleAdClick}
          className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
        >
          {activeZone.imageUrl ? (
            <div className="w-12 h-10 rounded-lg overflow-hidden border border-amber-400/50 shrink-0 group-hover:scale-105 transition-transform relative">
              <img
                src={activeZone.imageUrl}
                alt={activeZone.label}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4 shrink-0" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] text-[#C9D1E0]">
              <span className="ad-label font-mono uppercase tracking-wider text-amber-400 font-bold shrink-0">
                Sponsored
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate text-emerald-400 font-semibold">{activeZone.badge}</span>
            </div>
            <p className="text-xs font-bold text-white group-hover:text-amber-300 truncate transition-colors">
              {activeZone.label}
            </p>
          </div>
        </a>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenVipModal && (
            <button
              type="button"
              onClick={onOpenVipModal}
              className="mrs-free-upsell hidden sm:inline-flex min-h-[38px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-amber-300 font-bold text-[11px] items-center gap-1 cursor-pointer"
              title="Go ad-free with VIP"
            >
              <Crown className="w-3.5 h-3.5 shrink-0" />
              <span>Go ad-free</span>
            </button>
          )}

          <a
            href={backendAdUrl}
            target="_blank"
            rel="sponsored nofollow noopener"
            data-ad-link="true"
            onClick={handleAdClick}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg btn-premium-primary text-white font-bold text-[11px] flex items-center gap-1.5 transition-all active:scale-95 shadow-sm cursor-pointer"
          >
            <span className="hidden sm:inline">Open</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-ad-slot={placement}
      data-sponsored="true"
      className={`ad-slot ad-banner-slot w-full premium-card rounded-xl p-4 sm:p-5 relative overflow-hidden ${
        activeZone.imageUrl ? 'border-amber-400/60 bg-gradient-to-r from-[#0E1019] via-[#141220] to-[#0E1019]' : ''
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <a
          href={backendAdUrl}
          target="_blank"
          rel="sponsored nofollow noopener"
          data-ad-link="true"
          onClick={handleAdClick}
          className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1 cursor-pointer group"
        >
          {activeZone.imageUrl ? (
            <div className="w-20 h-14 sm:w-28 sm:h-16 rounded-lg overflow-hidden border border-amber-400/60 shrink-0 group-hover:scale-105 transition-transform shadow-lg relative">
              <img
                src={activeZone.imageUrl}
                alt={activeZone.label}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/25 via-emerald-500/15 to-rose-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform shadow-inner">
              <Zap className="w-5 h-5 shrink-0" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#C9D1E0]">
              <span className="ad-label text-amber-400 font-bold uppercase tracking-wider">
                Sponsored
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>{activeZone.badge}</span>
              </span>
            </div>

            <h4 className="font-display text-sm sm:text-base font-extrabold text-white group-hover:text-amber-300 truncate transition-colors">
              {activeZone.label}
            </h4>

            <p className="text-xs text-[#C9D1E0] truncate font-medium">
              {activeZone.subtitle}
            </p>
          </div>
        </a>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <a
            href={backendAdUrl}
            target="_blank"
            rel="sponsored nofollow noopener"
            data-ad-link="true"
            onClick={handleRewardClick}
            className="flex-1 sm:flex-initial min-h-[42px] justify-center px-4 py-2.5 rounded-lg btn-premium-gold text-white font-extrabold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <Gift className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>Visit Sponsor</span>
          </a>

          <a
            href={backendAdUrl}
            target="_blank"
            rel="sponsored nofollow noopener"
            data-ad-link="true"
            onClick={handleAdClick}
            className="flex-1 sm:flex-initial min-h-[42px] justify-center px-4 py-2.5 rounded-lg btn-premium-primary font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <span>{activeZone.ctaText}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>

          {onOpenVipModal && (
            <button
              type="button"
              onClick={onOpenVipModal}
              className="mrs-free-upsell min-h-[42px] px-3.5 py-2.5 rounded-lg btn-premium-glass text-xs font-bold flex items-center gap-1.5 cursor-pointer text-amber-300 hover:text-white"
              title="Go ad-free with VIP"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Go ad-free with VIP</span>
            </button>
          )}

          <button
            type="button"
            aria-label="Hide sponsor banner"
            onClick={() => setIsDismissed(true)}
            className="w-11 h-11 flex items-center justify-center rounded-lg btn-premium-glass text-[#C9D1E0] hover:text-white cursor-pointer shrink-0"
            title="Hide sponsor banner"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
