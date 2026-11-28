import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, Clock } from 'lucide-react';
import { useRealtimeVipCountdown } from '../lib/adSystem';
import { AdFreeState } from '../types';
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
  onAfterClick,
  className = '',
}) => {
  const { isFreeMode, isVipLocked, adConfig } = useAdGate();
  const vipCountdown = useRealtimeVipCountdown(adFreeState);
  const [isWatching, setIsWatching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownMins, setCooldownMins] = useState<number>(0);

  useEffect(() => {
    const syncCooldown = () => {
      try {
        const rewardApi = (window as any).MRS_REWARD_ADS;
        if (rewardApi && typeof rewardApi.getCooldownRemainingMinutes === 'function') {
          setCooldownMins(rewardApi.getCooldownRemainingMinutes());
        }
      } catch {}
    };
    syncCooldown();
    const id = setInterval(syncCooldown, 15000);
    return () => clearInterval(id);
  }, []);

  const isRewardAvailable = Boolean(
    adConfig.monetag?.rewardedEnabled || adConfig.rewards?.anyRewardedAvailable
  );

  // Never show while VIP or active reward1h is active, on player/modal-banner, or when no rewarded format is enabled
  if (
    !isFreeMode ||
    isVipLocked ||
    vipCountdown.isActive ||
    Boolean(adFreeState?.isActive) ||
    !isRewardAvailable ||
    variant === 'modal-banner' ||
    variant === 'player'
  ) {
    return null;
  }

  const handleStartReward = async () => {
    if (isWatching) return;
    setErrorMsg(null);
    const rewardApi = (window as any).MRS_REWARD_ADS;
    if (!rewardApi || typeof rewardApi.startAndWatch !== 'function') {
      setErrorMsg('Rewarded player is unavailable right now.');
      return;
    }

    setIsWatching(true);
    try {
      await rewardApi.startAndWatch();
      if (onAfterClick) onAfterClick();
    } catch (err: any) {
      const msg = err?.message || 'Rewarded ad could not be completed.';
      setErrorMsg(msg);
      try {
        if (typeof rewardApi.getCooldownRemainingMinutes === 'function') {
          setCooldownMins(rewardApi.getCooldownRemainingMinutes());
        }
      } catch {}
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsWatching(false);
    }
  };

  const fullHonestLabel = 'Watch a short ad to unlock 1 hour of VIP (free)';

  if (variant === 'sidebar') {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={handleStartReward}
          disabled={isWatching}
          id="sidebar-watch-ad-vip-btn"
          title={fullHonestLabel}
          aria-label={fullHonestLabel}
          className={`mrs-free-upsell w-full min-h-[52px] relative overflow-hidden sidebar-square-btn rounded-xl p-3 text-left transition-all motion-reduce:transition-none group shadow-lg cursor-pointer block border-amber-400/40 hover:border-amber-400 disabled:opacity-60 ${className}`}
        >
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-400/40 shrink-0">
                {isWatching ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <WatchAdVipIcon className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-extrabold text-white block leading-snug">
                  {isWatching ? 'Watching rewarded ad...' : fullHonestLabel}
                </span>
                {cooldownMins > 0 && (
                  <span className="text-[11px] text-amber-300 font-semibold flex items-center gap-1 mt-0.5 tabular-nums">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>Available in {cooldownMins} min</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
        {errorMsg && (
          <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-lg px-2.5 py-1.5">
            {errorMsg}
          </p>
        )}
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div className="inline-flex flex-col items-start gap-1.5">
        <button
          type="button"
          onClick={handleStartReward}
          disabled={isWatching}
          title={fullHonestLabel}
          aria-label={fullHonestLabel}
          className={`mrs-free-upsell min-h-[44px] px-4 py-2.5 rounded-lg btn-square btn-premium-gold font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-60 ${className}`}
        >
          {isWatching ? (
            <Loader2 className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
          ) : (
            <WatchAdVipIcon className="w-4 h-4 text-amber-300 shrink-0" />
          )}
          <span>
            {isWatching
              ? 'Watching ad...'
              : cooldownMins > 0
                ? `Free 1h VIP (in ${cooldownMins} min)`
                : fullHonestLabel}
          </span>
        </button>
        {errorMsg && (
          <span className="text-[11px] text-amber-300 font-medium">{errorMsg}</span>
        )}
      </div>
    );
  }

  if (variant === 'mobile-bar') {
    return (
      <button
        type="button"
        onClick={handleStartReward}
        disabled={isWatching}
        id="mobile-watch-ad-vip-btn"
        title={fullHonestLabel}
        aria-label={fullHonestLabel}
        className={`mrs-free-upsell w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer shadow-md btn-premium-gold disabled:opacity-60 ${className}`}
      >
        {isWatching ? (
          <Loader2 className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
        ) : (
          <WatchAdVipIcon className="w-4 h-4 shrink-0 text-amber-300" />
        )}
        <div className="flex flex-col text-left leading-tight truncate">
          <span className="text-[11px] font-extrabold text-white truncate">
            {isWatching ? 'Watching ad...' : 'Get 1 hour VIP free'}
          </span>
          <span className="text-[9px] text-amber-200 font-mono tabular-nums truncate">
            {cooldownMins > 0 ? `Wait ${cooldownMins} min` : 'Watch a short ad'}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleStartReward}
        disabled={isWatching}
        id="header-watch-ad-vip-btn"
        title={fullHonestLabel}
        aria-label={fullHonestLabel}
        className={`mrs-free-upsell inline-flex items-center justify-center gap-1.5 px-3.5 h-10 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap btn-square btn-premium-gold group disabled:opacity-60 ${className}`}
      >
        {isWatching ? (
          <Loader2 className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
        )}
        <span className="text-white tracking-tight tabular-nums">
          {isWatching
            ? 'Watching...'
            : cooldownMins > 0
              ? `1h VIP (${cooldownMins}m)`
              : 'Get 1h VIP free'}
        </span>
      </button>
      {errorMsg && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-lg bg-[#0E131F] border border-amber-400/50 px-3 py-2 text-[11px] text-amber-200 shadow-xl">
          {errorMsg}
        </div>
      )}
    </div>
  );
};
