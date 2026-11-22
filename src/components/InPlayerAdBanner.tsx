import React, { useState, useEffect } from 'react';
import { ExternalLink, X, Zap, Gift } from 'lucide-react';
import {
  AdZoneConfig,
  getRandomAdZone,
  getBackendAdRedirectUrl,
  grantRewardedAdFreeTime,
  recordAdEvent
} from '../lib/adSystem';
import { AdFreeState } from '../types';
import { useRemoteConfig } from '../hooks/useRemoteConfig';

interface InPlayerAdBannerProps {
  isBuffering: boolean;
  isPlaying: boolean;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
}

export const InPlayerAdBanner: React.FC<InPlayerAdBannerProps> = ({
  isBuffering,
  isPlaying,
  adFreeState,
  onRewardedGranted
}) => {
  const remoteConfig = useRemoteConfig();
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [clicked, setClicked] = useState<boolean>(false);
  const [activeZone, setActiveZone] = useState<AdZoneConfig>(() => getRandomAdZone());
  const backendAdUrl = getBackendAdRedirectUrl('in-player-banner-reward', activeZone.zoneId);

  useEffect(() => {
    const handleGlobalRotation = (e: Event) => {
      const customEvt = e as CustomEvent<{ currentZone?: AdZoneConfig; nextZone?: AdZoneConfig }>;
      if (customEvt.detail?.nextZone) {
        setActiveZone(customEvt.detail.nextZone);
      } else {
        setActiveZone(getRandomAdZone());
      }
    };
    window.addEventListener('mrs_ad_zone_rotated', handleGlobalRotation);
    return () => window.removeEventListener('mrs_ad_zone_rotated', handleGlobalRotation);
  }, []);

  if (!remoteConfig.adsConfig.enabled || !remoteConfig.adsConfig.inPlayerBannerEnabled || adFreeState?.isActive || isDismissed) {
    return null;
  }

  const shouldShow = isBuffering || !isPlaying;
  if (!shouldShow) {
    return null;
  }

  const handleVisitSponsor = (_e: React.MouseEvent<HTMLAnchorElement>) => {
    recordAdEvent('click', activeZone, 'in-player-banner-reward');
    // Single click: browser natively opens backend redirect in new tab
    const newState = grantRewardedAdFreeTime(remoteConfig.adsConfig.rewardHours || 1);
    setClicked(true);
    if (onRewardedGranted) {
      onRewardedGranted(newState);
    }
    setTimeout(() => {
      setIsDismissed(true);
    }, 1500);
  };

  return (
    <div 
      id="in-player-sponsor-banner"
      className="absolute bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-40 w-[92%] sm:w-auto max-w-md animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-[#0E1019]/96 border border-amber-400/50 hover:border-amber-400 rounded-xl p-3.5 shadow-2xl shadow-black/95 backdrop-blur-xl flex items-center justify-between gap-3 text-white transition-all">
        {/* Left Info */}
        <div className="flex items-center gap-2.5 min-w-0">
          {activeZone.imageUrl ? (
            <div className="w-11 h-10 rounded-lg overflow-hidden border border-amber-400/50 shrink-0 relative">
              <img
                src={activeZone.imageUrl}
                alt={activeZone.label}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-0 right-0 bg-black/85 text-[8px] font-black text-amber-300 px-1 rounded-tl">24/7</span>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-400/45 text-amber-400 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 fill-current text-amber-400 shrink-0" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                Featured Sponsor
              </span>
              <span className="text-[#C9D1E0]/50">·</span>
              <span className="text-xs font-bold text-white truncate">
                {activeZone.label}
              </span>
            </div>
            <p className="text-[10px] text-[#C9D1E0] truncate mt-0.5 flex items-center gap-1">
              <Gift className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Tap to get <strong className="text-emerald-400">1-Hour Free VIP</strong></span>
            </p>
          </div>
        </div>

        {/* Right CTA and Dismiss */}
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            id="btn-banner-visit-sponsor"
            href={backendAdUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-ad-link="true"
            onClick={handleVisitSponsor}
            className={`min-h-[38px] px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
              clicked 
                ? 'btn-premium-emerald text-white' 
                : 'btn-premium-gold text-white active:scale-95'
            }`}
          >
            {clicked ? (
              <span>1h VIP Active!</span>
            ) : (
              <>
                <span>Unlock VIP</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </>
            )}
          </a>

          <button
            type="button"
            aria-label="Dismiss ad"
            onClick={(e) => {
              e.stopPropagation();
              setIsDismissed(true);
            }}
            className="w-9 h-9 rounded-lg btn-premium-glass text-[#C9D1E0] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Dismiss ad"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
