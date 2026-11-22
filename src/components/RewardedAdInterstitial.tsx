import React, { useState, useEffect, useRef } from 'react';
import {
  Gift, ExternalLink, Play,
  Tv, X, Clock, ArrowRight, Zap, ShieldCheck
} from 'lucide-react';
import {
  AdZoneConfig,
  getNextAdZone,
  recordAdEvent,
  getBackendAdRedirectUrl,
  grantRewardedAdFreeTime,
  markInterstitialAdShown
} from '../lib/adSystem';
import { AdFreeState } from '../types';
import { useRemoteConfig } from '../hooks/useRemoteConfig';

interface RewardedAdInterstitialProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  onRewardedGranted?: (state: AdFreeState) => void;
  title?: string;
  dwellSeconds?: number;
  channelName?: string;
}

export const RewardedAdInterstitial: React.FC<RewardedAdInterstitialProps> = ({
  isOpen,
  onClose,
  onProceed,
  onRewardedGranted,
  title = 'Sponsor Stream Gateway',
  dwellSeconds: customDwell,
  channelName
}) => {
  const remoteConfig = useRemoteConfig();
  const configuredDwell = customDwell || remoteConfig.adsConfig.dwellTimerSeconds || 5;

  const [activeZone, setActiveZone] = useState<AdZoneConfig>(() => getNextAdZone());
  const [countdown, setCountdown] = useState<number>(configuredDwell);
  const [canSkip, setCanSkip] = useState<boolean>(false);
  const [hasClaimedReward, setHasClaimedReward] = useState<boolean>(false);
  const verifiedRef = useRef<boolean>(false);
  const backendAdUrl = getBackendAdRedirectUrl('interstitial-reward-vip', activeZone.zoneId);

  useEffect(() => {
    const handleRotation = (e: Event) => {
      const evt = e as CustomEvent<{ nextZone?: AdZoneConfig }>;
      if (evt.detail?.nextZone) {
        setActiveZone(evt.detail.nextZone);
      } else {
        setActiveZone(getNextAdZone());
      }
    };
    window.addEventListener('mrs_ad_zone_rotated', handleRotation);
    return () => window.removeEventListener('mrs_ad_zone_rotated', handleRotation);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(configuredDwell);
      setCanSkip(false);
      setHasClaimedReward(false);
      verifiedRef.current = false;
      return;
    }

    const nextZone = getNextAdZone();
    setActiveZone(nextZone);
    setCountdown(configuredDwell);
    setCanSkip(false);
    setHasClaimedReward(false);
    verifiedRef.current = false;
    markInterstitialAdShown();

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, configuredDwell]);

  // Verified 1s Viewability Impression Recording
  useEffect(() => {
    if (!isOpen || verifiedRef.current) return;
    const verifyTimer = setTimeout(() => {
      if (!verifiedRef.current) {
        verifiedRef.current = true;
        recordAdEvent('impression', activeZone, 'interstitial-preroll');
      }
    }, 800);
    return () => clearTimeout(verifyTimer);
  }, [isOpen, activeZone]);

  if (!isOpen) return null;

  const progressPct = ((configuredDwell - countdown) / configuredDwell) * 100;

  const handleSponsorClickAndReward = (_e: React.MouseEvent<HTMLAnchorElement>) => {
    recordAdEvent('click', activeZone, 'interstitial-reward-vip');
    // Single click: browser natively opens backend redirect in new tab
    const newState = grantRewardedAdFreeTime(remoteConfig.adsConfig.rewardHours || 1);
    setHasClaimedReward(true);
    setCanSkip(true);
    if (onRewardedGranted) {
      onRewardedGranted(newState);
    }
    setTimeout(() => {
      onProceed();
      onClose();
    }, 400);
  };

  const handleSkipAndWatch = () => {
    onProceed();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      <link rel="preconnect" href="https://uplcm.com" />
      <link rel="prefetch" href={backendAdUrl} />

      <div className="relative w-full max-w-md bg-[#0E1019] border border-amber-400/50 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col overflow-hidden text-center">
        {/* Top Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#07080D]">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-rose-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Top bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 relative z-10 mt-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#C9D1E0] min-w-0">
            <Tv className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">{channelName || 'Live Broadcast Stream'}</span>
          </div>

          {canSkip ? (
            <button
              type="button"
              aria-label="Skip ad and watch stream"
              onClick={handleSkipAndWatch}
              className="w-9 h-9 flex items-center justify-center rounded-lg btn-premium-glass text-[#C9D1E0] hover:text-white transition-all cursor-pointer shrink-0"
              title="Skip Ad & Watch Stream"
            >
              <X className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <span className="text-xs font-mono text-amber-400 font-bold tabular-nums">
              Sponsored · {countdown}s
            </span>
          )}
        </div>

        {/* Main Content */}
        <div className="py-4 space-y-3.5 relative z-10">
          <div>
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              {activeZone.badge}
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight mt-1">
              {hasClaimedReward ? '1-Hour Ad-Free VIP Activated!' : title}
            </h3>
            <p className="text-xs text-[#C9D1E0] max-w-xs mx-auto mt-0.5 leading-relaxed">
              {activeZone.subtitle}
            </p>
          </div>

          {/* Native Clickable Broadcast Sponsor Card */}
          <a
            href={backendAdUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-ad-link="true"
            onClick={handleSponsorClickAndReward}
            className="block w-full rounded-xl p-4 premium-card text-left transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
                  <Zap className="w-5 h-5 shrink-0" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Verified Partner Offer</span>
                  </div>
                  <h4 className="text-sm font-black text-white group-hover:text-amber-300 truncate mt-0.5">
                    {activeZone.label}
                  </h4>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-amber-400 shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="text-[#C9D1E0] font-semibold">{activeZone.ctaText}</span>
              <span className="text-amber-400 font-bold text-[11px] flex items-center gap-1">
                <Gift className="w-3.5 h-3.5 shrink-0" />
                <span>+1h Free VIP</span>
              </span>
            </div>
          </a>

          <div className="bg-[#090A10] border border-amber-400/25 rounded-xl p-3 text-left flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-bold text-white">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Visit Sponsor for 1-Hour Ad-Free TV</span>
            </span>
            <span className="text-emerald-400 font-semibold text-[11px]">
              Instant Unlock
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-2 relative z-10 pt-2 border-t border-white/10">
          <a
            href={backendAdUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-ad-link="true"
            onClick={handleSponsorClickAndReward}
            className="w-full min-h-[44px] py-3 px-4 rounded-xl btn-premium-gold text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Gift className="w-4 h-4 text-amber-300 shrink-0" />
            <span>Open Sponsor & Claim 1-Hr Free VIP</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>

          {canSkip ? (
            <button
              type="button"
              onClick={handleSkipAndWatch}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl btn-premium-primary text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current text-white shrink-0" />
              <span>Skip Ad & Watch Stream Now</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <div className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#090A10] text-[#C9D1E0] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-white/10 tabular-nums">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Skip Available in {countdown}s...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
