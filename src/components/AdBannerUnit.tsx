import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ExternalLink, Crown, X, Tag } from 'lucide-react';
import {
  AdZoneConfig,
  STORED_AD_ZONES,
  recordAdEvent,
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

interface ResolvedBannerItem {
  id: string;
  title: string;
  network: string;
  subtitle: string;
  ctaText: string;
  href: string;
  zoneObj: AdZoneConfig;
}

export const AdBannerUnit: React.FC<AdBannerUnitProps> = ({
  placement,
  adFreeState,
  onOpenVipModal,
  compact = false,
  refreshTrigger,
}) => {
  const remoteConfig = useRemoteConfig();
  const { isFreeMode, isVipLocked, adConfig } = useAdGate();

  const isVip = isVipLocked || Boolean(adFreeState?.isActive);
  const canRenderAds =
    isFreeMode &&
    !isVip &&
    adConfig.formats.banner &&
    Boolean(adConfig.monetag?.showRegularAds) &&
    remoteConfig.adsConfig.enabled &&
    placement !== 'player-overlay' &&
    placement !== 'player-below';

  const items: ResolvedBannerItem[] = useMemo(() => {
    if (!adConfig.monetag?.showRegularAds) return [];
    return STORED_AD_ZONES.map((z) => ({
      id: z.zoneId,
      title: z.label,
      network: z.network,
      subtitle: z.subtitle,
      ctaText: z.ctaText,
      href: z.url,
      zoneObj: z,
    }));
  }, [adConfig.monetag?.showRegularAds]);

  const [itemIndex, setItemIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isInViewport, setIsInViewport] = useState(false);
  const verifiedKeyRef = useRef<string>('');

  const activeItem = items.length > 0 ? items[itemIndex % items.length] : null;

  useEffect(() => {
    if (!canRenderAds || refreshTrigger === undefined || items.length === 0) return;
    setItemIndex((prev) => (prev + 1) % items.length);
    setIsDismissed(false);
  }, [refreshTrigger, canRenderAds, items.length]);

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
    if (!canRenderAds || isDismissed || !isInViewport || !activeItem) return;
    const key = `${activeItem.id}-${placement}-${refreshTrigger || 0}`;
    if (verifiedKeyRef.current === key) return;

    const viewTimer = setTimeout(() => {
      if (verifiedKeyRef.current !== key) {
        verifiedKeyRef.current = key;
        recordAdEvent('impression', activeItem.zoneObj, placement);
      }
    }, 1000);

    return () => clearTimeout(viewTimer);
  }, [activeItem, placement, isInViewport, canRenderAds, isDismissed, refreshTrigger]);

  // Collapse empty/blocked ad container cleanly after 4s
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

  if (!canRenderAds || isDismissed || !activeItem) return null;

  // Reserved CLS-free size box: Desktop 728x90, Mobile 320x50
  const reservedSizeClasses = compact
    ? 'w-[320px] max-w-full h-[50px]'
    : 'w-[320px] h-[50px] md:w-[728px] md:h-[90px] max-w-full';

  if (adConfig.testMode) {
    return (
      <div
        ref={containerRef}
        data-ad-slot={placement}
        data-dynamic-slot="1"
        className={`ad-slot ad-banner-slot ${reservedSizeClasses} mx-auto rounded-xl border border-dashed border-amber-400/60 bg-amber-500/10 px-3 md:px-4 flex items-center justify-between gap-2 text-xs text-amber-200 overflow-hidden`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="ad-label px-1.5 py-0.5 rounded bg-amber-400 text-[#050816] font-mono font-black text-[10px] uppercase shrink-0">
            <span className="md:hidden">[TEST 320x50]</span>
            <span className="hidden md:inline">[TEST 728x90]</span>
          </span>
          <span className="truncate font-semibold">
            Monetag · {activeItem.title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenVipModal && (
            <button
              type="button"
              onClick={onOpenVipModal}
              className="mrs-free-upsell shrink-0 text-[11px] font-bold text-amber-300 hover:text-white underline cursor-pointer whitespace-nowrap"
            >
              Go VIP
            </button>
          )}
          <button
            type="button"
            aria-label="Close ad"
            onClick={() => setIsDismissed(true)}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 text-amber-200 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const handleAdClick = () => {
    recordAdEvent('click', activeItem.zoneObj, placement);
  };

  return (
    <div
      ref={containerRef}
      data-ad-slot={placement}
      data-dynamic-slot="1"
      className={`ad-slot ad-banner-slot ${reservedSizeClasses} mx-auto premium-card rounded-xl px-3 md:px-5 flex items-center justify-between gap-2.5 md:gap-4 overflow-hidden border border-amber-400/40 bg-[#0E131F]`}
    >
      <a
        href={activeItem.href}
        target="_blank"
        rel="nofollow noopener noreferrer"
        data-ad-link="true"
        onClick={handleAdClick}
        className="flex items-center gap-2.5 md:gap-3.5 min-w-0 flex-1 cursor-pointer group"
      >
        <div className="w-8 h-8 md:w-11 md:h-11 rounded-lg bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
          <Tag className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] md:text-[11px] text-[#C9D1E0] truncate">
            <span className="ad-label font-mono uppercase tracking-wider text-amber-400 font-bold shrink-0">
              Ad · Monetag
            </span>
            <span className="hidden md:inline text-white/40" aria-hidden="true">·</span>
            <span className="hidden md:inline truncate text-emerald-400 font-semibold">
              {activeItem.network}
            </span>
          </div>
          <p className="text-xs md:text-sm font-extrabold text-white group-hover:text-amber-300 truncate transition-colors">
            {activeItem.title}
          </p>
        </div>
      </a>

      <div className="flex items-center gap-1.5 md:gap-2.5 shrink-0">
        {onOpenVipModal && (
          <button
            type="button"
            onClick={onOpenVipModal}
            className="mrs-free-upsell hidden md:inline-flex h-9 px-3 rounded-lg btn-premium-glass text-xs font-bold items-center gap-1.5 cursor-pointer text-amber-300 hover:text-white whitespace-nowrap"
            title="Go ad-free with VIP"
          >
            <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Go VIP</span>
          </button>
        )}

        <a
          href={activeItem.href}
          target="_blank"
          rel="nofollow noopener noreferrer"
          data-ad-link="true"
          onClick={handleAdClick}
          className="h-8 md:h-9 px-2.5 md:px-4 rounded-lg btn-premium-primary text-white font-bold text-[11px] md:text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>{activeItem.ctaText}</span>
          <ExternalLink className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
        </a>

        <button
          type="button"
          aria-label="Hide ad banner"
          onClick={() => setIsDismissed(true)}
          className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-lg text-[#C9D1E0] hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          title="Hide ad"
        >
          <X className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>
    </div>
  );
};
