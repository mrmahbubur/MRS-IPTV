import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Play, Tv, X, Clock, ArrowRight, Zap, ShieldCheck } from 'lucide-react';
import {
  AdZoneConfig,
  getNextAdZone,
  recordAdEvent,
  markInterstitialAdShown,
} from '../lib/adSystem';
import { AdFreeState } from '../types';
import { useRemoteConfig } from '../hooks/useRemoteConfig';
import { useAdGate } from '../lib/useAdGate';
import { WatchAdVipButton } from './WatchAdVipButton';

interface RewardedAdInterstitialProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  adFreeState?: AdFreeState;
  onRewardedGranted?: (state: AdFreeState) => void;
  title?: string;
  dwellSeconds?: number;
  channelName?: string;
}

export const RewardedAdInterstitial: React.FC<RewardedAdInterstitialProps> = ({
  isOpen,
  onClose,
  onProceed,
  adFreeState,
  onRewardedGranted,
  title = 'Monetag Stream Gateway',
  dwellSeconds: customDwell,
  channelName,
}) => {
  const remoteConfig = useRemoteConfig();
  const { isFreeMode, isVipLocked, adConfig } = useAdGate();
  const hasRegularNetworkInterstitials = Boolean(adConfig.monetag?.showRegularAds);
  const canShow =
    isOpen &&
    isFreeMode &&
    !isVipLocked &&
    !adConfig.testMode &&
    adConfig.formats.interstitial &&
    remoteConfig.adsConfig.enabled &&
    hasRegularNetworkInterstitials;

  const configuredDwell = customDwell || remoteConfig.adsConfig.dwellTimerSeconds || 5;

  const [activeZone, setActiveZone] = useState<AdZoneConfig>(() => getNextAdZone());
  const [countdown, setCountdown] = useState<number>(configuredDwell);
  const [canSkip, setCanSkip] = useState<boolean>(false);
  const verifiedRef = useRef<boolean>(false);
  const offerHref = activeZone.url;

  useEffect(() => {
    if (!canShow) {
      setCountdown(configuredDwell);
      setCanSkip(false);
      verifiedRef.current = false;
      return;
    }

    const nextZone = getNextAdZone();
    setActiveZone(nextZone);
    setCountdown(configuredDwell);
    setCanSkip(false);
    verifiedRef.current = false;
    markInterstitialAdShown();

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [canShow, configuredDwell]);

  useEffect(() => {
    if (!canShow || verifiedRef.current) return;
    const verifyTimer = setTimeout(() => {
      if (!verifiedRef.current) {
        verifiedRef.current = true;
        recordAdEvent('impression', activeZone, 'interstitial-preroll');
      }
    }, 800);
    return () => clearTimeout(verifyTimer);
  }, [canShow, activeZone]);

  if (!canShow) return null;

  const progressPct = ((configuredDwell - countdown) / configuredDwell) * 100;

  const handleSkipAndWatch = () => {
    onProceed();
    onClose();
  };

  return (
    <div className="ad-slot fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-md bg-[#0E1019] border border-amber-400/50 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col overflow-hidden text-center">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#07080D]">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-rose-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>

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
              className="w-11 h-11 flex items-center justify-center rounded-lg btn-premium-glass text-[#C9D1E0] hover:text-white transition-all cursor-pointer shrink-0"
              title="Skip Ad & Watch Stream"
            >
              <X className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <span className="ad-label text-xs font-mono text-amber-400 font-bold tabular-nums">
              Ad · {countdown}s
            </span>
          )}
        </div>

        <div className="py-4 space-y-3.5 relative z-10">
          <div>
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              {activeZone.badge}
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight mt-1">
              {title}
            </h3>
            <p className="text-xs text-[#C9D1E0] max-w-xs mx-auto mt-0.5 leading-relaxed">
              {activeZone.subtitle}
            </p>
          </div>

          <a
            href={offerHref}
            target="_blank"
            rel="nofollow noopener noreferrer"
            data-ad-link="true"
            onClick={() => recordAdEvent('click', activeZone, 'interstitial-gateway')}
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
                    <span>Ad · Monetag</span>
                  </div>
                  <h4 className="text-sm font-black text-white group-hover:text-amber-300 truncate mt-0.5">
                    {activeZone.label}
                  </h4>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-amber-400 shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </a>

          <WatchAdVipButton
            variant="hero"
            className="w-full"
            adFreeState={adFreeState}
            onRewardedGranted={onRewardedGranted}
            onAfterClick={handleSkipAndWatch}
          />
        </div>

        <div className="space-y-2 relative z-10 pt-2 border-t border-white/10">
          {canSkip ? (
            <button
              type="button"
              onClick={handleSkipAndWatch}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl btn-premium-primary text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current text-white shrink-0" />
              <span>Continue to Channel</span>
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
