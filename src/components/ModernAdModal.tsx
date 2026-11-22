import React, { useState, useEffect } from 'react';
import { Crown, Zap, X, ShieldCheck, Tv2, ArrowRight, Gift, ExternalLink } from 'lucide-react';
import {
  AdZoneConfig,
  getRandomAdZone,
  recordAdEvent,
  getBackendAdRedirectUrl,
  grantRewardedAdFreeTime,
  markInterstitialAdShown
} from '../lib/adSystem';
import { AdFreeState } from '../types';

interface ModernAdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeClick: () => void;
  onStartRewardedWatch?: () => void;
  onRewardedGranted?: (state: AdFreeState) => void;
}

export const ModernAdModal: React.FC<ModernAdModalProps> = ({
  isOpen,
  onClose,
  onUpgradeClick,
  onRewardedGranted
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(5);
  const [activeZone, setActiveZone] = useState<AdZoneConfig>(() => getRandomAdZone());

  useEffect(() => {
    const handleRotation = (e: Event) => {
      const evt = e as CustomEvent<{ nextZone?: AdZoneConfig }>;
      if (evt.detail?.nextZone) {
        setActiveZone(evt.detail.nextZone);
      } else {
        setActiveZone(getRandomAdZone());
      }
    };
    window.addEventListener('mrs_ad_zone_rotated', handleRotation);
    return () => window.removeEventListener('mrs_ad_zone_rotated', handleRotation);
  }, []);

  useEffect(() => {
    if (!isOpen) {
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
  }, [isOpen]);

  if (!isOpen) return null;

  const progressPercent = ((5 - secondsLeft) / 5) * 100;
  const backendAdUrl = getBackendAdRedirectUrl('five-min-vip-reward', activeZone.zoneId);

  const handleSponsorRewardClick = (_e: React.MouseEvent<HTMLAnchorElement>) => {
    recordAdEvent('click', activeZone, 'five-min-vip-reward');
    // Single click: browser natively opens backend redirect in new tab
    const newState = grantRewardedAdFreeTime(1);
    if (onRewardedGranted) {
      onRewardedGranted(newState);
    }
    setTimeout(() => {
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl select-none">
      <link rel="preconnect" href="https://uplcm.com" />
      <link rel="prefetch" href={backendAdUrl} />

      <div className="relative w-full max-w-lg bg-[#0E1019] border border-amber-400/50 rounded-2xl p-6 sm:p-7 shadow-2xl overflow-hidden">
        {/* Top Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#07080D]">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-rose-500 transition-all duration-1000 ease-linear"
            style={{ width: `${100 - progressPercent}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="text-xs font-bold text-amber-400 uppercase tracking-wide tabular-nums">
            {activeZone.badge} · {secondsLeft > 0 ? `${secondsLeft}s` : 'Ready'}
          </div>

          <button
            type="button"
            aria-label="Dismiss sponsor modal"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg btn-premium-glass text-[#C9D1E0] hover:text-white transition-all active:scale-95 cursor-pointer shrink-0"
            title="Dismiss"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        </div>

        {/* Hero Visual Icon or Smartlink Banner Image */}
        {activeZone.imageUrl ? (
          <div className="w-full h-36 sm:h-44 rounded-xl overflow-hidden border border-amber-400/50 shadow-xl mb-4 relative group">
            <img
              src={activeZone.imageUrl}
              alt={activeZone.label}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0E1019] via-transparent to-transparent" />
            <div className="absolute top-2.5 left-2.5 rounded-md bg-rose-600/95 text-white font-mono font-black text-[10px] px-2 py-0.5 tracking-wider uppercase border border-rose-400/50">
              {activeZone.badge} · 24/7 ACTIVE
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-400/50 shadow-lg">
              <Crown className="w-9 h-9 text-amber-400" />
            </div>
          </div>
        )}

        {/* Primary Text */}
        <div className="text-center space-y-2 mb-5">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            {activeZone.label}
          </h2>
          <p className="text-xs sm:text-sm text-[#C9D1E0] leading-relaxed">
            {activeZone.subtitle} — unlock <strong className="text-white">1 Hour of Free VIP Ad-Free Streaming</strong> now.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="p-3 rounded-xl premium-card text-center flex flex-col items-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400 mb-1 shrink-0" />
            <span className="text-xs font-bold text-white">100% Ad-Free</span>
            <span className="text-[10px] text-[#C9D1E0]">Zero popups</span>
          </div>

          <div className="p-3 rounded-xl premium-card text-center flex flex-col items-center">
            <Zap className="w-5 h-5 text-amber-400 mb-1 shrink-0" />
            <span className="text-xs font-bold text-white">Fast Proxy</span>
            <span className="text-[10px] text-[#C9D1E0]">VLC Low-Latency</span>
          </div>

          <div className="p-3 rounded-xl premium-card text-center flex flex-col items-center">
            <Tv2 className="w-5 h-5 text-rose-400 mb-1 shrink-0" />
            <span className="text-xs font-bold text-white">8,890+ Live</span>
            <span className="text-[10px] text-[#C9D1E0]">HD Sports & TV</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <a
            href={backendAdUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-ad-link="true"
            onClick={handleSponsorRewardClick}
            className="w-full min-h-[46px] py-3.5 px-5 rounded-xl btn-premium-gold text-white font-extrabold text-xs sm:text-sm tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Gift className="w-4 h-4 text-amber-300 shrink-0" />
            <span>{activeZone.ctaText} · 1h Free VIP</span>
            <ExternalLink className="w-4 h-4 shrink-0" />
          </a>

          <button
            type="button"
            onClick={() => {
              onClose();
              onUpgradeClick();
            }}
            className="w-full min-h-[44px] py-3 px-5 rounded-xl btn-premium-primary text-white font-bold text-xs sm:text-sm tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Crown className="w-4 h-4 text-amber-200 shrink-0" />
            <span>BUY PERMANENT VIP PASS</span>
            <ArrowRight className="w-4 h-4 text-white shrink-0" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="block w-full min-h-[38px] py-2 rounded-lg text-xs font-semibold text-[#C9D1E0] hover:text-white transition-colors text-center cursor-pointer tabular-nums"
          >
            {secondsLeft > 0 ? `Continue Watching (${secondsLeft}s)` : 'Dismiss & Continue Watching'}
          </button>
        </div>
      </div>
    </div>
  );
};
