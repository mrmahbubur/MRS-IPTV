import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Channel, AdFreeState } from '../types';
import VideoPlayer from './VideoPlayer';
import { getStoredAdFreeState } from '../lib/codes';
import { ChannelThumbnail } from './ChannelThumbnail';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, X, Search } from 'lucide-react';
import { AndroidTvVipGate } from './AndroidTvVipGate';
import { isAndroidTvDevice } from '../lib/screenDimensions';

interface SmartTvPlayerProps {
  channels: Channel[];
  onClose: () => void;
  favorites?: string[];
  setFavorites?: (favs: string[]) => void;
  onChannelError?: (channelId: string) => void;
  detectedLocation?: { country: string; region: string | null; regionLabel: string } | null;
  locationSource?: 'network-estimate' | 'unavailable';
}

export const SmartTvPlayer: React.FC<SmartTvPlayerProps> = ({ 
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

  // Android TV On-Screen Display (OSD) Banner
  const [showOsdBanner, setShowOsdBanner] = useState(true);
  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Android TV Quick Channel List Drawer
  const [isTvListOpen, setIsTvListOpen] = useState(false);
  const [tvSearch, setTvSearch] = useState('');
  const [focusedListIdx, setFocusedListIdx] = useState(0);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels[currentIdx] || channels[0];

  const filteredTvChannels = useMemo(() => {
    if (!tvSearch.trim()) return channels;
    const q = tvSearch.trim().toLowerCase();
    return channels.filter(
      ch => ch.name.toLowerCase().includes(q) || (ch.category || '').toLowerCase().includes(q)
    );
  }, [channels, tvSearch]);

  const triggerOsd = useCallback(() => {
    setShowOsdBanner(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => {
      setShowOsdBanner(false);
    }, 4500);
  }, []);

  const handleNext = useCallback(() => {
    if (!channels.length) return;
    setCurrentIdx((prev) => {
      const next = (prev + 1) % channels.length;
      setFocusedListIdx(next);
      return next;
    });
    triggerOsd();
  }, [channels.length, triggerOsd]);

  const handlePrev = useCallback(() => {
    if (!channels.length) return;
    setCurrentIdx((prev) => {
      const next = (prev - 1 + channels.length) % channels.length;
      setFocusedListIdx(next);
      return next;
    });
    triggerOsd();
  }, [channels.length, triggerOsd]);

  useEffect(() => {
    triggerOsd();
    return () => {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    };
  }, [triggerOsd]);

  // Android TV Remote Control Keyboard Navigation
  useEffect(() => {
    const handleTvKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) return;

      if (isTvListOpen) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            e.stopPropagation();
            setFocusedListIdx(prev => {
              const next = (prev - 1 + filteredTvChannels.length) % Math.max(1, filteredTvChannels.length);
              const el = document.getElementById(`tv-ch-item-${next}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              return next;
            });
            break;
          case 'ArrowDown':
            e.preventDefault();
            e.stopPropagation();
            setFocusedListIdx(prev => {
              const next = (prev + 1) % Math.max(1, filteredTvChannels.length);
              const el = document.getElementById(`tv-ch-item-${next}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              return next;
            });
            break;
          case 'Enter':
          case ' ':
            e.preventDefault();
            e.stopPropagation();
            if (filteredTvChannels[focusedListIdx]) {
              const targetCh = filteredTvChannels[focusedListIdx];
              const realIdx = channels.findIndex(c => c.id === targetCh.id);
              if (realIdx >= 0) setCurrentIdx(realIdx);
            }
            setIsTvListOpen(false);
            triggerOsd();
            break;
          case 'ArrowRight':
          case 'Escape':
          case 'BackSpace':
            e.preventDefault();
            e.stopPropagation();
            setIsTvListOpen(false);
            break;
        }
      } else {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            setFocusedListIdx(currentIdx);
            setIsTvListOpen(true);
            setTimeout(() => {
              const el = document.getElementById(`tv-ch-item-${currentIdx}`);
              if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
            }, 50);
            break;
          case 'ArrowUp':
          case 'PageUp':
            e.preventDefault();
            handlePrev();
            break;
          case 'ArrowDown':
          case 'PageDown':
            e.preventDefault();
            handleNext();
            break;
          case 'Enter':
            e.preventDefault();
            triggerOsd();
            break;
          case 'Escape':
          case 'BackSpace':
            e.preventDefault();
            onClose();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleTvKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleTvKeyDown, { capture: true });
  }, [isTvListOpen, focusedListIdx, currentIdx, channels, filteredTvChannels, handleNext, handlePrev, onClose, triggerOsd]);

  if (isAndroidTvDevice() && !adFreeState.isActive && !adFreeState.isAdFree) {
    return <AndroidTvVipGate onActivated={setAdFreeState} />;
  }

  if (!activeChannel) {
    return (
      <div className="w-full h-full bg-[#090A10] flex items-center justify-center text-white font-sans">
        <p className="text-[#C9D1E0]">Loading system channel list...</p>
      </div>
    );
  }

  return (
    <div
      onMouseMove={triggerOsd}
      className="w-full h-screen bg-[#090A10] overflow-hidden relative select-none font-sans"
    >
      {/* Video Player Core */}
      <VideoPlayer
        channel={activeChannel}
        allChannels={channels}
        onSelectChannel={(ch) => {
          const idx = channels.findIndex(c => c.id === ch.id);
          if (idx >= 0) {
            setCurrentIdx(idx);
            setFocusedListIdx(idx);
            triggerOsd();
          }
        }}
        onNext={handleNext}
        onPrev={handlePrev}
        onClose={onClose}
        onChannelError={onChannelError}
        adFreeState={adFreeState}
        onRewardedGranted={(st) => setAdFreeState(st)}
        initialMode="smart-tv"
        detectedLocation={detectedLocation}
        locationSource={locationSource}
      />



      {/* Android TV Quick Channel List Drawer */}
      <AnimatePresence>
        {isTvListOpen && (
          <motion.div
            initial={{ opacity: 0, x: -340 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -340 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-0 bottom-0 left-0 w-80 sm:w-96 z-50 bg-[#090A10]/98 backdrop-blur-2xl border-r border-amber-400/45 p-4 flex flex-col shadow-2xl pointer-events-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2 text-white">
                <Radio className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-black text-sm tracking-wide uppercase">Android TV Guide</h3>
                  <span className="text-[10px] font-mono text-amber-400 font-bold">
                    {filteredTvChannels.length.toLocaleString()} Channels
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTvListOpen(false)}
                className="px-3 h-10 rounded-lg player-ctrl-btn-danger text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Close Drawer"
              >
                <X className="w-4 h-4 text-rose-300 shrink-0" />
                <span>Close</span>
              </button>
            </div>

            {/* Search Filter */}
            <div className="relative mb-2.5">
              <Search className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Search TV channels"
                value={tvSearch}
                onChange={(e) => setTvSearch(e.target.value)}
                placeholder="Search TV channels..."
                className="w-full min-h-[40px] pl-9 pr-10 py-2 bg-[#10121C] border border-amber-400/35 rounded-lg text-xs text-white placeholder-[#C9D1E0]/60 focus:outline-none focus:border-amber-400"
              />
              {tvSearch && (
                <button
                  type="button"
                  aria-label="Clear TV channel search"
                  onClick={() => setTvSearch('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-[#C9D1E0] hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4 shrink-0" />
                </button>
              )}
            </div>

            {/* Hint */}
            <div className="text-[11px] text-[#C9D1E0] pb-2 flex items-center justify-between font-mono">
              <span>▲/▼ : Navigate</span>
              <span>OK : Select</span>
              <span>►/ESC : Close</span>
            </div>

            {/* Scrollable System Channel List */}
            <div 
              ref={listContainerRef} 
              className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1"
            >
              {filteredTvChannels.slice(0, 300).map((ch, idx) => {
                const isSelected = ch.id === activeChannel.id;
                const isFocused = idx === focusedListIdx;
                const chNum = `CH ${String(idx + 1).padStart(3, '0')}`;

                return (
                  <button
                    type="button"
                    key={ch.id || idx}
                    id={`tv-ch-item-${idx}`}
                    onClick={() => {
                      const realIdx = channels.findIndex(c => c.id === ch.id);
                      if (realIdx >= 0) setCurrentIdx(realIdx);
                      setFocusedListIdx(idx);
                      setIsTvListOpen(false);
                      triggerOsd();
                    }}
                    className={`w-full min-h-[48px] flex items-center justify-between p-2.5 rounded-lg text-left cursor-pointer transition-all duration-150 ${
                      isFocused
                        ? 'sidebar-square-btn-active text-white scale-[1.01]'
                        : isSelected
                        ? 'bg-[#1D2133] border border-amber-400/70 text-amber-300'
                        : 'sidebar-square-btn text-[#C9D1E0]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 mr-2">
                      <span className={`font-mono text-xs font-bold shrink-0 tabular-nums ${isFocused || isSelected ? 'text-amber-400' : 'text-[#C9D1E0]/70'}`}>
                        {chNum}
                      </span>

                      <ChannelThumbnail
                        channel={ch}
                        variant="compact-list"
                      />

                      <div className="min-w-0">
                        <h4 className="text-xs font-bold truncate text-white">
                          {ch.name}
                        </h4>
                        <span className="text-[10px] text-[#C9D1E0] truncate block">
                          {ch.category || 'Live'}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SmartTvPlayer;
