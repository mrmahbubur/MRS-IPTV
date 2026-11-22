import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Channel } from '../types';
import { ChannelThumbnail } from './ChannelThumbnail';
import {
  CHANNEL_GUIDE_REGION_OPTIONS,
  getStoredChannelRegionOverride,
  prioritizeRegionalChannelsClient,
  resolveRegionChoice,
  setStoredChannelRegionOverride,
} from '../lib/geoChannelNumbering';
import { Check, ChevronDown, Globe, Play, RefreshCw, Search, Star, Tv, X } from 'lucide-react';

export type GuidePlaybackStatus = 'connecting' | 'playing' | 'autoplay-blocked' | 'error';

interface ChannelListeningPanelProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  activeChannel: Channel;
  confirmedPlayingChannelId: string | null;
  playbackStatus: GuidePlaybackStatus;
  playbackError: string | null;
  isSwitching: boolean;
  onSelectChannel: (channel: Channel) => void;
  onRetry: () => void;
  onTapToPlay?: () => void;
  favorites: string[];
  onToggleFavorite: (channelId: string, e?: React.MouseEvent) => void;
  detectedLocation: { country: string; region: string | null; regionLabel: string } | null;
  locationSource: 'network-estimate' | 'unavailable';
  isMobileLayout?: boolean;
  restoreFocusToRef?: React.RefObject<HTMLButtonElement | null>;
}

const INITIAL_RENDER_LIMIT = 180;

