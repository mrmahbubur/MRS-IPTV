import React, { useState, useEffect } from 'react';
import { ExternalLink, CheckCircle2 } from 'lucide-react';
import {
  AdZoneConfig,
  getNextAdZone,
  getRandomAdZone,
  getBackendAdRedirectUrl,
  grantRewardedAdFreeTime,
  recordAdEvent,
  useRealtimeVipCountdown
} from '../lib/adSystem';
import { AdFreeState } from '../types';
import { useRemoteConfig } from '../hooks/useRemoteConfig';
import { useAdGate } from '../lib/useAdGate';

export const WatchAdVipIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect
      x="2.25"
      y="3.75"
      width="19.5"
      height="13.5"
      rx="2.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M8 8.25L12.75 10.75L8 13.25V8.25Z" fill="currentColor" />
    <path
      d="M15.75 7.25L16.55 8.95L18.35 9.25L17.05 10.5L17.35 12.25L15.75 11.4L14.15 12.25L14.45 10.5L13.15 9.25L14.95 8.95L15.75 7.25Z"
      fill="#FBBF24"
    />
    <path d="M7.5 20.5H16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

interface WatchAdVipButtonProps {
  variant?: 'header' | 'sidebar' | 'hero' | 'player' | 'modal-banner' | 'mobile-bar';
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  onAfterClick?: () => void;
  className?: string;
}

export const WatchAdVipButton: React.FC<WatchAdVipButtonProps> = ({
  variant = 'header',
  adFreeState,
  onRewardedGranted,
  onAfterClick,
  className = ''
}) => {
  const remoteConfig = useRemoteConfig();
  const { isFreeMode, adConfig } = useAdGate();
  const [adZone, setAdZone] = useState<AdZoneConfig>(() => getNextAdZone());
  const [justClaimed, setJustClaimed] = useState(false);
  const vipCountdown = useRealtimeVipCountdown(adFreeState);
  const backendAdUrl = getBackendAdRedirectUrl(`watch-ad-vip-${variant}`, adZone.zoneId);

  useEffect(() => {
    const handleRotation = (e: Event) => {
      const evt = e as CustomEvent<{ currentZone?: AdZoneConfig; nextZone?: AdZoneConfig }>;
      if (evt.detail?.nextZone) {
        setAdZone(evt.detail.nextZone);
      } else {
        setAdZone(getNextAdZone());
      }
    };
    window.addEventListener('mrs_ad_zone_rotated', handleRotation);
    return () => window.removeEventListener('mrs_ad_zone_rotated', handleRotation);
  }, []);

  // Strictly suppress for VIP/pending, checkout modal banner, and disabled banner format
  if (!isFreeMode || !remoteConfig.adsConfig.enabled || !adConfig.formats.banner || variant === 'modal-banner') {
    return null;
  }

  const handleClick = () => {
    recordAdEvent('click', adZone, `watch-ad-vip-${variant}`);
    setAdZone(getRandomAdZone());
    const rewardHours = remoteConfig.adsConfig.rewardHours || 1;
    const newState = grantRewardedAdFreeTime(rewardHours);
    setJustClaimed(true);
    setTimeout(() => setJustClaimed(false), 4000);
    if (onRewardedGranted) {
      onRewardedGranted(newState);
    }
    if (onAfterClick) {
      onAfterClick();
    }
  };

  if (variant === 'sidebar') {
    return (
      <a
        href={backendAdUrl}
        target="_blank"
        rel="sponsored nofollow noopener"
        data-ad-link="true"
        data-sponsored="true"
        onClick={handleClick}
        id="sidebar-watch-ad-vip-btn"
        title="Visit Sponsor Offer"
        className={`ad-slot w-full min-h-[52px] relative overflow-hidden sidebar-square-btn rounded-xl p-3 text-left transition-all motion-reduce:transition-none group shadow-lg cursor-pointer block border-amber-400/40 hover:border-amber-400 ${className}`}
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-400/40 shrink-0 group-hover:scale-105 motion-reduce:group-hover:scale-100 transition-transform">
              {justClaimed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <WatchAdVipIcon className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-white truncate">
                  {justClaimed ? 'Bonus Activated!' : 'Sponsored · Support TV'}
                </span>
              </div>
              <span className="text-[11px] text-amber-400 font-semibold block truncate mt-0.5 tabular-nums">
                {vipCountdown.isActive && vipCountdown.isTemporary
                  ? `Bonus (${vipCountdown.formattedClock})`
                  : 'Featured Partner Offer'}
              </span>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
        </div>
      </a>
    );
  }

  if (variant === 'hero') {
    return (
      <a
        href={backendAdUrl}
        target="_blank"
        rel="sponsored nofollow noopener"
        data-ad-link="true"
        data-sponsored="true"
        onClick={handleClick}
        title="Visit Featured Sponsor"
        className={`ad-slot min-h-[44px] px-4 py-2.5 rounded-lg btn-square btn-premium-gold font-extrabold text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 whitespace-nowrap ${className}`}
      >
        {justClaimed ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <WatchAdVipIcon className="w-4 h-4 text-amber-400 shrink-0" />
        )}
        <span>{justClaimed ? 'Bonus Active!' : 'Sponsor Offer'}</span>
        <ExternalLink className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      </a>
    );
  }

  if (variant === 'player') {
    return null; // Player controls remain 100% free of ad triggers
  }

  if (variant === 'mobile-bar') {
    return (
      <a
        href={backendAdUrl}
        target="_blank"
        rel="sponsored nofollow noopener"
        data-ad-link="true"
        data-sponsored="true"
        onClick={handleClick}
        id="mobile-watch-ad-vip-btn"
        title="Visit Featured Sponsor"
        className={`ad-slot w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer shadow-md btn-premium-gold ${className}`}
      >
        {justClaimed ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <WatchAdVipIcon className="w-4 h-4 shrink-0 text-amber-400" />
        )}
        <div className="flex flex-col text-left leading-tight truncate">
          <span className="text-[11px] font-extrabold text-white truncate">
            {justClaimed ? 'Bonus Active!' : 'Sponsor Offer'}
          </span>
          <span className="text-[9px] text-amber-300 font-mono tabular-nums truncate">
            Sponsored
          </span>
        </div>
      </a>
    );
  }

  return (
    <a
      href={backendAdUrl}
      target="_blank"
      rel="sponsored nofollow noopener"
      data-ad-link="true"
      data-sponsored="true"
      onClick={handleClick}
      id="header-watch-ad-vip-btn"
      title="Visit Featured Sponsor"
      className={`ad-slot inline-flex items-center justify-center gap-1.5 px-3.5 h-10 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap btn-square btn-premium-gold group ${className}`}
    >
      {justClaimed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      ) : (
        <WatchAdVipIcon className="w-4 h-4 text-amber-400 group-hover:scale-105 motion-reduce:group-hover:scale-100 transition-transform shrink-0" />
      )}
      <span className="text-white tracking-tight tabular-nums">
        {justClaimed ? 'Bonus!' : 'Sponsor'}
      </span>
      <ExternalLink className="hidden xl:inline w-3.5 h-3.5 text-amber-400/90 shrink-0" />
    </a>
  );
};
