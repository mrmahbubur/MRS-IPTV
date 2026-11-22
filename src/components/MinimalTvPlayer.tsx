import React, { useState, useEffect } from 'react';
import { Channel, AdFreeState } from '../types';
import VideoPlayer from './VideoPlayer';
import { getStoredAdFreeState } from '../lib/codes';
import { SkipBack, SkipForward, ArrowLeft, Tv } from 'lucide-react';

interface MinimalTvPlayerProps {
  channels: Channel[];
  onClose: () => void;
  onChannelError?: (channelId: string) => void;
  detectedLocation?: { country: string; region: string | null; regionLabel: string } | null;
  locationSource?: 'network-estimate' | 'unavailable';
}

export const MinimalTvPlayer: React.FC<MinimalTvPlayerProps> = ({
  channels,
  onClose,
  onChannelError,
  detectedLocation = null,
  locationSource = 'unavailable'
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [adFreeState, setAdFreeState] = useState<AdFreeState>(() => getStoredAdFreeState());

  useEffect(() => {
    const syncAdFree = (e: Event) => {
      const evt = e as CustomEvent<AdFreeState>;
      setAdFreeState(evt.detail || getStoredAdFreeState());
    };
    window.addEventListener('shahintv_adfree_updated', syncAdFree);
    return () => window.removeEventListener('shahintv_adfree_updated', syncAdFree);
  }, []);

  const activeChannel = channels[currentIdx] || channels[0];

  const handleNext = () => {
    if (!channels.length) return;
    setCurrentIdx((prev) => (prev + 1) % channels.length);
  };

  const handlePrev = () => {
    if (!channels.length) return;
    setCurrentIdx((prev) => (prev - 1 + channels.length) % channels.length);
  };

  if (!activeChannel) {
    return (
      <div className="w-full h-full bg-[#090A10] flex items-center justify-center text-white">
        <p>No channels available</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-[#090A10] overflow-hidden relative select-none flex flex-col">
      {/* Main Minimal Video Stage */}
      <div className="flex-1 w-full relative overflow-hidden">
        <VideoPlayer
          channel={activeChannel}
          allChannels={channels}
          onSelectChannel={(ch) => {
            const idx = channels.findIndex(c => c.id === ch.id);
            if (idx >= 0) setCurrentIdx(idx);
          }}
          onNext={handleNext}
          onPrev={handlePrev}
          onClose={onClose}
          onChannelError={onChannelError}
          adFreeState={adFreeState}
          onRewardedGranted={(st) => setAdFreeState(st)}
          initialMode="minimal"
          detectedLocation={detectedLocation}
          locationSource={locationSource}
        />
      </div>

      {/* Dedicated Fast-Zap Minimal TV Control Bar — Transparent Responsive Buttons */}
      <div className="h-14 bg-black/40 backdrop-blur-md border-t border-white/15 px-3 sm:px-5 flex items-center justify-between gap-2 shrink-0 z-30">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 h-10 rounded-lg player-ctrl-btn text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
            title="Exit Minimal TV Mode"
            aria-label="Exit Minimal TV Mode"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Exit Minimal</span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 px-3 h-10 rounded-lg player-ctrl-btn">
            <Tv className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-mono text-[11px] font-black text-amber-400 shrink-0 tabular-nums">
              CH {String(currentIdx + 1).padStart(3, '0')}
            </span>
            <span className="text-white/30" aria-hidden="true">·</span>
            <span className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-xs">
              {activeChannel.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrev}
            className="px-3.5 h-10 rounded-lg player-ctrl-btn text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
            title="Fast Zap Previous Channel"
            aria-label="Previous Channel"
          >
            <SkipBack className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Prev CH</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="px-3.5 h-10 rounded-lg player-ctrl-btn-active text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
            title="Fast Zap Next Channel"
            aria-label="Next Channel"
          >
            <span className="hidden sm:inline">Next CH</span>
            <SkipForward className="w-4 h-4 text-amber-300 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MinimalTvPlayer;