export const ChannelListeningPanel: React.FC<ChannelListeningPanelProps> = ({
  isOpen,
  onClose,
  channels,
  activeChannel,
  confirmedPlayingChannelId,
  playbackStatus,
  playbackError,
  isSwitching,
  onSelectChannel,
  onRetry,
  onTapToPlay,
  favorites,
  onToggleFavorite,
  detectedLocation,
  locationSource,
  isMobileLayout = false,
  restoreFocusToRef,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [regionOverride, setRegionOverride] = useState<string | null>(() => getStoredChannelRegionOverride());
  const [isRegionPickerOpen, setIsRegionPickerOpen] = useState(false);
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);

  // Sync external region overrides stored in localStorage
  useEffect(() => {
    const syncRegion = () => setRegionOverride(getStoredChannelRegionOverride());
    window.addEventListener('mrs_guide_region_changed', syncRegion);
    return () => window.removeEventListener('mrs_guide_region_changed', syncRegion);
  }, []);

  // Focus search input when opening; restore focus to #channels-open trigger on close
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setRenderLimit(INITIAL_RENDER_LIMIT);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } else if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      setIsRegionPickerOpen(false);
      requestAnimationFrame(() => {
        const fallbackBtn = document.getElementById('channels-open') as HTMLButtonElement | null;
        (restoreFocusToRef?.current || fallbackBtn)?.focus();
      });
    }
  }, [isOpen, restoreFocusToRef]);

  // Escape closes the guide panel & returns focus cleanly
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isRegionPickerOpen) {
          setIsRegionPickerOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isRegionPickerOpen, onClose]);

  const effectiveLocation = useMemo(() => {
    if (regionOverride) {
      return resolveRegionChoice(regionOverride);
    }
    return detectedLocation;
  }, [regionOverride, detectedLocation]);

  // Order-only regional prioritization: never restricts full catalog or stops active playback
  const regionallyOrderedChannels = useMemo(() => {
    return prioritizeRegionalChannelsClient(channels, effectiveLocation);
  }, [channels, effectiveLocation]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ch of regionallyOrderedChannels) {
      const cat = (ch.category || 'General').trim();
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([name]) => name);
    return ['all', 'favorites', ...sorted];
  }, [regionallyOrderedChannels]);

  const filteredChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return regionallyOrderedChannels.filter((ch) => {
      if (selectedCategory === 'favorites') {
        if (!favorites.includes(ch.id)) return false;
      } else if (selectedCategory !== 'all') {
        if ((ch.category || 'General').trim().toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
      }
      if (!q) return true;
      return (
        ch.name.toLowerCase().includes(q) ||
        (ch.category || '').toLowerCase().includes(q) ||
        (ch.currentProgram || '').toLowerCase().includes(q) ||
        (ch.audioLanguage || '').toLowerCase().includes(q) ||
        String(ch.number || '').includes(q)
      );
    });
  }, [regionallyOrderedChannels, selectedCategory, searchQuery, favorites]);

  const displayedChannels = useMemo(() => {
    return filteredChannels.slice(0, renderLimit);
  }, [filteredChannels, renderLimit]);

  const regionDisplayText = useMemo(() => {
    if (effectiveLocation?.regionLabel) {
      return `Channels near ${effectiveLocation.regionLabel} · Change`;
    }
    if (locationSource === 'unavailable' && !regionOverride) {
      return 'Choose region';
    }
    return 'Choose region';
  }, [effectiveLocation, locationSource, regionOverride]);

  const liveStatusMessage = useMemo(() => {
    if (playbackStatus === 'error') {
      return playbackError || `Unable to play ${activeChannel.name}. Retry or choose another channel.`;
    }
    if (playbackStatus === 'autoplay-blocked') {
      return `${activeChannel.name} is ready — tap Play to enable audio playback.`;
    }
    if (isSwitching || playbackStatus === 'connecting') {
      return `Connecting to ${activeChannel.name}…`;
    }
    if (confirmedPlayingChannelId === activeChannel.id && playbackStatus === 'playing') {
      return `Now playing ${activeChannel.name}. Showing ${filteredChannels.length.toLocaleString()} channels.`;
    }
    return `Showing ${filteredChannels.length.toLocaleString()} channels.`;
  }, [
    playbackStatus,
    playbackError,
    activeChannel.name,
    activeChannel.id,
    isSwitching,
    confirmedPlayingChannelId,
    filteredChannels.length,
  ]);

  const handleSelectRegionOption = (code: string) => {
    setStoredChannelRegionOverride(code === 'AUTO' ? null : code);
    setRegionOverride(code === 'AUTO' ? null : code);
    setIsRegionPickerOpen(false);
  };

  return (
    <section
      ref={panelRef}
      id="channel-guide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="channel-guide-title"
      aria-hidden={!isOpen}
      hidden={!isOpen}
      onClick={(e) => e.stopPropagation()}
      className={
        isOpen
          ? isMobileLayout
            ? 'fixed inset-x-0 bottom-0 top-[36vh] z-[75] flex flex-col bg-[#080C18]/98 border-t border-white/15 shadow-[0_-20px_50px_rgba(0,0,0,0.85)] backdrop-blur-xl text-white'
            : 'w-[280px] sm:w-[340px] lg:w-[400px] max-w-[82vw] h-full shrink-0 flex flex-col bg-[#080C18] border-l border-white/12 shadow-2xl text-white z-40'
          : 'hidden'
      }
    >
      {/* Header Row */}
      <div className="px-3.5 py-3 bg-[#0B1020] border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Tv className="w-4 h-4 text-[#F5B301] shrink-0" />
            <h2 id="channel-guide-title" className="text-sm font-extrabold tracking-tight text-white truncate">
              Channels ({filteredChannels.length.toLocaleString()})
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setIsRegionPickerOpen((prev) => !prev)}
            aria-expanded={isRegionPickerOpen}
            aria-label="Change preferred channel region order"
            className="mt-1 inline-flex items-center gap-1.5 min-h-[28px] text-[11px] font-medium text-[#38BDF8] hover:text-white transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B301] rounded"
          >
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{regionDisplayText}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${isRegionPickerOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <button
          ref={closeButtonRef}
          id="channels-close"
          type="button"
          aria-label="Close channels panel"
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[#C9D1E0] hover:text-white transition-colors motion-reduce:transition-none cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B301]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Inline Region Override Picker (Order-only; never stops playback) */}
      {isRegionPickerOpen && (
        <div className="px-3.5 py-2.5 bg-[#0E1528] border-b border-white/10 shrink-0 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[#C9D1E0]">
            <span>Order regional channels first (does not interrupt playback)</span>
            <button
              type="button"
              onClick={() => setIsRegionPickerOpen(false)}
              className="text-[#F5B301] font-bold hover:underline cursor-pointer"
            >
              Done
            </button>
          </div>
          <label htmlFor="region-override-select" className="sr-only">
            Select preferred region
          </label>
          <select
            id="region-override-select"
            value={regionOverride || 'AUTO'}
            onChange={(e) => handleSelectRegionOption(e.target.value)}
            className="w-full min-h-[44px] px-3 rounded-lg bg-[#050816] border border-white/20 text-xs font-semibold text-white focus:outline-none focus:border-[#F5B301]"
          >
            {CHANNEL_GUIDE_REGION_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.flagEmoji} {opt.regionLabel}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Full-Catalog Search + Category Tabs */}
      <div className="px-3.5 pt-2.5 pb-2 bg-[#080C18] border-b border-white/10 shrink-0 space-y-2">
        <div className="relative">
          <label htmlFor="channel-search" className="sr-only">
            Search channels
          </label>
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            id="channel-search"
            type="search"
            autoComplete="off"
            aria-label="Search all channels"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setRenderLimit(INITIAL_RENDER_LIMIT);
            }}
            placeholder={`Search ${channels.length.toLocaleString()} channels...`}
            className="w-full min-h-[44px] pl-9 pr-9 rounded-lg bg-white/[0.06] border border-white/15 text-xs text-white placeholder-[#94A3B8] focus:outline-none focus:border-[#F5B301]"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear channel search"
              onClick={() => setSearchQuery('')}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-[#C9D1E0] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div
          id="channel-categories"
          role="tablist"
          aria-label="Filter channels by category"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
        >
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            const label = cat === 'all' ? 'All' : cat === 'favorites' ? `Favorites (${favorites.length})` : cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setSelectedCategory(cat);
                  setRenderLimit(INITIAL_RENDER_LIMIT);
                }}
                className={`min-h-[36px] px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B301] ${
                  isActive
                    ? 'bg-[#F5B301] text-[#050816] border-[#F5B301]'
                    : 'bg-white/[0.04] text-[#C9D1E0] border-white/10 hover:bg-white/[0.1] hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Status & Accessible Retry / Tap-to-Play Region */}
      <div className="px-3.5 py-2 bg-[#0B1020] border-b border-white/10 shrink-0 flex items-center justify-between gap-2">
        <p
          id="channel-guide-status"
          role="status"
          aria-live="polite"
          className={`text-[11px] leading-snug min-w-0 flex-1 ${
            playbackStatus === 'error'
              ? 'text-rose-300 font-semibold'
              : playbackStatus === 'autoplay-blocked'
              ? 'text-amber-300 font-semibold'
              : 'text-[#C9D1E0]'
          }`}
        >
          {liveStatusMessage}
        </p>

        {playbackStatus === 'error' && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[36px] px-3 rounded-lg bg-[#F5B301] text-[#050816] text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 cursor-pointer hover:bg-[#F5B301]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        )}

        {playbackStatus === 'autoplay-blocked' && onTapToPlay && (
          <button
            type="button"
            onClick={onTapToPlay}
            className="min-h-[36px] px-3 rounded-lg bg-[#F5B301] text-[#050816] text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 cursor-pointer hover:bg-[#F5B301]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Tap to Play</span>
          </button>
        )}
      </div>

      {/* Channel List (<ul id="channel-list"> with real <button> rows inside each <li>) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {displayedChannels.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-2">
            <p className="text-xs font-semibold text-white">No matching channels found</p>
            <p className="text-[11px] text-[#94A3B8]">
              Try clearing your search or switching back to All categories.
            </p>
            {(searchQuery || selectedCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="mt-2 min-h-[44px] px-4 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <ul
              id="channel-list"
              aria-label="Available channels"
              onKeyDown={(e) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-channel-row="true"]')
                );
                if (!buttons.length) return;
                const activeIdx = buttons.findIndex((b) => b === document.activeElement);
                e.preventDefault();
                if (e.key === 'Home') {
                  buttons[0]?.focus();
                } else if (e.key === 'End') {
                  buttons[buttons.length - 1]?.focus();
                } else if (e.key === 'ArrowDown') {
                  buttons[Math.min(buttons.length - 1, Math.max(0, activeIdx + 1))]?.focus();
                } else if (e.key === 'ArrowUp') {
                  buttons[Math.max(0, activeIdx - 1)]?.focus();
                }
              }}
              className="space-y-1"
            >
              {displayedChannels.map((ch, idx) => {
                const isSelected = ch.id === activeChannel.id;
                const isActuallyPlaying =
                  confirmedPlayingChannelId === ch.id && playbackStatus === 'playing';
                const isConnectingRow =
                  isSelected && (isSwitching || playbackStatus === 'connecting');
                const isErrorRow = isSelected && playbackStatus === 'error';
                const isBlockedRow = isSelected && playbackStatus === 'autoplay-blocked';
                const isFav = favorites.includes(ch.id);
                const chNum = String(ch.number ?? idx + 1).padStart(3, '0');
                const subtitleParts = [
                  ch.category || 'Live TV',
                  ch.currentProgram && ch.currentProgram !== 'No Program Found'
                    ? ch.currentProgram
                    : ch.audioLanguage || 'Live',
                ].filter(Boolean);

                return (
                  <li
                    key={`${ch.id}-${idx}`}
                    className={`flex items-center gap-1 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-[#F5B301]/12 border-[#F5B301]/60'
                        : 'bg-white/[0.02] hover:bg-white/[0.06] border-transparent'
                    }`}
                  >
                    <button
                      type="button"
                      data-channel-row="true"
                      onClick={() => onSelectChannel(ch)}
                      aria-current={isActuallyPlaying ? 'true' : undefined}
                      className="flex-1 min-w-0 min-h-[52px] px-2.5 py-2 flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B301] rounded-l-xl motion-reduce:transition-none"
                    >
                      <span className="font-mono text-[11px] font-bold text-[#94A3B8] w-9 shrink-0">
                        {chNum}
                      </span>

                      <ChannelThumbnail channel={ch} variant="compact-list" />

                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-[#F5B301]' : 'text-white'}`}>
                          {ch.name}
                        </p>
                        <p className="text-[11px] text-[#C9D1E0] truncate">
                          {subtitleParts.join(' · ')}
                        </p>
                      </div>

                      {isActuallyPlaying && (
                        <span className="text-[11px] font-bold text-[#2ECC71] flex items-center gap-1 shrink-0 whitespace-nowrap">
                          <Check className="w-3.5 h-3.5" />
                          <span>Playing</span>
                        </span>
                      )}
                      {isConnectingRow && !isActuallyPlaying && (
                        <span className="text-[11px] font-semibold text-[#F5B301] shrink-0 whitespace-nowrap">
                          Connecting…
                        </span>
                      )}
                      {isBlockedRow && (
                        <span className="text-[11px] font-bold text-amber-300 shrink-0 whitespace-nowrap">
                          Tap Play
                        </span>
                      )}
                      {isErrorRow && (
                        <span className="text-[11px] font-bold text-rose-400 shrink-0 whitespace-nowrap">
                          Offline
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label={isFav ? `Remove ${ch.name} from favorites` : `Add ${ch.name} to favorites`}
                      aria-pressed={isFav}
                      onClick={(e) => onToggleFavorite(ch.id, e)}
                      className="min-w-[44px] min-h-[44px] mr-1 flex items-center justify-center rounded-lg text-[#C9D1E0] hover:text-[#F5B301] hover:bg-white/10 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B301]"
                    >
                      <Star className={`w-4 h-4 ${isFav ? 'fill-[#F5B301] text-[#F5B301]' : ''}`} />
                    </button>
                  </li>
                );
              })}
            </ul>

            {filteredChannels.length > displayedChannels.length && (
              <div className="pt-2 pb-4 px-1">
                <button
                  type="button"
                  onClick={() => setRenderLimit((prev) => prev + 250)}
                  className="w-full min-h-[44px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-bold text-[#F5B301] cursor-pointer transition-colors"
                >
                  Show more channels ({(filteredChannels.length - displayedChannels.length).toLocaleString()} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
