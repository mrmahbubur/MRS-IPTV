import React, { useState, useEffect } from 'react';
import { Crown, Zap, X, ShieldCheck, Tv2, ArrowRight, ExternalLink } from 'lucide-react';
import {
  AdZoneConfig,
  getRandomAdZone,
  recordAdEvent,
  markInterstitialAdShown,
} from '../lib/adSystem';
import { AdFreeState } from '../types';
import { useAdGate } from '../lib/useAdGate';
import { WatchAdVipButton } from './WatchAdVipButton';

interface ModernAdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeClick: () => void;
  adFreeState?: AdFreeState;
  onStartRewardedWatch?: () => void;
  onRewardedGranted?: (state: AdFreeState) => void;
}

export const ModernAdModal: React.FC<ModernAdModalProps> = ({
  isOpen,
  onClose,
  onUpgradeClick,
  adFreeState,
  onRewardedGranted,
}) => {
  const { isFreeMode, isVipLocked, adConfig } = useAdGate();
  const hasRegularNetworkInterstitials = Boolean(adConfig.monetag?.showRegularAds);
  const isPlayerBusy =
    typeof document !== 'undefined' &&
    document.documentElement?.getAttribute('data-mrs-player-active') === '1';
  const canShow =
    isOpen &&
    isFreeMode &&
    !isVipLocked &&
    !isPlayerBusy &&
    !adConfig.testMode &&
    adConfig.formats.interstitial &&
    hasRegularNetworkInterstitials;

  const [secondsLeft, setSecondsLeft] = useState<number>(5);
  const [activeZone, setActiveZone] = useState<AdZoneConfig>(() => getRandomAdZone());

  useEffect(() => {
    if (!canShow) {
      setSecondsLeft(5);
      return;
    }

    const nextZone = getRandomAdZone();
    setActiveZone(nextZone);
    markInterstitialAdShown();
    recordAdEvent('impression', nextZone, 'five-min-vip-modal');
    setSecondsLeft(5);

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [canShow]);

  if (!canShow) return null;

  const progressPercent = ((5 - secondsLeft) / 5) * 100;
  const offerHref = activeZone.url;

  return (
    <div className="ad-slot fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl select-none">
      <div className="relative w-full max-w-lg bg-[#0E1019] border border-amber-400/50 rounded-2xl p-6 sm:p-7 shadow-2xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#07080D]">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-rose-500 transition-all duration-1000 ease-linear"
            style={{ width: `${100 - progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between mb-5">
          <div className="ad-label text-xs font-bold text-amber-400 uppercase tracking-wide tabular-nums">
            Monetag Ad · {activeZone.badge} · {secondsLeft > 0 ? `${secondsLeft}s` : 'Ready'}
          </div>

          <button
            type="button"
            aria-label="Dismiss ad modal"
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-lg btn-premium-glass text-[#C9D1E0] hover:text-white transition-all active:scale-95 cursor-pointer shrink-0"
            title="Dismiss"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        </div>

        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-400/50 shadow-lg">
            <Crown className="w-9 h-9 text-amber-400" />
          </div>
        </div>

        <div className="text-center space-y-2 mb-5">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            {activeZone.label}
          </h2>
          <p className="text-xs sm:text-sm text-[#C9D1E0] leading-relaxed">
            Upgrade to VIP to remove all ads permanently, or watch an official rewarded ad for 1 hour free.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="p-3 rounded-xl premium-card text-center flex flex-col items-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400 mb-1 shrink-0" />
            <span className="text-xs font-bold text-white">Zero Ads</span>
            <span className="text-[10px] text-[#C9D1E0]">With VIP Pass</span>
          </div>
          <div className="p-3 rounded-xl premium-card text-center flex flex-col items-center">
            <Zap className="w-5 h-5 text-amber-400 mb-1 shrink-0" />
            <span className="text-xs font-bold text-white">Fast Proxy</span>
            <span className="text-[10px] text-[#C9D1E0]">Low-Latency</span>
          </div>
          <div className="p-3 rounded-xl premium-card text-center flex flex-col items-center">
            <Tv2 className="w-5 h-5 text-rose-400 mb-1 shrink-0" />
            <span className="text-xs font-bold text-white">Live HD TV</span>
            <span className="text-[10px] text-[#C9D1E0]">Sports &amp; News</span>
          </div>
        </div>

        <div className="space-y-2.5">
          <WatchAdVipButton
            variant="hero"
            className="w-full"
            adFreeState={adFreeState}
            onRewardedGranted={onRewardedGranted}
            onAfterClick={onClose}
          />

          <a
            href={offerHref}
            target="_blank"
            rel="nofollow noopener noreferrer"
            data-ad-link="true"
            onClick={() => recordAdEvent('click', activeZone, 'five-min-vip-modal')}
            className="w-full min-h-[44px] py-3 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{activeZone.ctaText}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>

          <button
            type="button"
            onClick={() => {
              onClose();
              onUpgradeClick();
            }}
            className="mrs-free-upsell w-full min-h-[44px] py-3 px-5 rounded-xl btn-premium-primary text-white font-bold text-xs sm:text-sm tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Crown className="w-4 h-4 text-amber-200 shrink-0" />
            <span>GO AD-FREE WITH VIP PASS</span>
            <ArrowRight className="w-4 h-4 text-white shrink-0" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="block w-full min-h-[38px] py-2 rounded-lg text-xs font-semibold text-[#C9D1E0] hover:text-white transition-colors text-center cursor-pointer tabular-nums"
          >
            {secondsLeft > 0 ? `Close (${secondsLeft}s)` : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
};
